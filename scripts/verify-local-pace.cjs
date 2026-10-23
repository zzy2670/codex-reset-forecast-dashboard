'use strict';
const {_electron}=require('playwright-core'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {makeDemo}=require('./demo-state.cjs');
const root=path.resolve(__dirname,'..'),profile=`local-pace-${Date.now()}`,folder=path.join(os.tmpdir(),'CodexResetDashboard-verification',profile),file=path.join(folder,'dashboard-state.json');
const now=Date.now(),hour=3600000,day=24*hour,globalAnchor=now-70*hour,localAnchor=now-6*hour,iso=value=>new Date(value).toISOString();
let application,page;const errors=[],requests=[],results=[];
function fixture(){
 const data=makeDemo(now,{language:'zh-CN'}),url='https://x.com/thsottiaux/status/900002';data.schemaVersion=3;data.baseline=true;data.seen=[];data.events=[];
 Object.assign(data.settings,{notify:false,sound:false,autoStart:false,timeZone:'Asia/Shanghai',quotaWindow:'secondary',hypotheticalDays:3,hypotheticalEnabled:true});
 data.settings.calendarTarget={anchor:iso(globalAnchor),at:iso(now+2*day)};
 const proof=data.sources.map(source=>({id:source.id,name:source.name,family:source.family,url,at:iso(globalAnchor)}));
 data.history=[{id:'900002',at:iso(globalAnchor),type:'global',url,scope:{plans:['all']},sources:proof,familyCount:3,text:'Earlier public reset.'}];
 for(const source of data.sources){source.forecast={state:'none'};source.historyEvents=[];source.lastReset={id:'900002',at:iso(globalAnchor),type:'global',url,scope:{plans:['all']},text:'Earlier public reset.'};}
 data.quota={state:'ok',source:'local-codex',fetchedAt:iso(now),limits:[{id:'codex',name:'Codex',planType:'pro',primary:{usedPercent:9,durationMins:10080,resetsAt:iso(localAnchor+7*day)}}]};
 data.localReset={key:`quota-reset:codex:primary:${iso(localAnchor+7*day)}`,bucketId:'codex',windowKey:'primary',resetsAt:iso(localAnchor+7*day),observedAt:iso(localAnchor),kind:'quota-reset'};
 return data;
}
async function launch(seed){
 if(seed){fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(file,JSON.stringify(seed));}
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 application=await _electron.launch({executablePath:process.env.DASHBOARD_TEST_EXE||require('electron'),args:[...(process.env.DASHBOARD_TEST_EXE?[]:[root]),'--verification-test',`--verification-profile=${profile}`],env,timeout:60000});
 page=await application.firstWindow();page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(/^https?:/.test(request.url()))requests.push(request.url());});await page.waitForFunction(()=>typeof state==='object'&&state?.settings&&typeof render==='function');
}
async function stop(){await application.close();application=null;}
async function current(){return page.evaluate(()=>window.dashboard.get());}
async function assertPace(anchor,days){
 const snapshot=await current();assert.equal(snapshot.hypothetical.available,true);assert.equal(snapshot.hypothetical.anchor,iso(anchor));assert.equal(snapshot.hypothetical.days,days);assert.equal(snapshot.hypothetical.end,iso(anchor+days*day));
 const expected=Math.min(1,(Date.parse(snapshot.now)-anchor)/(days*day));assert.ok(Math.abs(snapshot.hypothetical.progress-expected)<1e-6);
 await page.evaluate(value=>{window.__localPaceNow=value;if(!window.__localPaceDate){const D=Date;window.__localPaceDate=D;window.Date=class extends D{constructor(...args){super(...(args.length?args:[window.__localPaceNow]));}static now(){return window.__localPaceNow;}};}tick();},Date.parse(snapshot.now));
 assert.equal(await page.locator('#hypothetical-percent').innerText(),Math.round(expected*100)+'%');
 const renderer=await page.evaluate(()=>PaceTiming.hypotheticalPace(state.consensus,state.settings.hypotheticalDays,Date.now(),state.history,{quota:state.quotaDisplay,localReset:state.localReset}));assert.equal(renderer.anchor,snapshot.hypothetical.anchor);assert.ok(Math.abs(renderer.progress-snapshot.hypothetical.progress)<1e-6);
 return snapshot;
}
async function assertCalendar(anchor){
 const value=await page.evaluate(()=>({model:PaceTiming.calendarPace(state.settings.calendarTarget,Date.now(),{quota:state.quotaDisplay,localReset:state.localReset}),target:state.settings.calendarTarget,width:parseFloat(document.querySelector('#calendar-fill').style.width),note:document.querySelector('#calendar-pace-note').textContent,now:Date.now()}));
 assert.equal(value.model.origin,'local');assert.equal(value.model.anchor,iso(anchor));assert.equal(value.model.end,value.target.at);const expected=(value.now-anchor)/(Date.parse(value.target.at)-anchor);assert.ok(Math.abs(value.model.progress-expected)<1e-8);assert.ok(Math.abs(value.width-expected*100)<.001);assert.match(value.note,/本机最近补充/);return value;
}
async function main(){try{
 await launch(fixture());let first=await assertPace(localAnchor,3);assert.equal(first.quotaDisplay.key,'primary');assert.equal(first.settings.quotaWindow,'secondary');assert.match(await page.locator('#hypothetical-note').innerText(),/本机最近补充/);assert.ok(first.hypothetical.progress>.08&&first.hypothetical.progress<.09);results.push('primary-only seven-day quota falls back from secondary and anchors the three-day bar to a real refill six hours ago');
 const corrected=await assertCalendar(localAnchor);assert.equal(corrected.target.anchor,iso(globalAnchor));results.push('an existing calendar deadline with an old global anchor uses the same actual local refill as the other pacing bars without changing its deadline');
 const calendar=JSON.stringify(first.settings.calendarTarget);await page.evaluate(()=>window.dashboard.saveSettings({hypotheticalDays:4}));first=await assertPace(localAnchor,4);assert.equal(JSON.stringify(first.settings.calendarTarget),calendar);assert.ok(first.hypothetical.progress>.06&&first.hypothetical.progress<.07);
 const note=await page.locator('#hypothetical-note').innerText();await page.locator('#settings-button').click();await page.locator('#setting-timezone').selectOption('UTC');await page.waitForFunction(()=>state.settings.timeZone==='UTC');await page.locator('[data-close="settings-dialog"]').click();first=await assertPace(localAnchor,4);assert.equal(JSON.stringify(first.settings.calendarTarget),calendar);assert.notEqual(await page.locator('#hypothetical-note').innerText(),note);results.push('changing manual days and timezone preserves the exact local anchor and independent calendar target');
 await stop();await launch();first=await assertPace(localAnchor,4);await assertCalendar(localAnchor);assert.equal(first.settings.timeZone,'UTC');results.push('local anchor, manual period and timezone survive restart');
 const invalid=await page.evaluate(({globalAnchor,hour})=>{
  const original={quota:state.quotaDisplay,localReset:state.localReset},base=()=>structuredClone(original),cases=[];
  for(const change of [o=>o.localReset.kind='observed-cycle',o=>o.localReset.bucketId='other',o=>o.localReset.windowKey='secondary',o=>o.localReset.resetsAt=new Date(Date.parse(o.localReset.resetsAt)+hour).toISOString()]){const options=base();change(options);const pace=PaceTiming.hypotheticalPace(state.consensus,3,Date.now(),state.history,options);cases.push({available:pace.available,anchor:pace.anchor});}
  const fallback=PaceTiming.hypotheticalPace({state:'unavailable'},3,Date.now(),state.history);
  return {cases,fallback,expected:new Date(globalAnchor).toISOString()};
 },{globalAnchor,hour});assert.ok(invalid.cases.every(p=>p.available&&p.anchor===invalid.expected));assert.equal(invalid.fallback.anchor,iso(globalAnchor));results.push('observed-cycle and mismatched bucket, window or end cannot replace the verified historical fallback');
 await stop();const stale=JSON.parse(fs.readFileSync(file,'utf8'));stale.quota.state='error';stale.quota.fetchedAt=iso(now-2*day);stale.sources.forEach(source=>{source.status='error';source.updatedAt=iso(now-2*day);source.fetchedAt=iso(now-2*day);});await launch(stale);first=await assertPace(localAnchor,4);await assertCalendar(localAnchor);assert.equal(first.quotaDisplay.stale,true);assert.match(await page.locator('#hypothetical-note').innerText(),/本机最近补充/);results.push('old source caches and failed quota refresh preserve an already confirmed local refill anchor');
 await stop();const updated=fixture(),newAnchor=now-5*60000;updated.quota.limits[0].primary.resetsAt=iso(newAnchor+7*day);updated.localReset={...updated.localReset,key:`quota-reset:codex:primary:${iso(newAnchor+7*day)}`,resetsAt:iso(newAnchor+7*day),observedAt:iso(newAnchor)};await launch(updated);first=await assertPace(newAnchor,3);assert.ok(first.hypothetical.progress<.003);results.push('a newly confirmed local cycle resets the manual pacing bar to its new low progress');
 const dayKey=require('../app/ui/reset-calendar.js').dateKey(now+day);const saved=await page.evaluate(day=>window.dashboard.saveSettings({calendarTarget:{day,hour:18}}),dayKey);assert.equal(saved.settings.calendarTarget.anchor,iso(newAnchor));await assertCalendar(newAnchor);results.push('confirming a changed calendar target saves the proven local anchor and immediately updates the same rendered pace');
 await page.locator('#settings-button').click();await page.locator('#setting-language').selectOption('en');await page.waitForFunction(()=>state.settings.language==='en');const calendarEnglish=await page.locator('#calendar-pace-note').innerText();assert.match(calendarEnglish,/From the latest local quota refill/);assert.doesNotMatch(calendarEnglish,/[\u4e00-\u9fff]/);await page.locator('#setting-language').selectOption('zh-CN');await page.waitForFunction(()=>state.settings.language==='zh-CN');await page.locator('[data-close="settings-dialog"]').click();results.push('the calendar local-refill explanation follows real language controls in both directions');
 await page.evaluate(value=>{window.__localPaceNow=value;tick();},newAnchor+3*day);assert.equal(await page.locator('#hypothetical-percent').innerText(),'100%');await page.evaluate(value=>{window.__localPaceNow=value;tick();},newAnchor+10*day);assert.equal(await page.locator('#hypothetical-percent').innerText(),'100%');const ended=await page.evaluate(()=>PaceTiming.hypotheticalPace(state.consensus,3,Date.now(),state.history,{quota:state.quotaDisplay,localReset:state.localReset}));assert.equal(ended.anchor,iso(newAnchor));assert.equal(ended.end,iso(newAnchor+3*day));results.push('expiry stays at 100 percent without inventing another cycle');
 await page.evaluate(()=>{const deadline=Date.parse(state.settings.calendarTarget.at),anchor=deadline+86400000,end=new Date(anchor+state.quotaDisplay.durationMins*60000).toISOString();window.__localPaceNow=anchor+3600000;state.quotaDisplay={...state.quotaDisplay,resetsAt:end};state.localReset={...state.localReset,resetsAt:end,observedAt:new Date(anchor).toISOString(),kind:'quota-reset'};tick();});assert.equal(await page.locator('#calendar-percent').innerText(),'100%');assert.equal(await page.locator('#calendar-clear').isEnabled(),true);results.push('a local refill after the selected deadline keeps the expired calendar bar at 100 percent and leaves its clear action available');
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);console.log(JSON.stringify({ok:true,results,errors,networkRequests:requests.length,testNotifications:false},null,2));
 }finally{if(application)await stop();}}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
