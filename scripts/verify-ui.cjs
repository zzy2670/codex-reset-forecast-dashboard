'use strict';
const {_electron}=require('playwright-core'),assert=require('node:assert/strict'),path=require('node:path');
const {makeDemo,demoNow}=require('./demo-state.cjs');
const root=path.resolve(__dirname,'..');
async function main(){
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const application=await _electron.launch({executablePath:process.env.DASHBOARD_TEST_EXE||require('electron'),args:[...(process.env.DASHBOARD_TEST_EXE?[]:[root]),'--verification-test',`--verification-profile=ui-${Date.now()}`],env,timeout:60000});
 try{
 const page=await application.firstWindow();await page.waitForFunction(()=>typeof render==='function');
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const http=[];page.on('request',r=>{if(/^https?:/.test(r.url()))http.push(r.url());});
 await page.evaluate(({now,demo})=>{const RealDate=Date;window.Date=class extends RealDate{constructor(...a){super(...(a.length?a:[now]));}static now(){return now;}};render(demo);},{now:demoNow,demo:makeDemo(demoNow,{alert:true,range:true})});
 assert.equal(await page.locator('.forecast-line').count(),2);
 assert.equal(await page.locator('body.reset-alert').count(),1);
 assert.equal(await page.locator('.source-card').count(),5);
 await page.locator('#settings-button').click();
 const residual=()=>page.evaluate(()=>{const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT),out=[];let n;while(n=w.nextNode())if(/[\u4e00-\u9fff]/.test(n.nodeValue)&&!n.parentElement.closest('script,style,[data-original],option[value="zh-CN"]'))out.push(n.nodeValue);for(const e of document.querySelectorAll('[title],[aria-label],[placeholder]'))for(const a of ['title','aria-label','placeholder'])if(/[\u4e00-\u9fff]/.test(e.getAttribute(a)||''))out.push(e.getAttribute(a));return [...new Set(out)];});
 const untranslated=await residual();
 console.log(JSON.stringify({englishResidual:untranslated},null,2));
 await page.locator('#setting-language').selectOption('zh-CN');await page.waitForFunction(()=>document.documentElement.lang==='zh-CN');
 await page.locator('#setting-language').selectOption('en');await page.waitForFunction(()=>document.documentElement.lang==='en');
 assert.equal((await page.evaluate(()=>window.dashboard.get())).settings.language,'en');
 await page.locator('[data-close="settings-dialog"]').click();
 for(const kind of ['missing','expired']){
  const demo=makeDemo(demoNow,{alert:true});demo.history[0].text='';
  if(kind==='missing'){demo.quota=null;demo.quotaDisplay=null;demo.consensus={state:'unavailable'};demo.sources.forEach(s=>{s.forecast={state:'none'};s.lastReset=null;s.status='loading';});}
  else demo.sources.forEach(s=>{s.updatedAt=new Date(demoNow-3600000).toISOString();});
  await page.evaluate(d=>render(d),demo);const remaining=await residual();assert.deepEqual(remaining,[],`English ${kind} states: ${remaining.join(' | ')}`);
 }
 const layouts=[];
 for(const width of [860,1320,1800]){
   const actual=await application.evaluate(({BrowserWindow},w)=>{const win=BrowserWindow.getAllWindows()[0];win.setContentSize(w,1000);return win.getContentBounds().width;},width);
   await page.waitForFunction(w=>Math.abs(innerWidth-w)<=1,actual);
  await page.evaluate(demo=>{demo.settings.bodyFontSize=22;render(demo);},makeDemo(demoNow,{alert:true,range:true}));
  await page.waitForTimeout(150);
  const metrics=await page.evaluate(()=>{const tracks=[...document.querySelectorAll('.track')].map(e=>e.getBoundingClientRect()),m=document.getElementById('forecast-markers').getBoundingClientRect();return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,trackLefts:tracks.map(r=>r.x),markerLeft:m.x,markerWidth:m.width,trackWidth:tracks[0].width};});
  if(metrics.overflow)console.log(await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>({tag:e.tagName,id:e.id,cls:e.className,right:e.getBoundingClientRect().right})).slice(0,25)));
  assert.equal(metrics.overflow,false,`Page overflow at ${width}`);assert.ok(metrics.trackLefts.every(x=>Math.abs(x-metrics.markerLeft)<1));assert.ok(Math.abs(metrics.markerWidth-metrics.trackWidth)<1);layouts.push(metrics);
 }
 await page.evaluate(()=>openEvents());
 assert.equal(await page.locator('#events-dialog').evaluate(e=>e.open),true);
 assert.equal(errors.length,0);assert.equal(http.length,0);
 console.log(JSON.stringify({ok:true,layouts,errors,networkRequests:http.length}));
 if(untranslated.length)throw new Error('English interface has untranslated labels');
 }finally{await application.close();}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
