'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const fs=require('node:fs'),os=require('node:os');
const {EventEmitter}=require('node:events'),{PassThrough,Writable}=require('node:stream');
const {LocalCodexQuota}=require('../app/codex-quota.cjs');
const {findCodex,codexCandidates}=require('../app/codex-discovery.cjs');
function fixture(responder,options={}){
 const calls=[],children=[],spawned=[];
 const spawn=(exe,args,spawnOptions)=>{
  const child=new EventEmitter();children.push(child);spawned.push(spawnOptions);child.stdout=new PassThrough();child.stderr=new PassThrough();child.exitCode=null;
  child.send=m=>child.stdout.write(JSON.stringify(m)+'\n');
  child.stdin=new Writable({write(chunk,encoding,done){const m=JSON.parse(chunk.toString());calls.push(m);if(m.id!==undefined)queueMicrotask(()=>responder(m,child));done();}});
  child.kill=()=>{child.exitCode=0;child.emit('exit',0);};
  assert.deepEqual(args,['app-server','--listen','stdio://']);assert.equal(spawnOptions.windowsHide,true);assert.equal(spawnOptions.shell,undefined);
  return child;
 };
 const client=new LocalCodexQuota({spawn,findCodex:()=>'/fixture/codex.exe',timeoutMs:100,...options});
 return {client,calls,children,spawned};
}
function respond(m,child,result){child.send({id:m.id,result});}

test('following the desktop session ignores an existing dashboard login and rechecks the default session',async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'codex-follow-desktop-')),managedHome=path.join(temp,'account');fs.mkdirSync(managedHome);
 let current='account-a';
 const f=fixture((m,c)=>respond(m,c,m.method==='account/read'?{account:{type:'chatgpt',accountId:current}}:{}),{managedHome,followDefault:true});
 try{
  const first=await f.client.setupStatus();assert.equal(first.authenticated,true);assert.equal(first.managed,false);assert.equal(f.spawned[0].env,undefined);
  current='account-b';const next=await f.client.setupStatus({freshSession:true});
  assert.equal(next.managed,false);assert.notEqual(next.accountFingerprint,first.accountFingerprint);assert.equal(f.spawned[1].env,undefined);
  assert.equal(fs.existsSync(managedHome),true,'the previous independent login directory is preserved');
  assert.ok(!f.calls.some(c=>c.method==='account/logout'||c.method.startsWith('config/')));
 }finally{f.client.stop();fs.rmSync(temp,{recursive:true,force:true});}
});

test('empty default session authorizes in that same session and follows it after reconnect',async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'codex-follow-login-')),managedHome=path.join(temp,'account');
 let account=null;
 const f=fixture((m,c)=>respond(m,c,m.method==='account/read'?{account}:m.method==='account/login/start'?{loginId:'default-login',authUrl:'https://auth.openai.com/oauth/authorize?state=fixture'}:{}),{managedHome,followDefault:true});
 try{
  assert.equal((await f.client.setupStatus()).needsLogin,true);
  const login=await f.client.login({reauthenticate:false});assert.equal(login.loginId,'default-login');assert.equal(f.spawned[0].env,undefined);assert.equal(fs.existsSync(managedHome),false);
  account={type:'chatgpt',accountId:'signed-in'};f.children[0].send({method:'account/login/completed',params:{loginId:'default-login',success:true}});
  const current=await f.client.setupStatus({freshSession:true});assert.equal(current.authenticated,true);assert.equal(current.managed,false);assert.equal(f.spawned[1].env,undefined);
  assert.deepEqual(await f.client.login({reauthenticate:true}),{alreadyConnected:true});assert.equal(f.calls.filter(c=>c.method==='account/login/start').length,1);assert(!f.calls.some(c=>c.method==='account/logout'));
 }finally{f.client.stop();fs.rmSync(temp,{recursive:true,force:true});}
});
test('default session does not silently create a separate login for an API-key account',async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'codex-follow-api-')),managedHome=path.join(temp,'account');
 const f=fixture((m,c)=>respond(m,c,m.method==='account/read'?{account:{type:'apiKey'}}:{}),{managedHome,followDefault:true});
 try{await assert.rejects(f.client.login(),{code:'ACCOUNT_SWITCH_REQUIRED'});assert.equal(fs.existsSync(managedHome),false);assert(!f.calls.some(c=>c.method==='account/login/start'||c.method==='account/logout'));}finally{f.client.stop();fs.rmSync(temp,{recursive:true,force:true});}
});

