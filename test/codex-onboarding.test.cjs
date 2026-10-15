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
test('runtime missing returns a typed setup result without starting anything',async()=>{
 const f=fixture(()=>assert.fail('must not spawn'),{findCodex:()=>null});assert.equal((await f.client.setupStatus()).errorCode,'RUNTIME_MISSING');await assert.rejects(f.client.read(),{code:'RUNTIME_MISSING'});assert.equal(f.children.length,0);
});
test('request timeout clears pending, restarts the child, and quota succeeds on retry',async()=>{
 let ignore=true;
 const f=fixture((m,c)=>{if(m.method==='account/rateLimits/read'&&ignore)return;respond(m,c,m.method==='account/rateLimits/read'?{rateLimits:{primary:{usedPercent:9,windowDurationMins:300,resetsAt:2000000000}}}:{});},{timeoutMs:15});
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
