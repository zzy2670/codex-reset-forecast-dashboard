'use strict';
const {_electron}=require('playwright-core'),assert=require('node:assert/strict'),path=require('node:path');
const {makeDemo,demoNow}=require('./demo-state.cjs');
const root=path.resolve(__dirname,'..'),results=[],errors=[],requests=[];
let application,page;
function fixture(connection={},language='zh-CN'){
 const demo=makeDemo(demoNow,{language});demo.settings.bodyFontSize=22;demo.quota=null;demo.quotaDisplay=null;demo.quotaConnection={checking:false,authenticated:false,needsLogin:true,...connection};return demo;
}
async function push(demo){await application.evaluate(({BrowserWindow},data)=>{globalThis.__onboarding.fixture=data;BrowserWindow.getAllWindows()[0].webContents.send('dashboard:state',data);},demo);await page.waitForFunction(value=>state.quotaConnection?.errorCode===value.errorCode&&state.settings.language===value.language,{errorCode:demo.quotaConnection.errorCode,language:demo.settings.language});}
async function residual(){return page.evaluate(()=>{
 const out=[],walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let node;
 while(node=walker.nextNode())if(/[\u4e00-\u9fff]/.test(node.nodeValue)&&!node.parentElement.closest('script,style,[data-original],option[value="zh-CN"]'))out.push(node.nodeValue);
 for(const element of document.querySelectorAll('[title],[aria-label],[placeholder]'))for(const attr of ['title','aria-label','placeholder'])if(/[\u4e00-\u9fff]/.test(element.getAttribute(attr)||''))out.push(element.getAttribute(attr));
 return [...new Set(out)];
});}
async function main(){try{
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 application=await _electron.launch({executablePath:process.env.DASHBOARD_TEST_EXE||require('electron'),args:[...(process.env.DASHBOARD_TEST_EXE?[]:[root]),'--verification-test',`--verification-profile=onboarding-${Date.now()}`],env,timeout:60000});
 page=await application.firstWindow();page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(/^https?:/.test(request.url()))requests.push(request.url());});
 await page.waitForFunction(()=>typeof state==='object'&&typeof render==='function');
 await page.evaluate(now=>{window.__onboardingNow=now;const RealDate=Date;window.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[window.__onboardingNow]));}static now(){return window.__onboardingNow;}};},demoNow);
 await application.evaluate(({ipcMain,BrowserWindow},demo)=>{
  globalThis.__onboarding={fixture:demo,calls:{connect:0,cancel:0,settings:0}};
  const send=()=>{const f=globalThis.__onboarding.fixture;BrowserWindow.getAllWindows()[0].webContents.send('dashboard:state',f);return f;};
  for(const name of ['dashboard:connect-quota','dashboard:cancel-quota-login','dashboard:settings','dashboard:get'])ipcMain.removeHandler(name);
  // Mock IPC models the UI state transitions only. No OAuth or account call runs.
  ipcMain.handle('dashboard:connect-quota',()=>{const f=globalThis.__onboarding;f.calls.connect++;f.fixture.quotaConnection={checking:false,needsLogin:true,authenticated:false,loginPending:true};return send();});
  ipcMain.handle('dashboard:cancel-quota-login',()=>{const f=globalThis.__onboarding;f.calls.cancel++;f.fixture.quotaConnection={checking:false,needsLogin:true,authenticated:false,loginPending:false};return send();});
  ipcMain.handle('dashboard:settings',(_event,patch)=>{const f=globalThis.__onboarding;f.calls.settings++;Object.assign(f.fixture.settings,patch);return send();});
  ipcMain.handle('dashboard:get',()=>globalThis.__onboarding.fixture);
  send();
 },fixture());
 await page.waitForSelector('#quota-connection [data-connect-quota]');
 await page.locator('#quota-connection [data-connect-quota]').click();await page.waitForSelector('#quota-connection [data-cancel-quota-login]');assert.equal(await page.locator('#quota-connection').innerText().then(t=>t.includes('完成授权后自动读取额度')),true);
 await page.locator('#quota-connection [data-cancel-quota-login]').click();await page.waitForFunction(()=>!state.quotaConnection.loginPending);assert.equal(await page.locator('#quota-connection [data-cancel-quota-login]').count(),0);results.push('real preload IPC buttons: connect and cancel');
 for(const language of ['en','zh-CN','en']){
  await page.locator('#settings-button').click();await page.locator('#setting-language').selectOption(language);await page.waitForFunction(value=>state.settings.language===value,language);await page.locator('[data-close="settings-dialog"]').click();
  assert.equal(await page.locator('#quota-connection [data-connect-quota]').innerText(),language==='en'?'Sign in with ChatGPT':'登录 ChatGPT 并接入额度');
 }
 results.push('Chinese and English settings switch the real connection controls');
 for(const connection of [{needsLogin:true},{loginPending:true},{requiresAccountSwitch:true},{checking:true},{errorCode:'LOGIN_FAILED'},{errorCode:'MANAGED_HOME_UNAVAILABLE'}]){
  const demo=fixture(connection,'en');await push(demo);await page.waitForTimeout(30);assert.deepEqual(await residual(),[],`untranslated connection state ${JSON.stringify(connection)}`);
  assert.equal(await page.locator('#quota-connection [data-connect-quota]').count(),1);assert.equal(await page.locator('#quota-connection [data-cancel-quota-login]').count(),connection.loginPending?1:0);
 }
 results.push('all connection states translated, including retry and dedicated sign-in');
 for(const usedPercent of [0,100]){
  const demo=makeDemo(demoNow,{language:'en'});demo.quotaDisplay.usedPercent=usedPercent;demo.quotaDisplay.remainingPercent=100-usedPercent;demo.quotaConnection={checking:false,authenticated:true,needsLogin:false,ready:true};
  await push(demo);await page.waitForFunction(value=>state.quotaDisplay?.usedPercent===value,usedPercent);assert.equal(await page.locator('#quota-connection').isVisible(),false);
  await page.evaluate(()=>openQuota());assert((await page.locator('#quota-details').innerText()).includes('Quota connected'));assert.deepEqual(await residual(),[]);await page.locator('[data-close="quota-dialog"]').click();
 }
 results.push('0% and 100% usage both remain connected after a simulated completion snapshot');
 const retry=fixture({},'zh-CN');retry.sources[0].status='retrying';retry.sources[0].forecast=makeDemo(demoNow,{alert:true,language:'zh-CN'}).sources[0].forecast;
 await push(retry);await page.waitForFunction(()=>state.sources[0].status==='retrying');
 const first=page.locator('.source-card').first();assert.equal(await first.locator('.pill').innerText(),'重试中');assert.equal(await first.locator('.forecast-value.scheduled').count(),1);
 const originalTimes=await first.locator('.source-times').innerText(),originalFetched=retry.sources[0].fetchedAt,originalUpdated=retry.sources[0].updatedAt;
 await page.evaluate(now=>{window.__onboardingNow=now;tick();},demoNow+retry.sources[0].maxAge+1);
 assert.equal(await page.evaluate(()=>PaceTiming.isFresh(state.sources[0])),false);assert.equal(await first.locator('.source-times').innerText(),originalTimes);assert.equal(await page.evaluate(()=>state.sources[0].fetchedAt),originalFetched);assert.equal(await page.evaluate(()=>state.sources[0].updatedAt),originalUpdated);assert((await first.locator('.forecast-note').innerText()).includes('数据待更新'));results.push('retry preserves cached times and freshness expires without being extended');
 await page.evaluate(now=>{window.__onboardingNow=now;},demoNow);
 const width=await application.evaluate(({BrowserWindow})=>{const win=BrowserWindow.getAllWindows()[0];win.setContentSize(860,1000);return win.getContentBounds().width;});await page.waitForFunction(value=>Math.abs(innerWidth-value)<=1,width);
 for(const language of ['zh-CN','en']){await push(fixture({requiresAccountSwitch:true},language));await page.waitForTimeout(50);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`connection overflow in ${language}`);}
 results.push('small window and 22 px text fit in both languages');
 const calls=await application.evaluate(()=>globalThis.__onboarding.calls);assert.equal(calls.connect,1);assert.equal(calls.cancel,1);assert.equal(calls.settings,3);assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
 console.log(JSON.stringify({ok:true,verification:'UI with mocked IPC; no OAuth',results,calls,errors,networkRequests:requests.length,testNotifications:false},null,2));
 }finally{if(application)await application.close();}}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
