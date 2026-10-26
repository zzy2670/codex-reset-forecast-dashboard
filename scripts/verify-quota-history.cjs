'use strict';
const {_electron}=require('playwright-core');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {makeDemo}=require('./demo-state.cjs');
const root=path.resolve(__dirname,'..'),now=Date.now(),iso=ms=>new Date(ms).toISOString();
const profile=`quota-history-${Date.now()}`;
function fixture(language,withLocal=true){
 const demo=makeDemo(now,{language});
 demo.settings={...demo.settings,bodyFontSize:22,notify:false,sound:false,autoStart:false,timeZone:'Asia/Shanghai'};
 demo.history[0].text='Recorded completion from an unusually long source description. '.repeat(12);
 // Deliberately share one instant with a public record: no temporal association
 // may attach a personal balance to that official record.
 demo.localQuotaHistory=withLocal?[100,0,null].map((before,i)=>({
  id:`quota-reset:codex:primary:${iso(now+(i+1)*86400000)}`,
  type:'local',at:iso(now-48*3600000+i*1000),bucketId:'codex',windowKey:'primary',
  beforeRemainingPercent:before,afterRemainingPercent:100,beforeFetchedAt:iso(now-48*3600000+i*1000-30000),
  resetsAt:iso(now+(i+1)*86400000),sources:[],
 })):[];
 return demo;
}
async function main(){
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const application=await _electron.launch({executablePath:process.env.DASHBOARD_TEST_EXE||require('electron'),args:[...(process.env.DASHBOARD_TEST_EXE?[]:[root]),'--verification-test',`--verification-profile=${profile}`],env,timeout:60000});
 const errors=[],network=[];
 try{
  const page=await application.firstWindow();
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});
  await page.waitForFunction(()=>typeof render==='function'&&!!state?.settings);
  const userData=await application.evaluate(({app})=>app.getPath('userData'));
  assert.ok(userData.includes(profile),'Must use an isolated verification profile');
  await page.evaluate(value=>{const RealDate=Date;window.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[value]));}static now(){return value;}};},now);
  const layouts=[];
  for(const language of ['zh-CN','en','zh-CN']){
   // Exercise the actual language setting before supplying the synthetic view.
   await page.locator('#settings-button').click();
   await page.locator('#setting-language').selectOption(language);
   await page.waitForFunction(l=>document.documentElement.lang===l,language);
   await page.locator('[data-close="settings-dialog"]').click();
   await page.evaluate(demo=>render(demo),fixture(language,false));
   const calendarBefore=await page.locator('#reset-calendar').innerHTML();
   await page.evaluate(demo=>render(demo),fixture(language));
   assert.equal(await page.locator('#reset-calendar').innerHTML(),calendarBefore,'Local refills must not alter the official reset calendar');
   assert.equal(await page.locator('.history-row.history-local').count(),3,'Same-day refills must stay separate');
   assert.equal(await page.locator('.history-row:not(.history-local) .history-quota-before').count(),0,'Official rows must not receive a guessed personal value');
   const local=page.locator('.history-row.history-local');
   const values=await local.locator('.history-quota-before strong').allTextContents();
   assert.deepEqual(values,['100%','0%',language==='en'?'Not recorded':'未记录'].reverse(),'Newest-first local records preserve 100%, 0%, and unknown');
   const labels=await local.locator('.history-quota-before').allTextContents();
   assert.ok(labels.every(t=>t.includes(language==='en'?'Remaining before refill':'补充前剩余')),'All refill rows have translated labels');
   for(const width of [860,1440]){
    const contentWidth=await application.evaluate(({BrowserWindow},w)=>{const win=BrowserWindow.getAllWindows()[0];win.setContentSize(w,1000);return win.getContentBounds().width;},width);
    await page.waitForFunction(w=>Math.abs(innerWidth-w)<=1,contentWidth);
    await page.evaluate(demo=>render(demo),fixture(language));
    const metrics=await page.evaluate(()=>({
     width:innerWidth,pageOverflow:document.documentElement.scrollWidth>innerWidth+1,
     rows:[...document.querySelectorAll('.history-local')].map(row=>{
      const badge=row.querySelector('.history-quota-before'),content=row.querySelector('.history-content'),value=badge.querySelector('strong');
      const a=badge.getBoundingClientRect(),b=content.getBoundingClientRect(),r=row.getBoundingClientRect(),v=value.getBoundingClientRect();
      return {badgeRight:a.right,rowRight:r.right,badgeLeft:a.left,contentRight:b.right,badgeWidth:a.width,valueWidth:v.width,
       badgeHeight:a.height,valueHeight:v.height,fontSize:parseFloat(getComputedStyle(value).fontSize),
       badgeOverflow:badge.scrollWidth>badge.clientWidth+1};
     }),
    }));
    assert.equal(metrics.pageOverflow,false,`Page overflow: ${language} ${width}`);
    for(const row of metrics.rows){
     assert.ok(row.badgeWidth>0&&row.valueHeight>0,'Quota value must be visible');
     assert.ok(row.badgeRight<=row.rowRight+1,'Quota badge fits its record');
     assert.ok(row.badgeLeft>=row.contentRight-1,'Quota badge remains on the right without overlapping the description');
     assert.equal(row.badgeOverflow,false,'Quota label/value must not overflow at maximum font size');
     assert.ok(row.fontSize>=22,'Quota value remains prominent at maximum body font size');
    }
    layouts.push({language,...metrics});
   }
  }
  if(process.env.DASHBOARD_HISTORY_SCREENSHOT){
   const screenshot=process.env.DASHBOARD_HISTORY_SCREENSHOT;
   assert.ok(path.isAbsolute(screenshot),'History screenshot path must be absolute');
   const contentWidth=await application.evaluate(({BrowserWindow})=>{const win=BrowserWindow.getAllWindows()[0];win.setContentSize(1440,1000);return win.getContentBounds().width;});
   await page.waitForFunction(w=>Math.abs(innerWidth-w)<=1,contentWidth);
   const demo=fixture('zh-CN');demo.settings.bodyFontSize=13;
   await page.evaluate(view=>render(view),demo);
   await page.addStyleTag({content:'*,*::before,*::after{scroll-behavior:auto!important;animation:none!important;transition:none!important}'});
   fs.mkdirSync(path.dirname(screenshot),{recursive:true});
   // Hidden Electron windows can stall locator auto-scrolling; capture the
   // complete synthetic page without moving the native window or its focus.
   await page.screenshot({path:screenshot,fullPage:true,animations:'disabled'});
  }
  assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
  console.log(JSON.stringify({ok:true,profile,checks:['real language control','three same-day refills','100% and 0%','unknown historical value','official rows unmodified','official calendar unchanged','22px narrow and wide layouts'],layouts,errors,networkRequests:network.length},null,2));
 }finally{await application.close();}
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
