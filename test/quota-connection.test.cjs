'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {EventEmitter}=require('node:events');
const {deploymentReport}=require('../app/deployment-check.cjs');
const main=fs.readFileSync(path.join(__dirname,'../app/main.cjs'),'utf8');
const start=main.indexOf('async function refreshConnection('),end=main.indexOf('function installShortcut(',start);
assert(start>=0&&end>start,'extract production quota connection functions and callbacks');
const production=main.slice(start,end);
function harness(options={}){
 const localQuota=new EventEmitter(),calls=[],opened=[];
 localQuota.setupStatus=async()=>{calls.push('status');return options.status||{runtimeAvailable:true,authenticated:false,needsLogin:true,loginPending:true};};
 localQuota.login=async()=>{calls.push('login');if(options.error)throw options.error;return options.login||{loginId:'mock-login',authUrl:'https://auth.openai.com/oauth/authorize?state=fixture'};};
 const sandbox={localQuota,URL,smoke:!!options.smoke,connection:{checking:false},connectionFlight:null,
  refreshQuota:async()=>{calls.push('quota');},publish:()=>calls.push('publish'),
  shell:{openExternal:async url=>{calls.push('browser');opened.push(url);}},
  snapshot:()=>JSON.parse(JSON.stringify(sandbox.connection))};
 vm.createContext(sandbox);vm.runInContext(production,sandbox);
 return {sandbox,localQuota,calls,opened};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('production connection: already authenticated refreshes real quota path without opening browser',async()=>{
 const f=harness({login:{alreadyConnected:true},status:{authenticated:true,ready:true}});
 const result=await f.sandbox.beginQuotaLogin();assert.equal(result.ready,true);assert.deepEqual(f.opened,[]);assert.deepEqual(f.calls,['login','quota','status','publish']);
});
test('production connection: unauthenticated opens official authorization after updating pending status',async()=>{
 const f=harness();const result=await f.sandbox.beginQuotaLogin();assert.equal(result.loginPending,true);assert.deepEqual(f.opened,['https://auth.openai.com/oauth/authorize?state=fixture']);assert(f.calls.indexOf('status')<f.calls.indexOf('browser'));assert(!f.calls.includes('quota'));
});
test('production connection: official ChatGPT login destination and explicit HTTPS default port work',async()=>{
 const f=harness({login:{loginId:'mock',authUrl:'https://chatgpt.com:443/oauth/authorize'}});await f.sandbox.beginQuotaLogin();assert.deepEqual(f.opened,['https://chatgpt.com/oauth/authorize']);
});
test('production connection: reject non-official destinations, credentials, ports, and missing URLs',async()=>{
 for(const authUrl of ['https://auth.openai.com.evil.invalid/','https://elsewhere.invalid/','http://auth.openai.com/','https://auth.openai.com:444/','https://user:secret@chatgpt.com/','file:///tmp/login',undefined]){
  const f=harness({login:{loginId:'mock',authUrl}});const result=await f.sandbox.beginQuotaLogin();assert.deepEqual(f.opened,[]);assert.equal(result.errorCode,'LOGIN_FAILED');assert(!JSON.stringify(result).includes('secret'));
 }
});
test('production connection: local errors become safe codes, never raw URLs or account data',async()=>{
 const error=new Error('private account token https://private.invalid');error.code='RUNTIME_MISSING';const f=harness({error});
 const result=await f.sandbox.beginQuotaLogin();assert.equal(result.errorCode,'LOGIN_FAILED');assert.equal(result.loginPending,false);assert(!JSON.stringify(result).includes('private'));assert.deepEqual(f.opened,[]);
});
test('production connection: verification mode performs no login, quota read or browser launch',async()=>{
 const f=harness({smoke:true});await f.sandbox.beginQuotaLogin();f.localQuota.emit('login-completed',{success:true});f.localQuota.emit('account-updated');await settle();assert.deepEqual(f.calls,[]);assert.deepEqual(f.opened,[]);
});
test('production login completion success refreshes quota then account status',async()=>{
 const f=harness({status:{authenticated:true,ready:true}});f.localQuota.emit('login-completed',{success:true});await settle();assert.deepEqual(f.calls,['quota','status','publish']);assert.equal(f.sandbox.connection.ready,true);assert.deepEqual(f.opened,[]);
});
test('production login completion failure refreshes status and displays LOGIN_FAILED',async()=>{
 const f=harness();f.localQuota.emit('login-completed',{success:false,error:'private-error'});await settle();assert.equal(f.sandbox.connection.errorCode,'LOGIN_FAILED');assert(!f.calls.includes('quota'));assert(!JSON.stringify(f.sandbox.connection).includes('private-error'));assert.deepEqual(f.opened,[]);
});
test('production account update refreshes current quota and account status without opening login',async()=>{
 const f=harness();f.localQuota.emit('account-updated');await settle();assert.deepEqual(f.calls,['status','publish','quota']);assert.deepEqual(f.opened,[]);
});
test('deployment check only reports ready after actual finite quota usage and a future reset window',async()=>{
 for(const usedPercent of [0,100]){
  const calls=[];const client={setupStatus:async()=>{calls.push('status');return {authenticated:true};},read:async()=>{calls.push('quota');return {state:'ok',limits:[{primary:{usedPercent,durationMins:300,resetsAt:new Date(Date.now()+3600000).toISOString()}}]};}};
  assert.deepEqual(await deploymentReport(client,'fixture'),{version:'fixture',status:'ready',quotaConnected:true,reasonCode:null});assert.deepEqual(calls,['status','quota']);
 }
});
test('deployment check rejects expired, missing, malformed or unavailable quota windows',async()=>{
 const windows=[{usedPercent:1,durationMins:300,resetsAt:new Date(Date.now()-1).toISOString()},{usedPercent:1,durationMins:300},{usedPercent:NaN,durationMins:300,resetsAt:new Date(Date.now()+3600000).toISOString()},{usedPercent:1,durationMins:0,resetsAt:new Date(Date.now()+3600000).toISOString()}];
 for(const window of windows){const client={setupStatus:async()=>({authenticated:true}),read:async()=>({state:'ok',limits:[{secondary:window}]})};assert.equal((await deploymentReport(client,'fixture')).reasonCode,'QUOTA_UNAVAILABLE');}
 const empty={setupStatus:async()=>({authenticated:true}),read:async()=>({state:'error',limits:[]})};assert.equal((await deploymentReport(empty,'fixture')).quotaConnected,false);
});
test('deployment check API key and unauthenticated modes request login without mutating auth',async()=>{
 for(const authType of ['apiKey',null,'other']){
  const client={setupStatus:async()=>({authenticated:false,authType,requiresAccountSwitch:!!authType}),read:async()=>assert.fail('must not read quota without ChatGPT'),login:async()=>assert.fail('must not trigger login'),logout:async()=>assert.fail('must not change auth')};
  assert.deepEqual(await deploymentReport(client,'fixture'),{version:'fixture',status:'login_required',quotaConnected:false,reasonCode:'CHATGPT_LOGIN_REQUIRED'});
 }
});
test('deployment check reports safe connection failures without forwarding account diagnostics',async()=>{
 for(const code of ['RUNTIME_MISSING','REQUEST_TIMEOUT','CONNECTION_CLOSED','SENSITIVE_RAW_MESSAGE']){
  const client={setupStatus:async()=>({authenticated:true}),read:async()=>{const error=new Error('private token');error.code=code;throw error;}};
  const result=await deploymentReport(client,'fixture');assert.equal(result.reasonCode,code==='SENSITIVE_RAW_MESSAGE'?'QUOTA_UNAVAILABLE':code);assert(!JSON.stringify(result).includes('private'));
 }
});