test('explicit reconnect restarts stale ChatGPT reader and opens dedicated authorization without global logout',async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'codex-reconnect-')),managedHome=path.join(temp,'account');
 const f=fixture((m,c)=>respond(m,c,m.method==='account/read'?{account:{type:'chatgpt'}}:m.method==='account/login/start'?{loginId:'reconnect',authUrl:'https://auth.openai.com/oauth/authorize?state=fixture'}:{}),{managedHome});
 try{
  assert.equal((await f.client.setupStatus()).authenticated,true);
  const login=await f.client.login({reauthenticate:true});assert.equal(login.loginId,'reconnect');
  assert.equal(f.children.length,2);assert.equal(f.children[0].stdin.writableEnded,true);assert.equal(f.spawned[1].env.CODEX_HOME,managedHome);
  assert.deepEqual(await f.client.login({reauthenticate:true}),login);assert.equal(f.calls.filter(c=>c.method==='account/login/start').length,1);
  assert.ok(!f.calls.some(c=>c.method==='account/logout'||c.method.startsWith('config/')));
  await f.client.cancelLogin();assert.equal((await f.client.login({reauthenticate:true})).loginId,'reconnect');
  await f.client.cancelLogin();
  const count=f.calls.filter(c=>c.method==='account/login/start').length;
  const [one,two]=await Promise.all([f.client.login({reauthenticate:true}),f.client.login({reauthenticate:true})]);
  assert.deepEqual(one,two);assert.equal(f.calls.filter(c=>c.method==='account/login/start').length,count+1);
 }finally{f.client.stop();fs.rmSync(temp,{recursive:true,force:true});}
});
test('bundled native binary wins and discovery never executes command shims',()=>{
 const candidates=codexCandidates({resourcesPath:'bundle',env:{APPDATA:'roaming',PATH:'"custom prefix";other',npm_config_prefix:'custom npm'},delimiter:';',home:'home',arch:'x64'});
 assert.equal(candidates[0],path.join('bundle','codex','codex.exe'));
 assert(candidates.includes(path.join('custom prefix','codex.exe')));
 assert(candidates.includes(path.join('custom npm','node_modules','@openai','codex','node_modules','@openai','codex-win32-x64','vendor','x86_64-pc-windows-msvc','codex','codex.exe')));
 assert(candidates.includes(path.join('custom prefix','node_modules','@openai','codex-sdk','vendor','x86_64-pc-windows-msvc','codex','codex.exe')));
 assert(candidates.every(p=>p.endsWith('codex.exe')));
 assert.equal(findCodex({resourcesPath:'bundle',env:{PATH:''},isFile:p=>p===candidates[0]}),candidates[0]);
 assert.equal(findCodex({resourcesPath:null,env:{PATH:''},isFile:()=>false}),null);
});
test('account summary excludes account metadata and never starts login implicitly',async()=>{
 const f=fixture((m,c)=>respond(m,c,m.method==='account/read'?{account:{type:'chatgpt',email:'private@example.invalid',accountId:'private',token:'secret'}}:{}));
 try{const s=await f.client.setupStatus();assert.equal(s.authenticated,true);assert.equal(s.ready,false);assert.equal(s.authType,'chatgpt');assert(!JSON.stringify(s).includes('private'));assert(!JSON.stringify(s).includes('secret'));assert.deepEqual(f.calls.map(c=>c.method),['initialize','initialized','account/read']);assert.deepEqual(f.calls[2].params,{refreshToken:false});assert.deepEqual(await f.client.login(),{alreadyConnected:true});}finally{f.client.stop();}
});
test('fresh account performs browser login and receives only sanitized completion events',async()=>{
 let account=null;
 const f=fixture((m,c)=>respond(m,c,m.method==='account/read'?{account}:m.method==='account/login/start'?{type:'chatgpt',loginId:'login-1',authUrl:'https://auth.openai.com/oauth/authorize?state=fixture'}:{}));
 const events=[];f.client.on('login-completed',v=>events.push(v));f.client.on('account-updated',()=>events.push('updated'));
 try{
  const status=await f.client.setupStatus();assert.equal(status.needsLogin,true);
  const login=await f.client.login();assert.equal(login.loginId,'login-1');assert.equal((await f.client.setupStatus()).loginPending,true);
  assert.deepEqual(await f.client.login(),login);assert.equal(f.calls.filter(c=>c.method==='account/login/start').length,1);
  assert.deepEqual(f.calls.find(c=>c.method==='account/login/start').params,{type:'chatgpt'});
  f.children[0].send({method:'account/login/completed',params:{loginId:'unrelated',success:true,error:'secret'}});assert.equal(events.length,0);
  f.children[0].send({method:'account/login/completed',params:{loginId:'login-1',success:true,error:'secret'}});account={type:'chatgpt'};
  f.children[0].send({method:'account/updated',params:{authMode:'chatgpt',email:'secret'}});
  assert.deepEqual(events,[{success:true},'updated']);assert.equal((await f.client.setupStatus()).authenticated,true);
 }finally{f.client.stop();}
});
test('API key or other authentication requires user switching, with no logout or login mutation',async()=>{
 for(const type of ['apiKey','amazonBedrock','personalAccessToken']){
  const f=fixture((m,c)=>respond(m,c,m.method==='account/read'?{account:{type}}:{}));
  try{assert.equal((await f.client.setupStatus()).requiresAccountSwitch,true);await assert.rejects(f.client.login(),{code:'ACCOUNT_SWITCH_REQUIRED'});assert(!f.calls.some(c=>/login\/start|logout|config/.test(c.method)));}finally{f.client.stop();}
 }
});
test('cancel only cancels the dashboard pending flow and does not log out',async()=>{
 const f=fixture((m,c)=>respond(m,c,m.method==='account/read'?{account:null}:m.method==='account/login/start'?{loginId:'mine',authUrl:'https://auth.openai.com/oauth/authorize'}:{}));
 try{assert.deepEqual(await f.client.cancelLogin(),{cancelled:false});await f.client.login();assert.deepEqual(await f.client.cancelLogin(),{cancelled:true});assert.deepEqual(f.calls.find(c=>c.method==='account/login/cancel').params,{loginId:'mine'});assert(!f.calls.some(c=>c.method==='account/logout'));}finally{f.client.stop();}
});
test('cancellation waits for an in-flight login start and cancels its eventual attempt',async()=>{
 let release;const started=new Promise(resolve=>{release=resolve;});let reply;
 const f=fixture((m,c)=>{if(m.method==='account/login/start'){reply=()=>respond(m,c,{loginId:'late',authUrl:'https://auth.openai.com/oauth/authorize'});release();}else respond(m,c,m.method==='account/read'?{account:null}:{});});
 try{const login=f.client.login();await started;const cancel=f.client.cancelLogin();reply();await login;assert.deepEqual(await cancel,{cancelled:true});assert.equal(f.client.loginAttempt,null);assert.deepEqual(f.calls.find(c=>c.method==='account/login/cancel').params,{loginId:'late'});}finally{f.client.stop();}
});
test('immediate retry waits for cancellation and starts a distinct authorization',async()=>{
 let release;const started=new Promise(resolve=>{release=resolve;});let reply,count=0;
 const f=fixture((m,c)=>{if(m.method==='account/login/start'){count++;if(count===1){reply=()=>respond(m,c,{loginId:'first',authUrl:'https://auth.openai.com/oauth/authorize?state=first'});release();}else respond(m,c,{loginId:'second',authUrl:'https://auth.openai.com/oauth/authorize?state=second'});}else respond(m,c,m.method==='account/read'?{account:null}:{});});
 try{const first=f.client.login();await started;const cancelling=f.client.cancelLogin();const retry=f.client.login();reply();await first;await cancelling;assert.equal((await retry).loginId,'second');assert.deepEqual(f.calls.filter(c=>c.method==='account/login/cancel').map(c=>c.params.loginId),['first']);assert.equal(count,2);}finally{f.client.stop();}
});
test('runtime missing returns a typed setup result without starting anything',async()=>{
 const f=fixture(()=>assert.fail('must not spawn'),{findCodex:()=>null});assert.equal((await f.client.setupStatus()).errorCode,'RUNTIME_MISSING');await assert.rejects(f.client.read(),{code:'RUNTIME_MISSING'});assert.equal(f.children.length,0);
});
test('request timeout clears pending, restarts the child, and quota succeeds on retry',async()=>{
 let ignore=true;
 const f=fixture((m,c)=>{if(m.method==='account/rateLimits/read'&&ignore)return;respond(m,c,m.method==='account/read'?{account:{type:'chatgpt'}}:m.method==='account/rateLimits/read'?{rateLimits:{primary:{usedPercent:9,windowDurationMins:300,resetsAt:2000000000}}}:{});},{timeoutMs:15});
 try{await assert.rejects(f.client.read(),{code:'REQUEST_TIMEOUT'});assert.equal(f.client.pending.size,0);assert.equal(f.client.child,null);ignore=false;assert.equal((await f.client.read()).limits[0].primary.usedPercent,9);assert.equal(f.children.length,2);}finally{f.client.stop();}
});
test('child exit rejects inflight calls and a later retry initializes a new child',async()=>{
 let exit=true;
 const f=fixture((m,c)=>{if(m.method==='account/read'&&exit){c.emit('exit',1);return;}respond(m,c,m.method==='account/read'?{account:{type:'chatgpt'}}:{});});
 try{assert.equal((await f.client.setupStatus()).errorCode,'CONNECTION_CLOSED');assert.equal(f.client.pending.size,0);exit=false;assert.equal((await f.client.setupStatus()).authenticated,true);assert.equal(f.children.length,2);}finally{f.client.stop();}
});
test('protocol errors do not expose raw diagnostics and remain retryable',async()=>{
 let fail=true;const f=fixture((m,c)=>{if(m.method==='account/read'&&fail){c.send({id:m.id,error:{message:'secret token and account'}});return;}respond(m,c,m.method==='account/read'?{account:{type:'chatgpt'}}:{});});
 try{const status=await f.client.setupStatus();assert.equal(status.errorCode,'RPC_ERROR');assert(!JSON.stringify(status).includes('secret'));fail=false;assert.equal((await f.client.setupStatus()).authenticated,true);}finally{f.client.stop();}
});
test('login does not accept non-official auth destinations',async()=>{
 for(const authUrl of ['https://auth.openai.com.evil.invalid/oauth','http://auth.openai.com/oauth','https://elsewhere.invalid/','https://auth.openai.com:444/oauth','https://user:pass@chatgpt.com/oauth']){
  const f=fixture((m,c)=>respond(m,c,m.method==='account/read'?{account:null}:m.method==='account/login/start'?{loginId:'fixture',authUrl}:{}));
  try{await assert.rejects(f.client.login(),{code:'LOGIN_RESPONSE_INVALID'});assert.equal(f.client.loginAttempt,null);}finally{f.client.stop();}
 }
});
test('login reply and completion in the same stdout chunk preserve the owned completion',async()=>{
 const events=[];
 const f=fixture((m,c)=>{
  if(m.method==='account/login/start')c.stdout.write(JSON.stringify({id:m.id,result:{loginId:'fast',authUrl:'https://chatgpt.com/oauth/authorize'}})+'\n'+JSON.stringify({method:'account/login/completed',params:{loginId:'other',success:true,error:'private'}})+'\n'+JSON.stringify({method:'account/login/completed',params:{loginId:'fast',success:true,error:'private'}})+'\n');
  else respond(m,c,m.method==='account/read'?{account:null}:{});
 });f.client.on('login-completed',v=>events.push(v));
 try{assert.equal((await f.client.login()).loginId,'fast');assert.deepEqual(events,[{success:true}]);assert.equal(f.client.loginAttempt,null);assert.equal(f.client.loginCompletions.size,0);}finally{f.client.stop();}
});
test('unrelated fast completions remain bounded and cannot complete the owned flow',async()=>{
 const events=[];let largest=0;
 const f=fixture((m,c)=>{
  if(m.method==='account/login/start'){
   for(let i=0;i<40;i++){c.send({method:'account/login/completed',params:{loginId:'other-'+i,success:true}});largest=Math.max(largest,f.client.loginCompletions.size);}
   respond(m,c,{loginId:'owned',authUrl:'https://auth.openai.com:443/oauth/authorize'});
  }else respond(m,c,m.method==='account/read'?{account:null}:{});
 });f.client.on('login-completed',v=>events.push(v));
 try{await f.client.login();assert.equal(largest,16);assert.deepEqual(events,[]);assert.equal(f.client.loginAttempt.loginId,'owned');assert.equal(f.client.loginCompletions.size,0);f.children[0].send({method:'account/login/completed',params:{loginId:'other-39',success:true}});assert.deepEqual(events,[]);}finally{f.client.stop();}
});
test('late completion arriving during cancellation cannot report login success',async()=>{
 const events=[];
 const f=fixture((m,c)=>{
  if(m.method==='account/login/cancel')c.stdout.write(JSON.stringify({method:'account/login/completed',params:{loginId:'pending',success:true}})+'\n'+JSON.stringify({id:m.id,result:{}})+'\n');
  else respond(m,c,m.method==='account/read'?{account:null}:m.method==='account/login/start'?{loginId:'pending',authUrl:'https://auth.openai.com/oauth/authorize'}:{});
 });f.client.on('login-completed',v=>events.push(v));
 try{await f.client.login();await f.client.cancelLogin();assert.deepEqual(events,[]);assert.equal(f.client.loginAttempt,null);assert.equal(f.client.loginCompletions.size,0);}finally{f.client.stop();}
});
test('simultaneous setup and login reuse initialization and one login attempt',async()=>{
 const f=fixture((m,c)=>respond(m,c,m.method==='account/read'?{account:null}:m.method==='account/login/start'?{loginId:'single',authUrl:'https://auth.openai.com/oauth/authorize'}:{}));
 try{const [a,b]=await Promise.all([f.client.login(),f.client.login(),f.client.setupStatus()]);assert.deepEqual(a,b);assert.equal(f.calls.filter(c=>c.method==='initialize').length,1);assert.equal(f.calls.filter(c=>c.method==='account/login/start').length,1);}finally{f.client.stop();}
});
test('ready requires actual quota windows and account updates invalidate the old connection',async()=>{
 let empty=false;
 const f=fixture((m,c)=>respond(m,c,m.method==='account/read'?{account:{type:'chatgpt'}}:m.method==='account/rateLimits/read'?(empty?{}:{rateLimits:{primary:{usedPercent:15,windowDurationMins:300}}}):{}));
 try{assert.equal((await f.client.setupStatus()).ready,false);await f.client.read();assert.equal((await f.client.setupStatus()).ready,true);f.children[0].send({method:'account/updated',params:{authMode:'chatgpt'}});assert.equal((await f.client.setupStatus()).ready,false);await f.client.read();empty=true;await assert.rejects(f.client.read());assert.equal((await f.client.setupStatus()).ready,false);}finally{f.client.stop();}
});
test('provider configured without OpenAI authentication is not overwritten by login',async()=>{
 const f=fixture((m,c)=>respond(m,c,m.method==='account/read'?{account:null,requiresOpenaiAuth:false}:{}));
 try{assert.equal((await f.client.setupStatus()).requiresAccountSwitch,true);await assert.rejects(f.client.login(),{code:'ACCOUNT_SWITCH_REQUIRED'});assert(!f.calls.some(c=>c.method==='account/login/start'));}finally{f.client.stop();}
});
test('initialization RPC failure clears ready and retries cleanly',async()=>{
 let fail=true;
 const f=fixture((m,c)=>{if(m.method==='initialize'&&fail)c.send({id:m.id,error:{message:'internal'}});else respond(m,c,m.method==='account/read'?{account:null}:{});});
 try{assert.equal((await f.client.setupStatus()).errorCode,'RPC_ERROR');assert.equal(f.client.child,null);assert.equal(f.client.pending.size,0);fail=false;assert.equal((await f.client.setupStatus()).needsLogin,true);assert.equal(f.children.length,2);}finally{f.client.stop();}
});
test('explicit login uses an independent Codex home for API users without changing their environment',async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'codex-onboarding-')),managedHome=path.join(temp,'dashboard-account');
 const env={CODEX_HOME:'original-home',OPENAI_API_KEY:'private-key',OPENAI_BASE_URL:'https://provider.invalid',PATH:'normal-path'};
 let loggedIn=false;
 const f=fixture((m,c)=>respond(m,c,m.method==='account/read'?{account:f.client.managed?(loggedIn?{type:'chatgpt'}:null):{type:'apiKey'},requiresOpenaiAuth:true}:m.method==='account/login/start'?{loginId:'isolated',authUrl:'https://auth.openai.com/oauth/authorize'}:m.method==='account/rateLimits/read'?{rateLimits:{primary:{usedPercent:7,windowDurationMins:300}}}:{}),{managedHome,env});
 try{
  const first=await f.client.setupStatus();assert.equal(first.managed,false);assert.equal(first.requiresAccountSwitch,true);assert.equal(fs.existsSync(managedHome),false);assert.equal(f.spawned[0].env,undefined);
  const login=await f.client.login();assert.equal(login.loginId,'isolated');assert.equal(f.children.length,2);assert.equal(f.children[0].stdin.writableEnded,true);
  assert.equal(f.spawned[1].env.CODEX_HOME,managedHome);assert.equal(f.spawned[1].env.OPENAI_API_KEY,undefined);assert.equal(f.spawned[1].env.OPENAI_BASE_URL,undefined);assert.equal(env.OPENAI_API_KEY,'private-key');assert.equal(env.CODEX_HOME,'original-home');
  loggedIn=true;f.children[1].send({method:'account/login/completed',params:{loginId:'isolated',success:true}});assert.equal((await f.client.setupStatus()).managed,true);assert.equal((await f.client.read()).limits[0].primary.usedPercent,7);assert(!f.calls.some(c=>c.method==='account/logout'||c.method.startsWith('config/')));
  const next=fixture((m,c)=>respond(m,c,m.method==='account/read'?{account:{type:'chatgpt'}}:{}),{managedHome,env});
  try{assert.equal((await next.client.setupStatus()).managed,true);assert.equal(next.spawned[0].env.CODEX_HOME,managedHome);assert.equal((await next.client.setupStatus()).authenticated,true);}finally{next.client.stop();}
 }finally{f.client.stop();fs.rmSync(temp,{recursive:true,force:true});}
});
test('empty dedicated home resumes login after cancellation without touching other credentials',async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'codex-onboarding-empty-'));
 const f=fixture((m,c)=>respond(m,c,m.method==='account/read'?{account:null}:m.method==='account/login/start'?{loginId:'cancelled',authUrl:'https://auth.openai.com/oauth/authorize'}:{}),{managedHome:temp,env:{OpenAI_Api_Key:'private',codex_home:'original'}});
 try{assert.equal((await f.client.setupStatus()).managed,true);assert.equal(f.spawned[0].env.OpenAI_Api_Key,undefined);assert.equal(f.spawned[0].env.codex_home,undefined);await f.client.login();await f.client.cancelLogin();assert.equal((await f.client.setupStatus()).needsLogin,true);assert(!f.calls.some(c=>c.method==='account/logout'));assert.equal(fs.readdirSync(temp).length,0);}finally{f.client.stop();fs.rmSync(temp,{recursive:true,force:true});}
});

