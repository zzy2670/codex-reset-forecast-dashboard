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
 demo.localQuotaHistory=withLocal?[100,0,null,41].map((before,i)=>({
  id:`quota-reset:codex:primary:${iso(now+(i+1)*86400000)}`,
  type:'local',at:iso(now-(5-i)*86400000),bucketId:'codex',windowKey:'primary',
  beforeRemainingPercent:before,afterRemainingPercent:100,beforeBasis:i===3?'snapshot':'transition',
  beforeFetchedAt:iso(now-(5-i)*86400000-(i===3?8*3600000:30000)),
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
  const merged=fixture('zh-CN');
  const localAt=iso(now-3600000);
  merged.history=[{id:'public-completion',type:'global',at:iso(now-3540000),sources:[{id:'feed-a',name:'Feed A',family:'chain-a',url:'https://example.com/a',at:iso(now-3540000)}]}, {id:'effective-completion',type:'global',at:iso(now-3480000),timeBasis:'effective',sources:[{id:'feed-b',name:'Feed B',family:'chain-b',url:'https://example.com/b',at:iso(now-3480000)}]}];
  merged.localQuotaHistory=[{id:'local-reset',type:'local',at:localAt,bucketId:'codex',windowKey:'primary',beforeRemainingPercent:75,afterRemainingPercent:100,beforeFetchedAt:iso(now-3630000),sources:[]}];
  await page.evaluate(demo=>render(demo),merged);
  assert.equal(await page.locator('.history-row').count(),1,'Nearby public/local reset records merge into one row');
  assert.equal(await page.locator('.history-row.history-local .history-quota-before strong').innerText(),'75%');
  assert.equal(await page.locator('.history-row .pill').innerText(),'全局重置','The matched local receipt is labelled global');
  assert.equal(await page.locator('.history-time > span').innerText(),'本机到账时间');
  assert.equal(await page.locator('.history-row.history-banked').count(),0,'The global reset is not a personal card');
  assert.equal(await page.locator('.history-row time strong').innerText(),new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date(localAt)),'Merged clock is the local reset time');
  await page.locator('.history-proof summary').click();
  assert.ok((await page.locator('.history-proof').innerText()).includes('Feed A'));
  assert.ok((await page.locator('.history-proof').innerText()).includes('Feed B'));
  const cardView=structuredClone(merged);
  cardView.localQuotaHistory.push({id:'personal-card',type:'local',at:iso(now-1800000),bucketId:'codex',windowKey:'primary',beforeRemainingPercent:0,afterRemainingPercent:100,beforeFetchedAt:iso(now-1830000),sources:[]});
  for(const theme of ['light','dark']){
   cardView.settings.theme=theme;await page.evaluate(demo=>render(demo),cardView);
   assert.equal(await page.locator('.history-row[data-history-type="personal_card"] .pill').innerText(),'个人重置卡');
   const background=await page.locator('.history-row[data-history-type="personal_card"]').evaluate(row=>getComputedStyle(row).backgroundColor);
   assert.notEqual(background,'rgba(0, 0, 0, 0)','Personal card whole row has a distinct background');
   assert.notEqual(background,'transparent');
   assert.equal(await page.locator('.history-row[data-history-type="global"] .pill').innerText(),'全局重置');
  }
  const issued=fixture('zh-CN',false);issued.history=[{id:'issued-card',type:'banked',at:iso(now-7200000),sources:[],text:'Reset card source evidence'}];await page.evaluate(demo=>render(demo),issued);
  assert.equal(await page.locator('[data-history-type="personal_card"]').count(),0,'Official card issuance never claims personal use');
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
   assert.equal(await page.locator('.history-row.history-local').count(),4,'Distinct daily refills stay separate');
   assert.equal(await page.locator('.history-row:not(.history-local) .history-quota-before').count(),0,'Official rows must not receive a guessed personal value');
   const local=page.locator('.history-row.history-local');
   const values=await local.locator('.history-quota-before strong').allTextContents();
   assert.deepEqual(values,['100%','0%',language==='en'?'Not recorded':'未记录','41%'].reverse(),'Newest-first local records preserve snapshots, 100%, 0%, and unknown');
   const labels=await local.locator('.history-quota-before').allTextContents();
   assert.ok(labels.every(t=>t.includes(language==='en'?'Remaining before refill':'补充前剩余')),'All refill rows have translated labels');
   const snapshot=fixture(language).localQuotaHistory.find(row=>row.beforeBasis==='snapshot');
   const sampledAt=new Date(snapshot.beforeFetchedAt);
   const sampledClock=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(sampledAt);
   const sampledDateParts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric'}).formatToParts(sampledAt);
   const sampledMonth=sampledDateParts.find(part=>part.type==='month').value,sampledDay=sampledDateParts.find(part=>part.type==='day').value;
   const snapshotNote=await local.first().locator('.history-quota-before-note').innerText();
   assert.ok(snapshotNote.includes(language==='en'?'Snapshot':'快照'),'Older snapshot is labelled independently from a fresh transition');
   assert.ok(snapshotNote.includes(sampledClock),'The pre-refill snapshot shows its actual sample time');
   assert.match(snapshotNote,new RegExp('0?'+sampledMonth+'/0?'+sampledDay),'The pre-refill snapshot shows its actual sample date');

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
  console.log(JSON.stringify({ok:true,profile,checks:['real language control','four distinct daily refills','older 41% snapshot with sample date and time','100% and 0%','unknown historical value','official interval plus/minus three hours uses local receipt clock and global label','subsequent exhausted refill shows personal card separately','official calendar unchanged','22px narrow and wide layouts'],layouts,errors,networkRequests:network.length},null,2));
 }finally{await application.close();}
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
