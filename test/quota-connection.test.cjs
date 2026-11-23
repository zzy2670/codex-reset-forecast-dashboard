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
 localQuota.followDefault=!!options.followDefault;
 localQuota.setupStatus=async()=>{calls.push('status');return options.status||{runtimeAvailable:true,authenticated:false,needsLogin:true,loginPending:true};};
 localQuota.login=async args=>{assert.equal(args.reauthenticate,!options.followDefault);calls.push('login');if(options.error)throw options.error;return options.login||{loginId:'mock-login',authUrl:'https://auth.openai.com/oauth/authorize?state=fixture'};};
 const sandbox={localQuota,URL,smoke:!!options.smoke,connection:{checking:false},connectionFlight:null,quotaAccountRevision:0,accountRefreshFlight:null,quotaLoginInProgress:false,quotaLoginEpoch:0,quotaRunning:false,quotaFlight:null,accountVerified:true,activeAccountAliases:[],activeAccountHint:null,manualQuotaProbe:null,manualQuotaRefreshFlight:null,state:{quota:null,lastGoodQuota:null,localReset:null},recoverLocalReset:()=>{},safeWrite:()=>{},
  refreshQuota:async()=>{calls.push('quota');},publish:()=>calls.push('publish'),
  shell:{openExternal:async url=>{calls.push('browser');opened.push(url);}},
  snapshot:()=>JSON.parse(JSON.stringify(sandbox.connection))};
 vm.createContext(sandbox);vm.runInContext(production,sandbox);
 return {sandbox,localQuota,calls,opened};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('production connection: already authenticated refreshes real quota path without opening browser',async()=>{
 const f=harness({login:{alreadyConnected:true},status:{authenticated:true,ready:true}});
 const result=await f.sandbox.beginQuotaLogin();assert.equal(result.ready,true);assert.deepEqual(f.opened,[]);assert.deepEqual(f.calls.filter(c=>c!=='publish'),['login','status','quota']);
});
test('production connection: unauthenticated opens official authorization after updating pending status',async()=>{
 const f=harness();const result=await f.sandbox.beginQuotaLogin();assert.equal(result.loginPending,true);assert.deepEqual(f.opened,['https://auth.openai.com/oauth/authorize?state=fixture']);assert(f.calls.indexOf('status')<f.calls.indexOf('browser'));assert(!f.calls.includes('quota'));
});
test('cancelling while connection status refreshes does not open authorization',async()=>{
 const f=harness();let release,entered;const waiting=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{entered=resolve;});
 f.localQuota.setupStatus=async()=>{entered();await waiting;return {runtimeAvailable:true,authenticated:false,needsLogin:true,loginPending:false};};
 const login=f.sandbox.beginQuotaLogin();await started;f.sandbox.quotaLoginInProgress=false;release();await login;assert.deepEqual(f.opened,[]);
});
test('default session onboarding opens official authorization without starting a separate account',async()=>{
 const f=harness({followDefault:true});const result=await f.sandbox.beginQuotaLogin();assert.equal(result.loginPending,true);assert.deepEqual(f.opened,['https://auth.openai.com/oauth/authorize?state=fixture']);assert.equal(f.calls.filter(c=>c==='login').length,1);
});
test('cancellation during the default-session status probe prevents login from starting',async()=>{
 const f=harness({followDefault:true});let release,entered;const waiting=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{entered=resolve;});
 f.localQuota.setupStatus=async()=>{entered();await waiting;return {authenticated:false,needsLogin:true};};
 const login=f.sandbox.beginQuotaLogin();await started;f.sandbox.quotaLoginEpoch++;f.sandbox.quotaLoginInProgress=false;release();await login;assert(!f.calls.includes('login'));assert.deepEqual(f.opened,[]);
});
test('default session with an existing account directs switching to Codex instead of replacing credentials',async()=>{
 const f=harness({followDefault:true,status:{authenticated:true}});await assert.rejects(f.sandbox.beginQuotaLogin(),/Codex 桌面端/);assert(!f.calls.includes('login'));assert.deepEqual(f.opened,[]);
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
test('production login completion success verifies account then refreshes quota',async()=>{
 const f=harness({status:{authenticated:true,ready:true}});f.localQuota.emit('login-completed',{success:true});await settle();assert.deepEqual(f.calls.filter(c=>c!=='publish'),['status','quota']);assert.equal(f.sandbox.connection.ready,true);assert.deepEqual(f.opened,[]);
});
test('production login completion failure refreshes status and displays LOGIN_FAILED',async()=>{
 const f=harness();f.localQuota.emit('login-completed',{success:false,error:'private-error'});await settle();assert.equal(f.sandbox.connection.errorCode,'LOGIN_FAILED');assert(!f.calls.includes('quota'));assert(!JSON.stringify(f.sandbox.connection).includes('private-error'));assert.deepEqual(f.opened,[]);
});
test('production account update refreshes current quota and account status without opening login',async()=>{
 const f=harness();f.localQuota.emit('account-updated');await settle();assert.deepEqual(f.calls.filter(c=>c!=='publish'),['status','quota']);assert.deepEqual(f.opened,[]);
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

test('late response from old account cannot overwrite a newer login',async()=>{
 const {quotaView,quotaChanges}=require('../app/codex-quota.cjs'),H=require('../app/local-quota-history.cjs'),P=require('../app/notification-policy.cjs');
 const localQuota=new EventEmitter(),now=Date.now(),a='a'.repeat(64),b='b'.repeat(64),end=new Date(now+86400000).toISOString();
 const quota=(id,used)=>({state:'ok',source:'local-codex',accountFingerprint:id,accountFingerprintKind:'account-id',fetchedAt:new Date(now).toISOString(),limits:[{id:'codex',secondary:{usedPercent:used,durationMins:10080,resetsAt:end}}]});
 let complete,reads=0;localQuota.read=()=>++reads===1?new Promise(resolve=>complete=resolve):Promise.resolve(quota(b,25));localQuota.setupStatus=async()=>({authenticated:true,accountFingerprint:b,accountFingerprintKind:'account-id'});
 const state={settings:{quotaWindow:'secondary'},quota:quota(a,80),lastGoodQuota:quota(a,80),events:[],localQuotaHistory:[]};
 const sb={localQuota,state,Date,URL,smoke:false,connection:{authenticated:true},connectionFlight:null,quotaAccountRevision:0,accountRefreshFlight:null,quotaLoginInProgress:false,quotaRunning:false,quotaFlight:null,accountVerified:true,activeAccountAliases:[],activeAccountHint:null,quotaView,quotaChanges,...H,...P,...require('../app/weekly-account-snapshots.cjs'),safeWrite(){},publish(){},addEvent(e){state.events.push(e);},shell:{},snapshot:()=>({})};
 vm.createContext(sb);vm.runInContext(main.slice(main.indexOf('async function refreshQuota('),main.indexOf('\nfunction trayMenu('))+production,sb);
 const old=sb.refreshQuota();localQuota.emit('account-updated');complete(quota(a,5));await old;await settle();if(sb.accountRefreshFlight)await sb.accountRefreshFlight;
 assert.equal(state.quota.accountFingerprint,b);assert.equal(state.quota.limits[0].secondary.usedPercent,25);assert.equal(state.events.length,0);assert.equal(state.localQuotaHistory.length,0);
});
test('startup visibility gate delays a requested window until UI ready, hidden launch stays hidden',()=>{
 const source=main.slice(main.indexOf('function showWindow()'),main.indexOf('\nfunction addEvent('));let shown=0,focused=0;
 const sb={windowUiReady:false,pendingWindowShow:false,win:{isDestroyed:()=>false,isMinimized:()=>false,show:()=>shown++,focus:()=>focused++}};vm.createContext(sb);vm.runInContext(source,sb);sb.showWindow();assert.equal(shown,0);assert.equal(sb.pendingWindowShow,true);sb.windowUiReady=true;sb.showWindow();assert.equal(shown,1);assert.equal(focused,1);assert.equal(sb.pendingWindowShow,false);
});

test('shared workspace with a different email becomes unverified instead of borrowing history',async()=>{
 const {quotaView,quotaChanges}=require('../app/codex-quota.cjs'),H=require('../app/local-quota-history.cjs'),P=require('../app/notification-policy.cjs');
 const owner='a'.repeat(64),hint1='b'.repeat(64),hint2='c'.repeat(64),now=Date.now();
 function q(hint){const result={state:'ok',source:'local-codex',accountFingerprint:owner,accountFingerprintKind:'account-id',fetchedAt:new Date(now).toISOString(),limits:[{id:'codex',secondary:{usedPercent:15,durationMins:10080,resetsAt:new Date(now+86400000).toISOString()}}]};Object.defineProperty(result,'_accountHint',{value:hint});return result;}
 let current=q(hint1);const state={settings:{quotaWindow:'secondary'},quota:null,lastGoodQuota:null,events:[]};
 const sb={state,Date,smoke:false,connection:{},quotaAccountRevision:0,quotaLoginInProgress:false,quotaRunning:false,quotaFlight:null,accountVerified:false,activeAccountAliases:[],activeAccountHint:null,quotaView,quotaChanges,...H,...P,...require('../app/weekly-account-snapshots.cjs'),localQuota:{read:async()=>current},safeWrite(){},publish(){},addEvent(e){state.events.push(e);},invalidateQuotaForAccountUpdate(){}};
 vm.createContext(sb);vm.runInContext(main.slice(main.indexOf('async function refreshQuota('),main.indexOf('\nfunction trayMenu(')),sb);await sb.refreshQuota();assert.equal(state.quota.accountFingerprint,owner);current=q(hint2);await sb.refreshQuota();assert.equal(state.quota.accountFingerprint,undefined);assert.equal(state.quota.identityUnverified,true);assert.equal(state.events.length,0);assert.equal(state.ambiguousAccountOwners[owner],true);
});

test('manual quota refresh waits for an in-flight read, then checks a fresh reader before reading quota',async()=>{
 const f=harness({status:{authenticated:true}}),order=[];let finish;
 f.sandbox.accountVerified=false;f.sandbox.quotaRunning=true;f.sandbox.quotaFlight=new Promise(resolve=>finish=()=>{order.push('old-complete');f.sandbox.quotaRunning=false;resolve();});
 f.localQuota.setupStatus=async opts=>{order.push('account');assert.equal(opts.freshSession,true);return {authenticated:true};};
 f.sandbox.refreshQuota=async()=>order.push('quota');
 const job=f.sandbox.refreshQuotaAfterAccountCheck();await Promise.resolve();assert.deepEqual(order,[]);finish();await job;assert.deepEqual(order,['old-complete','account','quota']);
});
test('manual quota refresh does not read if the new reader cannot verify the account',async()=>{
 const f=harness();let reads=0;f.localQuota.setupStatus=async opts=>{assert.equal(opts.freshSession,true);return {authenticated:false,errorCode:'CONNECTION_CLOSED'};};f.sandbox.refreshQuota=async()=>reads++;
 await f.sandbox.refreshQuotaAfterAccountCheck();assert.equal(reads,0);assert.equal(f.sandbox.connection.errorCode,'CONNECTION_CLOSED');
});

test('manual refresh reserves the reader across a concurrent account-status flight',async()=>{
 const {quotaView,quotaChanges}=require('../app/codex-quota.cjs'),H=require('../app/local-quota-history.cjs'),P=require('../app/notification-policy.cjs');
 const localQuota=new EventEmitter(),order=[],owner='a'.repeat(64),now=Date.now();let finishOld,finishStatus;
 const quota={state:'ok',source:'local-codex',accountFingerprint:owner,fetchedAt:new Date(now).toISOString(),limits:[{id:'codex',secondary:{usedPercent:10,durationMins:10080,resetsAt:new Date(now+86400000).toISOString()}}]};
 const oldFlight=new Promise(resolve=>finishOld=resolve);
 localQuota.setupStatus=async opts=>{order.push(opts.freshSession?'fresh-reader':'stale-reader');return new Promise(resolve=>finishStatus=()=>resolve({authenticated:true}));};
 localQuota.read=async()=>{order.push('quota');return quota;};
 const state={settings:{quotaWindow:'secondary'},quota:null,lastGoodQuota:null,events:[]};
 const sb={localQuota,state,Date,URL,smoke:false,connection:{authenticated:true},connectionFlight:oldFlight,quotaAccountRevision:0,accountRefreshFlight:null,quotaLoginInProgress:false,quotaRunning:false,quotaFlight:null,accountVerified:false,activeAccountAliases:[],activeAccountHint:null,manualQuotaProbe:null,manualQuotaRefreshFlight:null,quotaView,quotaChanges,...H,...P,...require('../app/weekly-account-snapshots.cjs'),safeWrite(){},publish(){},addEvent(){},shell:{},snapshot:()=>({})};
 vm.createContext(sb);vm.runInContext(main.slice(main.indexOf('async function refreshQuota('),main.indexOf('\nfunction trayMenu('))+production,sb);
 const manual=sb.refreshQuotaAfterAccountCheck(),concurrent=sb.refreshQuota();await settle();assert.deepEqual(order,[]);
 sb.connectionFlight=null;finishOld();await settle();assert.deepEqual(order,['fresh-reader']);
 finishStatus();await Promise.race([Promise.all([manual,concurrent]),new Promise((_,reject)=>setTimeout(()=>reject(new Error('deadlock')),1000))]);
 assert.deepEqual(order,['fresh-reader','quota']);assert.equal(state.quota.accountFingerprint,owner);
});

test('failed manual identity check also prevents a concurrently queued quota read',async()=>{
 const {quotaView,quotaChanges}=require('../app/codex-quota.cjs'),H=require('../app/local-quota-history.cjs'),P=require('../app/notification-policy.cjs');let finish,reads=0;
 const localQuota=new EventEmitter();localQuota.setupStatus=async()=>new Promise(resolve=>finish=()=>resolve({authenticated:false,errorCode:'CONNECTION_CLOSED'}));localQuota.read=async()=>{reads++;throw new Error('must not read');};
 const sb={localQuota,state:{settings:{},quota:null,events:[]},Date,URL,smoke:false,connection:{authenticated:true},connectionFlight:null,quotaAccountRevision:0,accountRefreshFlight:null,quotaLoginInProgress:false,quotaRunning:false,quotaFlight:null,accountVerified:false,activeAccountAliases:[],activeAccountHint:null,manualQuotaProbe:null,manualQuotaRefreshFlight:null,quotaView,quotaChanges,...H,...P,...require('../app/weekly-account-snapshots.cjs'),safeWrite(){},publish(){},addEvent(){},shell:{},snapshot:()=>({})};
 vm.createContext(sb);vm.runInContext(main.slice(main.indexOf('async function refreshQuota('),main.indexOf('\nfunction trayMenu('))+production,sb);
 const manual=sb.refreshQuotaAfterAccountCheck(),concurrent=sb.refreshQuota();await settle();assert.equal(reads,0);finish();await Promise.all([manual,concurrent]);assert.equal(reads,0);assert.equal(sb.connection.errorCode,'CONNECTION_CLOSED');
});

test('quit while manual refresh waits does not restart a reader or start quota read',async()=>{
 const f=harness({status:{authenticated:true}});let finish,status=0,reads=0;
 f.sandbox.quitting=false;f.sandbox.connectionFlight=new Promise(resolve=>finish=resolve);
 f.localQuota.setupStatus=async()=>{status++;return {authenticated:true};};f.sandbox.refreshQuota=async()=>reads++;
 const manual=f.sandbox.refreshQuotaAfterAccountCheck();await settle();f.sandbox.quitting=true;f.sandbox.connectionFlight=null;finish();await manual;
 assert.equal(status,0);assert.equal(reads,0);assert.equal(f.sandbox.manualQuotaProbe,null);
});
test('quit during quota read discards result and schedules no new connection',async()=>{
 const {quotaView,quotaChanges}=require('../app/codex-quota.cjs'),H=require('../app/local-quota-history.cjs'),P=require('../app/notification-policy.cjs');let finish,status=0;
 const localQuota=new EventEmitter();localQuota.read=()=>new Promise(resolve=>finish=resolve);localQuota.setupStatus=async()=>{status++;return {authenticated:true};};
 const state={settings:{},quota:null,events:[]},sb={localQuota,state,Date,URL,smoke:false,quitting:false,connection:{},connectionFlight:null,quotaAccountRevision:0,accountRefreshFlight:null,quotaLoginInProgress:false,quotaRunning:false,quotaFlight:null,accountVerified:false,activeAccountAliases:[],activeAccountHint:null,manualQuotaProbe:null,manualQuotaRefreshFlight:null,quotaView,quotaChanges,...H,...P,...require('../app/weekly-account-snapshots.cjs'),safeWrite(){},publish(){},addEvent(){},shell:{},snapshot:()=>({})};
 vm.createContext(sb);vm.runInContext(main.slice(main.indexOf('async function refreshQuota('),main.indexOf('\nfunction trayMenu('))+production,sb);
 const flight=sb.refreshQuota();sb.quitting=true;finish({state:'ok',source:'local-codex',accountFingerprint:'a'.repeat(64),fetchedAt:new Date().toISOString(),limits:[]});await flight;await sb.refreshConnection({freshSession:true});
 assert.equal(state.quota,null);assert.equal(status,0);assert.equal(sb.accountVerified,false);
});

function freshAccountHarness(candidateMode='same',emitStartup=true){
 const f=harness({status:{authenticated:true}}),owner='a'.repeat(64),hint='c'.repeat(64),observations=[];
 f.sandbox.accountVerified=true;f.sandbox.activeAccountHint=hint;f.sandbox.state.quota={accountFingerprint:owner,source:'local-codex',state:'ok'};f.sandbox.state.lastGoodQuota={...f.sandbox.state.quota};
 f.sandbox.publish=()=>observations.push({hasQuota:!!f.sandbox.state.quota,checking:!!f.sandbox.connection.identityChecking,cacheChecking:!!f.sandbox.connection.cacheChecking});
 f.localQuota.setupStatus=async opts=>{if(opts.freshSession&&emitStartup){f.localQuota.freshSessionStarting=true;await Promise.resolve();f.localQuota.emit('account-updated');f.localQuota.freshSessionStarting=false;}const status={authenticated:true,identityUnverified:true};Object.defineProperty(status,'_accountHint',{value:hint});return status;};
 f.localQuota.read=async()=>{if(candidateMode==='error')throw new Error('fixture unavailable');if(candidateMode==='update')f.localQuota.emit('account-updated');const result={accountFingerprint:candidateMode==='different'?'b'.repeat(64):candidateMode==='email-only'?undefined:owner};Object.defineProperty(result,'_accountHint',{value:candidateMode==='different-email'?'d'.repeat(64):hint});return result;};
 return {...f,observations};
}
test('fresh-reader initialization update keeps quota only after proving the same account ID and hint',async()=>{
 const f=freshAccountHarness();await f.sandbox.refreshConnection({freshSession:true});
 assert(f.observations.some(x=>x.checking));assert(f.observations.every(x=>x.hasQuota));assert.equal(f.sandbox.connection.identityChecking,undefined);assert.equal(f.sandbox.state.quota.accountFingerprint,'a'.repeat(64));
});
test('fresh-reader initialization refuses changed or unprovable identity and an update during verification',async()=>{
 for(const mode of ['different','different-email','email-only','error','update']){
  const f=freshAccountHarness(mode);await f.sandbox.refreshConnection({freshSession:true});if(f.sandbox.accountRefreshFlight)await f.sandbox.accountRefreshFlight;
  assert(f.observations.some(x=>!x.hasQuota),mode);assert.equal(f.sandbox.state.quota,null,mode);
 }
});
test('ordinary account update outside fresh-reader startup invalidates immediately',()=>{
 const f=freshAccountHarness();f.localQuota.freshSessionStarting=false;f.localQuota.emit('account-updated');assert.equal(f.sandbox.state.quota,null);
});

test('identity check snapshot does not expose cached quota, account history or notifications',()=>{
 const owner='a'.repeat(64),state={sources:[],settings:{hypotheticalDays:3},quota:{accountFingerprint:owner},events:[{kind:'quota_reset',accountFingerprint:owner},{kind:'confirmed'}],notificationGroups:[{private:true}],localResetReceipts:{private:true}};
 const sb={Date,state,SOURCES:[],activeAccountHint:null,weeklyAccountRows:require('../app/weekly-account-snapshots.cjs').weeklyAccountRows,connection:{identityChecking:true},accountVerified:true,verification:false,activeAccountAliases:[],quotaView:()=>null,projectAfterReset:s=>s,calibratedReset:()=>({}),resetHistory:()=>[],historyStart:()=>0,localQuotaHistoryRows:()=>{throw new Error('must not project account history');},hypotheticalPace:()=>({}),smoke:false,deploymentCheck:false,running:false,app:{getVersion:()=> 'fixture'},Notification:{isSupported:()=>false}};
 vm.createContext(sb);vm.runInContext(main.slice(main.indexOf('function snapshot()'),main.indexOf('\nfunction publish()')),sb);const result=sb.snapshot();assert.equal(result.quota,null);assert.equal(result.quotaDisplay,null);assert.equal(result.localQuotaHistory.length,0);assert.equal(result.events.length,1);assert.equal(result.events[0].kind,'confirmed');assert.equal(result.notificationGroups,undefined);assert.equal(result.localResetReceipts,undefined);
});

test('fresh identity verification serializes concurrent quota reads until the same account is proved',async()=>{
 const {quotaView,quotaChanges}=require('../app/codex-quota.cjs'),H=require('../app/local-quota-history.cjs'),P=require('../app/notification-policy.cjs');
 const localQuota=new EventEmitter(),owner='a'.repeat(64),hint='c'.repeat(64),now=Date.now();let finish,reads=0;
 const quota=()=>{const q={state:'ok',source:'local-codex',accountFingerprint:owner,fetchedAt:new Date(now).toISOString(),limits:[{id:'codex',secondary:{usedPercent:10,durationMins:10080,resetsAt:new Date(now+86400000).toISOString()}}]};Object.defineProperty(q,'_accountHint',{value:hint});return q;};
 localQuota.setupStatus=async opts=>{if(opts.freshSession){localQuota.freshSessionStarting=true;localQuota.emit('account-updated');localQuota.freshSessionStarting=false;}const status={authenticated:true};Object.defineProperty(status,'_accountHint',{value:hint});return status;};
 localQuota.read=async()=>++reads===1?new Promise(resolve=>finish=()=>resolve(quota())):quota();
 const state={settings:{quotaWindow:'secondary'},quota:quota(),lastGoodQuota:quota(),events:[]};const sb={localQuota,state,Date,URL,smoke:false,connection:{authenticated:true},connectionFlight:null,quotaAccountRevision:0,accountRefreshFlight:null,quotaLoginInProgress:false,quotaRunning:false,quotaFlight:null,accountVerified:true,activeAccountAliases:[],activeAccountHint:hint,manualQuotaProbe:null,identityProbeBarrier:null,manualQuotaRefreshFlight:null,quotaView,quotaChanges,...H,...P,...require('../app/weekly-account-snapshots.cjs'),safeWrite(){},publish(){},addEvent(){},shell:{},snapshot:()=>({})};
 vm.createContext(sb);vm.runInContext(main.slice(main.indexOf('async function refreshQuota('),main.indexOf('\nfunction trayMenu('))+production,sb);
 const probe=sb.refreshConnection({freshSession:true});await settle();assert.equal(sb.connection.identityChecking,true);const concurrent=sb.refreshQuota();await settle();assert.equal(reads,1);finish();await Promise.all([probe,concurrent]);assert.equal(reads,2);assert.equal(sb.connection.identityChecking,undefined);assert.equal(state.quota.accountFingerprint,owner);
});

test('periodic startup check exposes only clearly labeled verified cache and immediately clears on mismatch',async()=>{
 for(const mode of ['same','different','different-email','email-only','error','update']){
  const f=freshAccountHarness(mode);await f.sandbox.refreshConnection({freshSession:true,allowVerifiedCache:true});if(f.sandbox.accountRefreshFlight)await f.sandbox.accountRefreshFlight;
  assert(f.observations.some(x=>x.checking&&x.cacheChecking&&x.hasQuota),mode);
  if(mode==='same'){assert(f.observations.every(x=>x.hasQuota));assert.equal(f.sandbox.connection.cacheChecking,undefined);}
  else{assert(f.observations.some(x=>!x.hasQuota),mode);assert.equal(f.sandbox.state.quota,null,mode);}
 }
});
test('manual startup check and unverified cache cannot use periodic cached display',async()=>{
 const manual=freshAccountHarness();await manual.sandbox.refreshConnection({freshSession:true});assert(manual.observations.some(x=>x.checking&&!x.cacheChecking));
 const unknown=freshAccountHarness();unknown.sandbox.activeAccountHint=null;await unknown.sandbox.refreshConnection({freshSession:true,allowVerifiedCache:true});assert(unknown.observations.some(x=>x.checking&&!x.cacheChecking));assert.equal(unknown.sandbox.state.quota,null);
});
test('periodic cached snapshot keeps only previous verified account data and marks cache provenance',()=>{
 const owner='a'.repeat(64),other='b'.repeat(64),state={sources:[],settings:{hypotheticalDays:3},quota:{accountFingerprint:owner},events:[{kind:'quota_reset',accountFingerprint:owner},{kind:'quota_reset',accountFingerprint:other},{kind:'confirmed'}],notificationGroups:[{private:true}]};
 const sb={Date,state,SOURCES:[],activeAccountHint:null,weeklyAccountRows:require('../app/weekly-account-snapshots.cjs').weeklyAccountRows,connection:{identityChecking:true,cacheChecking:true},accountVerified:true,verification:false,activeAccountAliases:[],quotaView:q=>q,projectAfterReset:s=>s,calibratedReset:()=>({}),resetHistory:()=>[],historyStart:()=>0,localQuotaHistoryRows:(_s,_n,id)=>{assert.equal(id,owner);return [{accountFingerprint:owner}];},hypotheticalPace:()=>({}),smoke:false,deploymentCheck:false,running:false,app:{getVersion:()=> 'fixture'},Notification:{isSupported:()=>false}};
 vm.createContext(sb);vm.runInContext(main.slice(main.indexOf('function snapshot()'),main.indexOf('\nfunction publish()')),sb);const result=sb.snapshot();assert.equal(result.quotaCacheChecking,true);assert.equal(result.quota.accountFingerprint,owner);assert.equal(result.localQuotaHistory.length,1);assert.equal(result.events.length,2);assert(!result.events.some(e=>e.accountFingerprint===other));assert.equal(result.notificationGroups,undefined);
});

test('periodic cache freezes prior verified projections instead of combining new sources with stale quota',()=>{
 const owner='a'.repeat(64),frozen={sources:[{id:'old',forecast:{state:'none'}}],consensus:{state:'confirmed'},history:[{id:'old-history'}],hypothetical:{origin:'old'}};
 const state={sources:[],settings:{hypotheticalDays:3},quota:{accountFingerprint:owner},events:[]};
 const sb={Date,state,SOURCES:[],activeAccountHint:null,weeklyAccountRows:require('../app/weekly-account-snapshots.cjs').weeklyAccountRows,connection:{identityChecking:true,cacheChecking:true},accountVerified:true,verification:false,activeAccountAliases:[],lastVerifiedProjection:frozen,quotaView:q=>q,projectAfterReset:()=>{throw new Error('must not project stale quota');},calibratedReset:()=>{throw new Error('must remain frozen');},resetHistory:()=>{throw new Error('must remain frozen');},historyStart:()=>0,localQuotaHistoryRows:()=>[],hypotheticalPace:()=>{throw new Error('must remain frozen');},smoke:false,deploymentCheck:false,running:false,app:{getVersion:()=> 'fixture'},Notification:{isSupported:()=>false}};
 vm.createContext(sb);vm.runInContext(main.slice(main.indexOf('function snapshot()'),main.indexOf('\nfunction publish()')),sb);const result=sb.snapshot();assert.equal(result.quotaCacheChecking,true);assert.equal(result.sources[0].id,'old');assert.equal(result.history[0].id,'old-history');assert.equal(result.hypothetical.origin,'old');
});

test('fresh polling marks cached provenance immediately even if the reader has not emitted an update',async()=>{
 const f=freshAccountHarness('same',false),hint='c'.repeat(64);let release;
 f.localQuota.setupStatus=()=>new Promise(resolve=>release=()=>{const status={authenticated:true};Object.defineProperty(status,'_accountHint',{value:hint});resolve(status);});
 const pending=f.sandbox.refreshConnection({freshSession:true,allowVerifiedCache:true});await settle();assert(f.observations.some(x=>x.checking&&x.cacheChecking&&x.hasQuota));assert.equal(f.sandbox.connection.identityChecking,true);
 release();await pending;assert.equal(f.sandbox.state.quota.accountFingerprint,'a'.repeat(64));assert.equal(f.sandbox.connection.identityChecking,undefined);
});
test('fresh polling with no startup event still requires matching workspace ID and hint',async()=>{
 for(const mode of ['same','different','different-email','email-only','error']){
  const f=freshAccountHarness(mode,false);await f.sandbox.refreshConnection({freshSession:true,allowVerifiedCache:true});if(f.sandbox.accountRefreshFlight)await f.sandbox.accountRefreshFlight;
  assert(f.observations.some(x=>x.checking&&x.cacheChecking),mode);
  if(mode==='same')assert.equal(f.sandbox.state.quota.accountFingerprint,'a'.repeat(64),mode);else assert.equal(f.sandbox.state.quota,null,mode);
 }
});
test('fresh polling timeout with no update clears old quota instead of treating it as current',async()=>{
 const f=freshAccountHarness('same',false);f.localQuota.setupStatus=async()=>({authenticated:false,errorCode:'REQUEST_TIMEOUT'});
 await f.sandbox.refreshConnection({freshSession:true,allowVerifiedCache:true});assert(f.observations.some(x=>x.checking&&x.cacheChecking));assert.equal(f.sandbox.state.quota,null);assert.equal(f.sandbox.accountVerified,false);assert.equal(f.sandbox.connection.errorCode,'REQUEST_TIMEOUT');
});
