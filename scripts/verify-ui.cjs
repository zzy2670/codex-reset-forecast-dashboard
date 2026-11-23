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
 await page.evaluate(({now,demo})=>{const RealDate=Date;window.__testNow=now;window.Date=class extends RealDate{constructor(...a){super(...(a.length?a:[window.__testNow]));}static now(){return window.__testNow;}};render(demo);},{now:demoNow,demo:makeDemo(demoNow,{alert:true,range:true})});
 const stability=await page.evaluate(async({demo,now})=>{
  const frame=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  const y=selector=>document.querySelector(selector).getBoundingClientRect().top;
  render(demo);await frame();
  const initial={overview:y('.overview'),bars:y('.quota-bars'),next:y('.forecasts-section')};
  const source=document.querySelector('.source-card'),history=document.querySelector('.history-row'),quota=document.querySelector('#quota-value span'),date=document.querySelector('#local-date strong'),marker=document.querySelector('.forecast-line');
  const details=source.querySelector('details');details.open=true;await new Promise(resolve=>setTimeout(resolve,0));
  const summary=details.querySelector('summary');summary.focus({preventScroll:true});
  const historyDetails=history.querySelector('details');if(historyDetails)historyDetails.open=true;
  tick();tick();
  demo.sources[0].fetchedAt=new Date(now+1000).toISOString();demo.sources[0].updatedAt=new Date(now+1000).toISOString();render(demo);await frame();
  const reused={source:source===document.querySelector('.source-card'),history:history===document.querySelector('.history-row'),quota:quota===document.querySelector('#quota-value span'),date:date===document.querySelector('#local-date strong'),marker:marker===document.querySelector('.forecast-line'),open:details.open,focus:document.activeElement===summary,historyOpen:!historyDetails||historyDetails.open};
  demo.events=[{sourceId:'codex',read:false,title:'示例',body:'隔离测试'}];render(demo);await frame();
  const unread={overview:y('.overview'),bars:y('.quota-bars'),next:y('.forecasts-section')};
  demo.quota.state='error';render(demo);await frame();
  const stale={overview:y('.overview'),bars:y('.quota-bars'),next:y('.forecasts-section'),connectionHidden:document.querySelector('#quota-connection').hidden,switchButton:!!document.querySelector('#quota-side [data-connect-quota]')};
  demo.quota.state='ok';demo.events=[];demo.settings.language='en';demo.nextPollAt=new Date(now+25000).toISOString();render(demo);await frame();
  const watched=['#quota-side','.source-card','#history-list','#last-reset-value','#hypothetical-note','#forecast-markers','#local-date'],changes=[];
  const observer=new MutationObserver(records=>changes.push(...records));for(const selector of watched)observer.observe(document.querySelector(selector),{subtree:true,childList:true,characterData:true});
  tick();render(demo);tick();await new Promise(resolve=>setTimeout(resolve,0));changes.push(...observer.takeRecords());observer.disconnect();
  const originalApply=DashboardI18n.apply;let scans=0;DashboardI18n.apply=(...args)=>{scans++;return originalApply(...args);};
  const beforePoll=document.querySelector('#poll-status').textContent;for(let i=0;i<3;i++){window.__testNow+=1000;tick();}
  const english={mutations:changes.length,caption:document.querySelector('#quota-caption').textContent,action:document.querySelector('#quota-side [data-connect-quota]').textContent,scans,beforePoll,afterPoll:document.querySelector('#poll-status').textContent};
  DashboardI18n.apply=originalApply;window.__testNow=now;
  demo.settings.language='zh-CN';render(demo);await frame();
  let zhScans=0;DashboardI18n.apply=(...args)=>{zhScans++;return originalApply(...args);};for(let i=0;i<3;i++){window.__testNow+=1000;tick();}DashboardI18n.apply=originalApply;window.__testNow=now;
  const oldSource=document.querySelector('.source-card'),oldSummary=oldSource.querySelector('summary');oldSummary.focus({preventScroll:true});demo.sources[0].notes=[...(demo.sources[0].notes||[]),'Additional evidence'];render(demo);await frame();
  const changedSource=document.querySelector('.source-card'),changed={replaced:changedSource!==oldSource,open:changedSource.querySelector('details').open,focus:document.activeElement===changedSource.querySelector('summary')};
  const fingerprint='a'.repeat(64),at=new Date(now-3600000).toISOString();demo.quotaDisplay.identityUnverified=true;
  demo.localQuotaHistory=[{id:`quota-reset:${fingerprint}`,type:'local',at,bucketId:'codex',windowKey:'primary',beforeRemainingPercent:22,afterRemainingPercent:100,identityUnverified:true,sources:[]}];render(demo);await frame();
  const unverified={quota:document.querySelector('#quota-side').textContent.includes('账号未核实'),history:document.querySelector('.history-local')?.textContent.includes('账号未核实'),leaked:document.body.innerHTML.includes(fingerprint)};
  demo.localQuotaHistory=[{...demo.localQuotaHistory[0],refillReasonUnverified:true}];render(demo);await frame();
  const refillUnverified=document.querySelector('.history-local .pill')?.textContent;
  demo.localQuotaHistory=[{...demo.localQuotaHistory[0],type:'personal_card',cardInferred:true,identityUnverified:false,accountFingerprint:fingerprint}];render(demo);await frame();
  const cardRow=document.querySelector('.history-row[data-history-type="personal_card"]'),cardDay=ResetCalendar.dateKey(at,zone),cardCell=[...document.querySelectorAll('[data-calendar-day]')].find(node=>node.dataset.calendarDay===cardDay);
  const inferredCard={label:cardRow?.querySelector('.pill')?.textContent,tooltip:cardCell?.title||'',background:getComputedStyle(cardCell.querySelector('.calendar-time.banked')).backgroundColor,leaked:document.body.innerHTML.includes(fingerprint),enabled:document.querySelector('#calendar-show-banked').checked};
  demo.history=[];demo.localQuotaHistory=[{...demo.localQuotaHistory[0],type:'local',periodicWindow:true,cardInferred:false}];render(demo);await frame();
  const periodicLabel=document.querySelector('.history-local .pill')?.textContent,periodicCell=[...document.querySelectorAll('[data-calendar-day]')].find(node=>node.dataset.calendarDay===cardDay),periodic={tooltip:periodicCell.title,global:periodicCell.classList.contains('has-reset'),background:getComputedStyle(periodicCell.querySelector('.calendar-time.periodic')).backgroundColor};
  const first=new Date(now-86400000).toISOString(),second=new Date(now-2*86400000).toISOString();
  demo.history=[{id:'unmerged-no-time',type:'global',at:first,sources:[{id:'missing-one',name:'Missing one'}]},{id:'merged-no-time',type:'global',at:second,sources:[{id:'missing-two',name:'Missing two'}]}];demo.localQuotaHistory=[{id:'paired-local',type:'local',at:second,bucketId:'codex',windowKey:'primary',beforeRemainingPercent:41,afterRemainingPercent:100,sources:[]}];render(demo);await frame();
  const missingSourceTexts=[...document.querySelectorAll('.history-row')].filter(node=>node.textContent.includes('Missing one')||node.textContent.includes('Missing two')).map(node=>node.textContent);
  return {initial,reused,unread,stale,english,zhScans,changed,unverified,refillUnverified,inferredCard,periodicLabel,periodic,missingSourceTexts,noBanner:!document.querySelector('#change-banner'),noUnreadDot:!document.querySelector('#unread-dot')};
 },{demo:makeDemo(demoNow,{alert:true,range:true,language:'zh-CN'}),now:demoNow});
 assert.deepEqual(stability.reused,{source:true,history:true,quota:true,date:true,marker:true,open:true,focus:true,historyOpen:true});
 assert.deepEqual(stability.unread,stability.initial,'unread events must not insert a top banner or shift the layout');
 assert.deepEqual({overview:stability.stale.overview,bars:stability.stale.bars,next:stability.stale.next},stability.initial,'a transient quota error must not insert a large connection panel');
 assert.equal(stability.stale.connectionHidden,true);assert.equal(stability.stale.switchButton,true);
 assert.equal(stability.english.mutations,0,'repeated identical English refreshes must not overwrite translated nodes');
 assert.match(stability.english.caption,/Local Codex/);assert.equal(stability.english.action,'Switch account in Codex');
 assert.equal(stability.english.scans,0,'advancing English clock must not retranslate the whole document');assert.equal(stability.zhScans,0,'advancing Chinese clock must not retranslate the whole document');assert.notEqual(stability.english.beforePoll,stability.english.afterPoll,'poll countdown must still update');
 assert.equal(stability.refillUnverified,'本机额度补充 · 原因待核实');assert.equal(stability.periodicLabel,'周期额度补充 · 原因待核实');assert.match(stability.periodic.tooltip,/周期额度补充/);assert.equal(stability.periodic.global,false);assert.notEqual(stability.periodic.background,stability.inferredCard.background);assert.equal(stability.missingSourceTexts.length,2);assert.ok(stability.missingSourceTexts.every(text=>text.includes('来源时间未记录')));
 assert.deepEqual(stability.changed,{replaced:true,open:true,focus:true});assert.equal(stability.noBanner,true);assert.equal(stability.noUnreadDot,true);
 assert.deepEqual(stability.unverified,{quota:true,history:true,leaked:false});assert.equal(stability.inferredCard.label,'疑似重置卡 · 原因待核实');assert.match(stability.inferredCard.tooltip,/疑似重置卡 · 原因待核实/);assert.equal(stability.inferredCard.leaked,false);assert.equal(stability.inferredCard.enabled,true);
 const switchPrivacy=await page.evaluate(({demo})=>{
  render(demo);document.querySelector('#quota-dialog').showModal();renderQuotaDetails();
  const before=document.querySelector('#quota-details').textContent;
  const switching={...demo,quotaDisplay:null,quotaConnection:{checking:true},quota:{...demo.quota,state:'error'}};
  render(switching);renderQuotaDetails();
  const cleared={details:document.querySelector('#quota-details').textContent,caption:document.querySelector('#quota-caption').textContent,title:document.querySelector('#quota-reset').getAttribute('title'),actual:document.querySelector('#actual-track').getAttribute('aria-valuenow'),theory:document.querySelector('#theory-track').getAttribute('aria-valuenow'),value:document.querySelector('#quota-value').textContent};
  const replacement={...demo,quotaDisplay:{...demo.quotaDisplay,remainingPercent:77,usedPercent:23,identityUnverified:true},quota:{...demo.quota,limits:[{...demo.quota.limits[0],secondary:{...demo.quotaDisplay,remainingPercent:77,usedPercent:23}}]}};
  render(replacement);const after=document.querySelector('#quota-details').textContent;
  document.querySelector('#quota-dialog').close();return {before,cleared,after};
 },{demo:makeDemo(demoNow,{language:'zh-CN'})});
 assert.match(switchPrivacy.before,/58%/);assert.doesNotMatch(switchPrivacy.cleared.details,/58%/);assert.equal(switchPrivacy.cleared.caption,'本机 Codex · 剩余额度');assert.equal(switchPrivacy.cleared.title,'');assert.equal(switchPrivacy.cleared.actual,null);assert.equal(switchPrivacy.cleared.theory,null);assert.match(switchPrivacy.cleared.value,/—/);assert.match(switchPrivacy.after,/77%/);assert.doesNotMatch(switchPrivacy.after,/58%/);
 const verifying=await page.evaluate(async({demo,now})=>{
  const frame=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))),owner='b'.repeat(64);
  demo.quotaDisplay.accountFingerprint=owner;demo.quotaDisplay.ordinaryUsageAllowed=false;demo.quota.accountFingerprint=owner;
  demo.localQuotaHistory=[{id:'sensitive-local',accountFingerprint:owner,type:'local',at:new Date(now-3600000).toISOString(),bucketId:'codex',windowKey:'primary',beforeRemainingPercent:73,afterRemainingPercent:100,sources:[]}];
  demo.events=[{kind:'quota_reset',accountFingerprint:owner,title:'旧账号余额 38%',body:'仅旧账号',at:new Date(now).toISOString()}];
  render(demo);await frame();const button=document.querySelector('#quota-side [data-connect-quota]');button.focus({preventScroll:true});
  const measure=()=>{const panel=document.querySelector('.quota-panel').getBoundingClientRect(),top=document.querySelector('.quota-top').getBoundingClientRect(),bars=document.querySelector('.quota-bars').getBoundingClientRect();return {panelHeight:panel.height,topHeight:top.height,barsY:bars.y};};
  const before=measure();
  render({...demo,quotaConnection:{identityChecking:true,checking:true}});await frame();
  const check={geometry:measure(),panelHidden:document.querySelector('#quota-connection').hidden,value:document.querySelector('#quota-value').textContent,details:document.querySelector('#quota-details').textContent,history:document.querySelector('#history-list').textContent,events:document.querySelector('#events-list').textContent,focus:document.activeElement===document.querySelector('#quota-side [data-connect-quota]'),action:document.querySelector('#quota-side').textContent,aria:document.querySelector('#quota-side [data-connect-quota]')?.getAttribute('aria-disabled')};
  const unknown={...demo,quota:null,quotaDisplay:null,localReset:null,localQuotaHistory:[],events:[],quotaConnection:{checking:true}};render(unknown);await frame();const manual={geometry:measure(),panelHidden:document.querySelector('#quota-connection').hidden,value:document.querySelector('#quota-value').textContent};
  render({...unknown,quotaConnection:{errorCode:'CONNECTION_CLOSED'}});await frame();const failed={login:!!document.querySelector('#quota-connection [data-connect-quota]'),retry:!!document.querySelector('#quota-connection [data-refresh-quota]'),text:document.querySelector('#quota-connection').textContent};
  render({...unknown,quotaConnection:{needsLogin:true}});await frame();const login=!!document.querySelector('#quota-connection [data-connect-quota]');
  const replacement={...demo,quotaConnection:{authenticated:true},quotaDisplay:{...demo.quotaDisplay,remainingPercent:77,usedPercent:23},quota:{...demo.quota,limits:[{...demo.quota.limits[0],secondary:{...demo.quotaDisplay,usedPercent:23}}]},localQuotaHistory:[],events:[]};render(replacement);await frame();const success=document.querySelector('#quota-value').textContent;
  return {before,check,manual,failed,login,success};
 },{demo:makeDemo(demoNow,{language:'zh-CN'}),now:demoNow});
 assert.equal(verifying.check.panelHidden,true);assert.equal(verifying.check.focus,true);assert.equal(verifying.check.aria,'true');assert.match(verifying.check.action,/正在核实账号/);assert.match(verifying.check.value,/—/);assert.doesNotMatch(verifying.check.details,/58%/);assert.doesNotMatch(verifying.check.history,/73%/);assert.doesNotMatch(verifying.check.events,/38%/);
 for(const view of [verifying.check,verifying.manual])for(const key of ['panelHeight','topHeight','barsY'])assert.ok(Math.abs(view.geometry[key]-verifying.before[key])<1,'verification must preserve '+key+': '+JSON.stringify(verifying));
 assert.equal(verifying.manual.panelHidden,true);assert.equal(verifying.failed.login,false);assert.equal(verifying.failed.retry,true);assert.equal(verifying.login,true);assert.match(verifying.success,/77/);
 const freeze=await page.evaluate(async({demo,now})=>{
  const frame=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))),owner='c'.repeat(64),at=new Date(now-3600000).toISOString();
  demo.quotaDisplay.accountFingerprint=owner;demo.quota.accountFingerprint=owner;
  demo.history=[{id:'official',type:'global',at,sources:[{id:'source',name:'Public source',at}]}];
  demo.localQuotaHistory=[{id:'private-local',accountFingerprint:owner,type:'local',at,bucketId:'codex',windowKey:'primary',beforeRemainingPercent:73,afterRemainingPercent:100,sources:[]}];
  render(demo);await frame();const row=document.querySelector('.history-local'),summary=row.querySelector('summary');row.querySelector('details').open=true;summary.focus({preventScroll:true});document.querySelector('.history-section').scrollIntoView();await frame();
  const y=()=>({height:document.documentElement.scrollHeight,scroll:scrollY,history:document.querySelector('#history-list').getBoundingClientRect().height,calendar:document.querySelector('#reset-calendar').getBoundingClientRect().height,bars:document.querySelector('.quota-bars').getBoundingClientRect().y});
  const before={layout:y(),row,summary,calendar:document.querySelector('#reset-calendar [data-calendar-day]'),bar:document.querySelector('#calendar-fill').style.width,warning:document.querySelector('#forecast-warning').textContent,warningHidden:document.querySelector('#forecast-warning').hidden,markers:document.querySelector('#forecast-markers').innerHTML};
  render({...demo,quotaCacheChecking:true,quotaConnection:{identityChecking:true}});window.__testNow+=3600000;tick();await frame();
  const cached={layout:y(),sameRow:row===document.querySelector('.history-local'),sameCalendar:before.calendar===document.querySelector('#reset-calendar [data-calendar-day]'),focus:document.activeElement===summary,open:row.querySelector('details').open,bar:document.querySelector('#calendar-fill').style.width,warning:document.querySelector('#forecast-warning').textContent,warningHidden:document.querySelector('#forecast-warning').hidden,markers:document.querySelector('#forecast-markers').innerHTML,labels:['#quota-side [data-quota-name]','#history-range','#calendar-range'].map(x=>document.querySelector(x).textContent)};
  const chosenBefore=calendarDate;document.querySelector('.calendar-cell.future').click();const feedback=document.querySelector('#calendar-result').textContent,chosenAfter=calendarDate;
  window.__testNow=now;render({...demo,quotaConnection:{checking:true}});await frame();
  const masked={layout:y(),history:document.querySelector('#history-list').textContent,calendarPrivate:document.querySelectorAll('#reset-calendar [data-local-quota]').length,placeholder:document.querySelector('.history-checking')?.getAttribute('aria-label'),focus:document.activeElement===document.querySelector('.history-checking')};
  render(demo);await frame();const restored={layout:y(),open:!!document.querySelector('.history-local details')?.open,focus:document.activeElement===document.querySelector('.history-local summary'),value:document.querySelector('.history-local .history-quota-before strong')?.textContent};
  return {before:{layout:before.layout,bar:before.bar,warning:before.warning,warningHidden:before.warningHidden,markers:before.markers},cached,masked,restored,feedback,chosenBefore,chosenAfter};
 },{demo:makeDemo(demoNow,{language:'zh-CN',alert:true,range:true}),now:demoNow});
 for(const key of ['height','scroll','history','calendar','bars'])for(const phase of ['cached','masked','restored'])assert.ok(Math.abs(freeze[phase].layout[key]-freeze.before.layout[key])<2,phase+' changed '+key+': '+JSON.stringify(freeze));
 assert.match(freeze.feedback,/正在核实账号/);assert.equal(freeze.chosenAfter,freeze.chosenBefore);
 assert.equal(freeze.cached.sameRow,true);assert.equal(freeze.cached.sameCalendar,true);assert.equal(freeze.cached.focus,true);assert.equal(freeze.cached.open,true);assert.equal(freeze.cached.bar,freeze.before.bar);assert.equal(freeze.cached.warning,freeze.before.warning);assert.equal(freeze.cached.warningHidden,freeze.before.warningHidden);assert.equal(freeze.cached.markers,freeze.before.markers);assert.ok(freeze.cached.labels.every(x=>x.includes('上次核验账号的缓存')));
 assert.doesNotMatch(freeze.masked.history,/73%/);assert.equal(freeze.masked.calendarPrivate,0);assert.equal(freeze.masked.placeholder,'正在核实账号');assert.equal(freeze.masked.focus,true);assert.equal(freeze.restored.open,true);assert.equal(freeze.restored.focus,true);assert.equal(freeze.restored.value,'73%');
 for(const width of [860,1440]){
  const actual=await application.evaluate(({BrowserWindow},w)=>{const window=BrowserWindow.getAllWindows()[0];window.setContentSize(w,1000);return window.getContentBounds().width;},width);await page.waitForFunction(w=>Math.abs(innerWidth-w)<=1,actual);
  const stable=await page.evaluate(async demo=>{const frame=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));demo.settings.bodyFontSize=22;render(demo);await frame();const panel=document.querySelector('.quota-panel'),bars=document.querySelector('.quota-bars'),height=panel.getBoundingClientRect().height,y=bars.getBoundingClientRect().y;render({...demo,quotaCacheChecking:true,quotaConnection:{identityChecking:true}});await frame();const name=document.querySelector('[data-quota-name]');return {height,afterHeight:panel.getBoundingClientRect().height,y,afterY:bars.getBoundingClientRect().y,text:name.textContent,clipped:name.scrollWidth>name.clientWidth};},makeDemo(demoNow,{language:'zh-CN'}));
  assert.ok(Math.abs(stable.height-stable.afterHeight)<2,'cached panel height changed at '+width+': '+JSON.stringify(stable));assert.ok(Math.abs(stable.y-stable.afterY)<2,'cached bars moved at '+width+': '+JSON.stringify(stable));assert.match(stable.text,/上次核验账号的缓存 · 核验中/);assert.equal(stable.clipped,false,'cache label must remain readable at '+width);
 }
 const eventPrivacy=await page.evaluate(({demo,now})=>{
  const account='e'.repeat(64),legacy={kind:'quota_reset',title:'旧记录',body:'未知账号',at:new Date(now).toISOString()},known={kind:'quota_reset',accountFingerprint:account,title:'之前账号',body:'余额 39%',at:new Date(now).toISOString()};
  render({...demo,events:[legacy,known]});renderEvents();document.querySelector('#events-dialog').showModal();
  const before=document.querySelector('#events-list').textContent;
  render({...demo,quota:null,quotaDisplay:null,events:[legacy]});const after=document.querySelector('#events-list').textContent,leaked=document.body.innerHTML.includes(account);
  document.querySelector('#events-dialog').close();return {before,after,leaked};
 },{demo:makeDemo(demoNow,{language:'zh-CN'}),now:demoNow});
 assert.match(eventPrivacy.before,/账号未核实/);assert.match(eventPrivacy.before,/余额 39%/);assert.match(eventPrivacy.after,/账号未核实/);assert.doesNotMatch(eventPrivacy.after,/余额 39%/);assert.equal(eventPrivacy.leaked,false);
 await page.evaluate(d=>render(d),makeDemo(demoNow,{alert:true,range:true}));
 assert.equal(await page.locator('.forecast-line').count(),2);
 assert.equal(await page.locator('body.reset-alert').count(),1);
 assert.equal(await page.locator('.source-card').count(),5);
 const historical=makeDemo(demoNow,{language:'zh-CN'});
 historical.consensus={state:'unavailable'};
 historical.history=[{type:'global',at:new Date(demoNow-86400000).toISOString(),url:'https://x.com/thsottiaux/status/123456',sources:['didcodexreset','codex-resets-feed'].map((family,i)=>({id:String(i),family,at:new Date(demoNow-86400000).toISOString(),url:'https://x.com/thsottiaux/status/123456'}))}];
 historical.sources.forEach(s=>{s.status='stale';s.forecast={state:'none'};});
 await page.evaluate(d=>render(d),historical);
 assert.equal(await page.locator('#hypothetical-percent').innerText(),'33%');
 assert.ok(Math.abs(await page.locator('#hypothetical-fill').evaluate(e=>parseFloat(e.style.width))-100/3)<.01);
 historical.settings.hypotheticalDays=4;await page.evaluate(d=>render(d),historical);
 assert.equal(await page.locator('#hypothetical-percent').innerText(),'25%');
 assert.equal(await page.locator('#hypothetical-days-label').innerText(),'4');
 await page.evaluate(()=>renderHypothetical(Date.now()+5*86400000));
 assert.equal(await page.locator('#hypothetical-percent').innerText(),'100%');
 historical.history=[];await page.evaluate(d=>render(d),historical);
 assert.equal(await page.locator('#hypothetical-percent').innerText(),'—');
 await page.evaluate(d=>render(d),makeDemo(demoNow,{alert:true,range:true}));
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