test('account email and quota workspace ID are separate namespaces and raw identifiers remain private',async()=>{
 const crypto=require('node:crypto');const account={type:'chatgpt',email:'a@example.invalid'};
 const f=fixture((m,c)=>respond(m,c,m.method==='account/read'?{account}:m.method==='account/rateLimits/read'?{accountId:'workspace-one',rateLimits:{limitId:'codex',secondary:{usedPercent:12,windowDurationMins:10080,resetsAt:2000000000}}}:{}));
 try{const status=await f.client.setupStatus();assert.equal(status.identityUnverified,true);const q=await f.client.read();assert.equal(q.accountFingerprint,crypto.createHash('sha256').update('workspace-one').digest('hex'));assert.equal(q.accountFingerprintKind,'account-id');assert(!JSON.stringify(q).includes('example.invalid'));assert(!JSON.stringify(q).includes('workspace-one'));assert.equal(q._accountAliases[0],crypto.createHash('sha256').update('account-id:workspace-one').digest('hex'));}finally{f.client.stop();}
});
test('email-only account displays quota unverified, detects mid-read account switch',async()=>{
 let current='a@example.invalid',flip=false;
 const f=fixture((m,c)=>{if(m.method==='account/read')return respond(m,c,{account:{type:'chatgpt',email:current}});if(m.method==='account/rateLimits/read'){if(flip)current='b@example.invalid';return respond(m,c,{rateLimits:{limitId:'codex',secondary:{usedPercent:12,windowDurationMins:10080,resetsAt:2000000000}}});}respond(m,c,{});});
 try{const q=await f.client.read();assert.equal(q.identityUnverified,true);assert.equal(q.accountFingerprint,undefined);flip=true;await assert.rejects(f.client.read(),{code:'ACCOUNT_CHANGED'});}finally{f.client.stop();}
});
test('workspace change while reading quota rejects stale response',async()=>{
 let reads=0;
 const f=fixture((m,c)=>{if(m.method==='account/read')return respond(m,c,{account:{type:'chatgpt',email:'a@example.invalid'},workspaceRouting:{chatgptAccountId:++reads===1?'one':'two'}});if(m.method==='account/rateLimits/read')return respond(m,c,{accountId:'one',rateLimits:{limitId:'codex',secondary:{usedPercent:12,windowDurationMins:10080,resetsAt:2000000000}}});respond(m,c,{});});
 try{await assert.rejects(f.client.read(),{code:'ACCOUNT_CHANGED'});}finally{f.client.stop();}
});
test('fresh idle status reconnects the reader without a login or logout request',async()=>{
 const f=fixture((m,c)=>respond(m,c,m.method==='account/read'?{account:{type:'chatgpt',email:'a@example.invalid'}}:{}));
 try{await f.client.setupStatus();await f.client.setupStatus({freshSession:true});assert.equal(f.children.length,2);assert(!f.calls.some(m=>/login|logout/.test(m.method)));}finally{f.client.stop();}
});

