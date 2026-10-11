'use strict';
const {_electron}=require('playwright-core'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {makeDemo,demoNow}=require('./demo-state.cjs');
const {changes,SOURCES}=require('../app/core.cjs'),{mergeMessage}=require('../app/notification-policy.cjs');
const root=path.resolve(__dirname,'..'),profile=`language-${Date.now()}`,results=[];
let application,page;
const errors=[],http=[];
async function launch(){
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 application=await _electron.launch({executablePath:process.env.DASHBOARD_TEST_EXE||require('electron'),args:[...(process.env.DASHBOARD_TEST_EXE?[]:[root]),'--verification-test',`--verification-profile=${profile}`],env,timeout:60000});
 page=await application.firstWindow();page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))http.push(r.url());});
 await page.waitForFunction(()=>typeof state==='object'&&!!state?.settings);
}
async function verifyLabels(language){
 assert.equal(await page.locator('html').getAttribute('lang'),language);
 assert.equal(await page.locator('#quota-heading').innerText(),language==='en'?'My quota':'我的额度');
 assert.equal(await page.locator('#refresh').getAttribute('title'),language==='en'?'Check now':'立即检查');
 assert.equal(await page.title(),language==='en'?'Codex Reset Forecast Dashboard':'codex重置预测看板');
 assert.equal(await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getTitle()),language==='en'?'Codex Reset Forecast Dashboard':'codex重置预测看板');
}
async function switchLanguage(language){
 await page.locator('#settings-button').click();await page.locator('#setting-language').selectOption(language);
 await page.waitForFunction(l=>state.settings.language===l,language);await verifyLabels(language);
 assert.equal((await page.evaluate(()=>window.dashboard.get())).settings.language,language);
 await page.locator('[data-close="settings-dialog"]').click();
}
async function residual(){return page.evaluate(()=>{
 const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT),out=[];let n;
 while(n=w.nextNode())if(/[\u4e00-\u9fff]/.test(n.nodeValue)&&!n.parentElement.closest('script,style,[data-original],option[value="zh-CN"]'))out.push(n.nodeValue);
 for(const e of document.querySelectorAll('[title],[aria-label],[placeholder]'))for(const a of ['title','aria-label','placeholder'])if(/[\u4e00-\u9fff]/.test(e.getAttribute(a)||''))out.push(e.getAttribute(a));
 return [...new Set(out)];
});}
async function main(){try{
 await launch();
 for(const language of ['zh-CN','en','zh-CN','en'])await switchLanguage(language);
 const userData=await application.evaluate(({app})=>app.getPath('userData'));
 assert.ok(userData.includes(profile));assert.equal(JSON.parse(fs.readFileSync(path.join(userData,'dashboard-state.json'),'utf8')).settings.language,'en');
 await application.close();application=null;await launch();await verifyLabels('en');results.push('English restored after restart');
 await switchLanguage('zh-CN');await application.close();application=null;await launch();await verifyLabels('zh-CN');results.push('Chinese restored after restart');
 await switchLanguage('en');
 await page.evaluate(now=>{const RealDate=Date;window.Date=class extends RealDate{constructor(...a){super(...(a.length?a:[now]));}static now(){return now;}};},demoNow);
 for(const kind of ['normal','missing','expired','untimed','invalid','error','history-conflict','events']){
  const demo=makeDemo(demoNow,{alert:true,range:true});
  if(kind==='missing'){demo.quota=null;demo.quotaDisplay=null;demo.consensus={state:'unavailable'};demo.sources.forEach(s=>{s.forecast={state:'none'};s.lastReset=null;s.status='loading';});}
  if(kind==='expired')demo.sources.forEach(s=>{s.updatedAt=new Date(demoNow-3600000).toISOString();});
  if(kind==='untimed')demo.sources.forEach(s=>s.forecast={state:'untimed',type:'global',kindLabel:'全局重置',timingKind:'announcement',start:null,end:null,text:'',basis:'站方解析公告时间'});
  if(kind==='invalid')demo.sources.forEach(s=>s.forecast={...s.forecast,state:'invalid',start:new Date(demoNow+7200000).toISOString(),end:new Date(demoNow+3600000).toISOString(),text:''});
  if(kind==='error')demo.sources.forEach(s=>{s.status='error';s.lastReset=null;s.forecast={state:'none'};s.error='获取失败，保留上次信息；稍后自动重试。';});
  if(kind==='history-conflict')demo.history[0].timeConflict=true;
  if(kind==='events'){
   const previous={...SOURCES[0],status:'ok',fetchedAt:new Date(demoNow).toISOString(),updatedAt:new Date(demoNow).toISOString(),forecast:{state:'none'}};
   const next={...previous,lastReset:{id:'demo-done',type:'global',at:new Date(demoNow-60000).toISOString(),scope:{plans:['all']}}};
   const groups=[];demo.events=changes(previous,next,demoNow).map(e=>mergeMessage(groups,e,demoNow,'pro').event);
  }
  await page.evaluate(d=>{render(d);openSettings();},demo);
  let remaining=await residual();assert.deepEqual(remaining,[],`English ${kind}: ${remaining.join(' | ')}`);
  await page.locator('[data-close="settings-dialog"]').click();
  await page.evaluate(()=>{document.querySelectorAll('.source-more').forEach(d=>d.open=true);document.querySelectorAll('#history-list details').forEach(d=>d.open=true);openQuota();});
  remaining=await residual();assert.deepEqual(remaining,[],`English ${kind} details: ${remaining.join(' | ')}`);
  await page.locator('[data-close="quota-dialog"]').click();await page.evaluate(()=>openEvents());
  remaining=await residual();assert.deepEqual(remaining,[],`English ${kind} updates: ${remaining.join(' | ')}`);
  await page.locator('[data-close="events-dialog"]').click();results.push(`${kind}: labels, details and dialogs translated`);
 }
 assert.deepEqual(errors,[]);assert.deepEqual(http,[]);console.log(JSON.stringify({ok:true,results,errors,networkRequests:http.length},null,2));
 }finally{if(application)await application.close();}}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
