'use strict';
const {_electron}=require('playwright-core'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {makeDemo}=require('./demo-state.cjs'),{quotaView}=require('../app/codex-quota.cjs'),Policy=require('../app/notification-policy.cjs');
const root=path.resolve(__dirname,'..'),profile=`reset-quiet-${Date.now()}`,folder=path.join(os.tmpdir(),'CodexResetDashboard-verification',profile),file=path.join(folder,'dashboard-state.json');
const now=Date.now(),iso=t=>new Date(t).toISOString(),cycleStart=now-25*60000;
let application,page;const errors=[],http=[],results=[];
function fixture(){
 const s=makeDemo(now,{language:'zh-CN'});s.schemaVersion=3;s.baseline=true;s.seen=[];s.settings.notify=true;s.settings.autoStart=false;
 s.quota={state:'ok',source:'local-codex',fetchedAt:iso(now),limits:[{id:'codex',name:'Codex',planType:'pro',secondary:{usedPercent:2,durationMins:10080,resetsAt:iso(cycleStart+7*86400000)}}]};
 for(const [i,source] of s.sources.entries())source.forecast=i<2?{id:`old-${i}`,type:'global',kindLabel:'全局重置',state:'scheduled',scope:{plans:['all']},timingKind:'announcement',issuedAt:iso(now-2*3600000),start:iso(now+(17+i)*60000),end:iso(now+(17+i)*60000),url:source.url,text:'Original forecast before the reset'}:{state:'none'};
 const q=quotaView(s.quota,s.settings,now);s.events=[{key:`quota-reset:${q.bucketId}:${q.key}:${q.resetsAt}`,kind:'quota_reset',title:'本机额度已补充',body:'个人重置时间已更新',at:iso(cycleStart+1000),sourceId:null,read:true}];return s;
}
async function launch(){
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 application=await _electron.launch({executablePath:process.env.DASHBOARD_TEST_EXE||require('electron'),args:[...(process.env.DASHBOARD_TEST_EXE?[]:[root]),'--verification-test',`--verification-profile=${profile}`],env,timeout:60000});
 page=await application.firstWindow();page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))http.push(r.url());});
 await page.waitForFunction(()=>typeof state==='object'&&!!state?.settings);
}
async function stop(){await application.close();application=null;}
async function main(){try{
 fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(file,JSON.stringify(fixture()));await launch();
 assert.equal(await page.locator('body.reset-alert').count(),0);assert.equal(await page.locator('.forecast-line').count(),0);assert.equal(await page.locator('#forecast-markers').isVisible(),false);
 const snapshot=await page.evaluate(()=>window.dashboard.get());assert.equal(snapshot.sources[0].forecast.state,'none');assert.equal(snapshot.sources[1].forecast.state,'none');assert.equal(snapshot.sources[0].archivedForecasts[0].retiredReason,'local-reset');
 assert.equal((await page.locator('.forecast-value').allInnerTexts()).filter(x=>x==='无').length,5);results.push('Already-refilled cycle retires old source estimates and red line on first snapshot');await stop();
 const wide=fixture(),originalStart=iso(now+5*3600000),originalEnd=iso(now+9*3600000);
 wide.sources[2].forecast={...wide.sources[0].forecast,id:'six-hour-window',start:originalStart,end:originalEnd,precision:'window'};
 wide.sources[4].lastReset={id:'2100000000000000003',type:'global',at:iso(cycleStart+60000),url:'https://x.com/thsottiaux/status/2100000000000000003',text:'Completed reset'};
 fs.writeFileSync(file,JSON.stringify(wide));await launch();
 const clipped=(await page.evaluate(()=>window.dashboard.get())).sources[2].forecast;
 assert.equal(clipped.start,null);assert.equal(clipped.originalStart,originalStart);assert.equal(clipped.end,originalEnd);assert.equal(clipped.resetGapClipped,true);
 const wideCard=page.locator('.source-card').nth(2);await wideCard.locator('summary').click();
 assert.match(await wideCard.innerText(),/默认间隔 6 小时，仅显示原截止/);assert.match(await wideCard.innerText(),/已略去窗口起点/);
 await page.locator('#settings-button').click();await page.locator('#setting-language').selectOption('en');await page.waitForFunction(()=>state.settings.language==='en');
 assert.match(await wideCard.innerText(),/Default six-hour gap; showing the original deadline/);
 assert.doesNotMatch(await wideCard.innerText(),/[\u4e00-\u9fff]/);results.push('Six-hour default clips the old window start while retaining its deadline and bilingual evidence');await stop();
 const s=fixture(),q=quotaView(s.quota,s.settings,now);Policy.recoverLocalReset(s,q,now);
 const e={...s.events[0],bucketId:q.bucketId,windowKey:q.key,resetsAt:q.resetsAt},group=Policy.mergeMessage([],e,Date.parse(e.at),'pro').group;group.delivered=true;s.notificationGroups=[group];
 assert.equal(Policy.acknowledgeReset(s,Policy.notificationId(group.id),q,now).quietStarted,true);
 s.sources[2].forecast={...s.sources[0].forecast,id:'new-after-reset',issuedAt:iso(cycleStart+5*60000),start:iso(now+3600000),end:iso(now+3600000),text:'A new announcement published after the reset'};
 fs.writeFileSync(file,JSON.stringify(s));await launch();
 assert.equal(await page.locator('body.reset-alert').count(),1);assert.equal(await page.locator('.forecast-line').count(),1);
 const after=await page.evaluate(()=>window.dashboard.get());assert.equal(after.sources[2].forecast.id,'new-after-reset');assert.equal(after.resetQuietUntil,s.resetQuietUntil);
 await page.locator('#settings-button').click();assert.match(await page.locator('#notification-status').innerText(),/重置系统通知已静默至/);
 await page.locator('#setting-language').selectOption('en');await page.waitForFunction(()=>state.settings.language==='en');assert.match(await page.locator('#notification-status').innerText(),/Reset notifications muted until/);
 assert.doesNotMatch(await page.locator('#notification-status').innerText(),/[\u4e00-\u9fff]/);results.push('New post after refill keeps its own red line; quiet status follows language');await stop();
 await launch();assert.equal((await page.evaluate(()=>window.dashboard.get())).resetQuietUntil,s.resetQuietUntil);assert.equal(await page.locator('html').getAttribute('lang'),'en');await page.locator('#settings-button').click();assert.match(await page.locator('#notification-status').innerText(),/Reset notifications muted until/);results.push('Six-hour deadline and language survive restart');
 await page.evaluate(expiry=>{const RealDate=Date;window.Date=class extends RealDate{constructor(...a){super(...(a.length?a:[expiry]));}static now(){return expiry;}};tick();},Date.parse(s.resetQuietUntil));assert.doesNotMatch(await page.locator('#notification-status').innerText(),/muted until/);results.push('Quiet status ends exactly at the saved deadline');
 assert.deepEqual(errors,[]);assert.deepEqual(http,[]);console.log(JSON.stringify({ok:true,results,errors,networkRequests:http.length,testNotifications:false},null,2));
 }finally{if(application)await application.close();}}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