test('missing account in either account/read rejects quota ownership and refresh',async()=>{
 for(const missingAt of [1,2]){
  let accountReads=0,quotaReads=0;
  const f=fixture((m,c)=>{if(m.method==='account/read')return respond(m,c,++accountReads===missingAt?{}:{account:{type:'chatgpt',email:'valid@example.invalid'}});if(m.method==='account/rateLimits/read'){quotaReads++;return respond(m,c,{accountId:'workspace-one',rateLimits:{primary:{usedPercent:5,windowDurationMins:300,resetsAt:2000000000}}});}respond(m,c,{});});
  try{await assert.rejects(f.client.read(),{code:'LOGIN_REQUIRED'});assert.equal(f.client.quotaReady,false);assert.equal(quotaReads,missingAt===1?0:1);}finally{f.client.stop();}
 }
});

test('fresh-reader startup notifications are tagged only during that status check',async()=>{
 const seen=[];const f=fixture((m,c)=>{if(m.method==='initialize'){respond(m,c,{});c.send({method:'account/updated',params:{authMode:'chatgpt'}});}else respond(m,c,m.method==='account/read'?{account:{type:'chatgpt',email:'a@example.invalid'}}:{});});
 f.client.on('account-updated',()=>seen.push(f.client.freshSessionStarting));
 try{await f.client.setupStatus({freshSession:true});assert.deepEqual(seen,[true]);assert.equal(f.client.freshSessionStarting,false);f.children.at(-1).send({method:'account/updated',params:{authMode:'chatgpt'}});assert.deepEqual(seen,[true,false]);}finally{f.client.stop();}
});
