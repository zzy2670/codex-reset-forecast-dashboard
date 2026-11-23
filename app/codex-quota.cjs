'use strict';
const os=require('node:os');
const fs=require('node:fs');
const {spawn}=require('node:child_process');
const {EventEmitter}=require('node:events');
const {findCodex}=require('./codex-discovery.cjs');
function protocolError(code,message){const error=new Error(message);error.code=code;return error;}
function accountIdentity(account,fallbackId){
 const entries=[['account-id',account?.accountId],['account-id',account?.id],['account-id',fallbackId],['email',account?.email],['email',account?.emailAddress]];
 const found=entries.find(([,v])=>typeof v==='string'&&v.trim());if(!found)return null;
 const [kind,value]=found,normalized=kind==='email'?value.trim().toLowerCase():value.trim();
 const digest=input=>require('node:crypto').createHash('sha256').update(input).digest('hex');
 return {accountFingerprint:digest(kind==='account-id'?normalized:`email:${normalized}`),accountFingerprintKind:kind,aliases:kind==='account-id'?[digest(`account-id:${normalized}`)]:[]};
}
const accountType=result=>result?.account?.type||null;
const identityFromAccount=result=>accountIdentity(result?.account,result?.accountId||result?.workspaceRouting?.chatgptAccountId);
const emailHint=result=>accountIdentity({email:result?.account?.email||result?.account?.emailAddress});
class LocalCodexQuota extends EventEmitter {
 constructor(options={}){super();this.child=null;this.pending=new Map();this.id=0;this.ready=null;this.loginAttempt=null;this.loginFlight=null;this.cancelFlight=null;this.loginStarting=false;this.loginCompletions=new Map();this.quotaReady=false;this.accountGeneration=0;this.freshSessionStarting=false;this.spawn=options.spawn||spawn;this.discover=options.findCodex||findCodex;this.timeoutMs=options.timeoutMs||20000;this.home=options.home||os.homedir();this.managedHome=options.managedHome||null;this.followDefault=options.followDefault===true;this.managed=!this.followDefault&&!!this.managedHome&&fs.existsSync(this.managedHome);this.env=options.env||process.env;}
 childEnvironment(){
  if(!this.managed)return undefined;
  const env={...this.env};
  for(const key of Object.keys(env))if(['CODEX_HOME','OPENAI_API_KEY','CODEX_API_KEY','OPENAI_BASE_URL','OPENAI_API_BASE','AZURE_OPENAI_API_KEY','AZURE_OPENAI_ENDPOINT'].includes(key.toUpperCase()))delete env[key];
  env.CODEX_HOME=this.managedHome;return env;
 }
 async start(){
  if(this.ready)return this.ready;
  const attempt=(async()=>{
   const exe=this.discover();if(!exe)throw protocolError('RUNTIME_MISSING','未找到本机 Codex 程序');
   const child=this.child=this.spawn(exe,['app-server','--listen','stdio://'],{windowsHide:true,stdio:['pipe','pipe','pipe'],cwd:this.home,...(this.managed?{env:this.childEnvironment()}:{})});
   let buffer='';
   child.stdout.setEncoding('utf8');
   child.stdout.on('data',chunk=>{if(this.child!==child)return;buffer+=chunk;if(buffer.length>8*1024*1024){this.stop();return;}let i;while((i=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,i);buffer=buffer.slice(i+1);let m;try{m=JSON.parse(line);}catch{continue;}this.receive(m);}});
   // Protocol diagnostics and raw account records never leave this process.
   child.stderr.resume();
   child.stdin.on('error',()=>{if(this.child===child)this.disconnect(child,'本机额度连接已断开');});
   child.on('error',()=>this.disconnect(child,'本机 Codex 启动失败'));
   child.on('exit',()=>this.disconnect(child,'本机额度连接已断开'));
   await this.request('initialize',{clientInfo:{name:'codex_reset_dashboard',title:'Codex Reset Dashboard',version:require('../package.json').version},capabilities:{experimentalApi:true}});
   if(this.child!==child)throw protocolError('CONNECTION_CLOSED','本机额度连接已断开');
   child.stdin.write(JSON.stringify({method:'initialized'})+'\n');
  })();
  this.ready=attempt;
  try{await attempt;}catch(e){if(this.ready===attempt)this.stop();throw e;}
 }
 receive(message){
  const pending=this.pending.get(message.id);
  if(pending){clearTimeout(pending.timer);this.pending.delete(message.id);message.error?pending.reject(protocolError('RPC_ERROR','本机 Codex 暂未返回额度，请确认当前已登录 ChatGPT 账户')):pending.resolve(message.result);return;}
  if(message.method==='account/login/completed'){
   const params=message.params||{};
   if(this.loginAttempt&&params.loginId===this.loginAttempt.loginId){this.loginAttempt=null;if(params.success===true)this.accountGeneration++;this.emit('login-completed',{success:params.success===true});}
   else if(this.loginFlight&&this.loginStarting&&typeof params.loginId==='string'&&params.loginId.length<=256){
    this.loginCompletions.set(params.loginId,{success:params.success===true});
    if(this.loginCompletions.size>16)this.loginCompletions.delete(this.loginCompletions.keys().next().value);
   }
  }else if(message.method==='account/updated'){this.accountGeneration++;this.quotaReady=false;this.emit('account-updated');}
 }
 disconnect(child,message){if(this.child!==child)return;this.child=null;this.ready=null;this.loginAttempt=null;this.loginStarting=false;this.loginCompletions.clear();this.quotaReady=false;this.fail(message);}
 fail(message){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(protocolError('CONNECTION_CLOSED',message));}this.pending.clear();}
 request(method,params){return new Promise((resolve,reject)=>{
  const child=this.child;if(!child?.stdin.writable){reject(protocolError('CONNECTION_CLOSED','本机额度服务未就绪'));return;}
  const id=++this.id,timer=setTimeout(()=>{const pending=this.pending.get(id);if(!pending)return;this.pending.delete(id);reject(protocolError('REQUEST_TIMEOUT','本机额度读取超时'));this.stop();},this.timeoutMs);
  this.pending.set(id,{resolve,reject,timer});
  try{child.stdin.write(JSON.stringify({id,method,...(params?{params}:{})})+'\n');}catch{this.disconnect(child,'本机额度连接已断开');}
 });}
 async setupStatus(options={}){
  if(!this.discover())return {runtimeAvailable:false,authenticated:false,needsLogin:true,ready:false,authType:null,loginPending:false,requiresAccountSwitch:false,managed:this.managed,errorCode:'RUNTIME_MISSING'};
  let freshStart=false;
  try{
   // A long-lived app-server can retain an old session after another client
   // signs in. Refresh its process only when it is idle and no login is open.
   freshStart=!!options.freshSession&&!this.pending.size&&!this.loginAttempt&&!this.loginFlight;
   if(freshStart){this.freshSessionStarting=true;if(this.child)this.stop();if(this.followDefault)this.managed=false;}
   await this.start();const result=await this.request('account/read',{refreshToken:false});
   const type=result?.account?.type;
   const authenticated=type==='chatgpt'||type==='chatgptAuthTokens';
   const authType=authenticated?'chatgpt':type==='apiKey'||type==='apikey'?'apiKey':type?'other':null;
   const identity=authenticated?identityFromAccount(result):null;
   const owner=identity?.accountFingerprintKind==='account-id'?identity:null,hint=authenticated?emailHint(result):null;
   const status={runtimeAvailable:true,authenticated,needsLogin:!authenticated,ready:authenticated&&this.quotaReady,authType,loginPending:!!this.loginAttempt,requiresAccountSwitch:!authenticated&&(!!type||result?.requiresOpenaiAuth===false),managed:this.managed,...(owner?{accountFingerprint:owner.accountFingerprint,accountFingerprintKind:owner.accountFingerprintKind}:authenticated?{identityUnverified:true}:{})};
   if(owner)Object.defineProperty(status,'_accountAliases',{value:owner.aliases,enumerable:false});
   if(hint)Object.defineProperty(status,'_accountHint',{value:hint.accountFingerprint,enumerable:false});
   return status;
  }catch(error){return {runtimeAvailable:true,authenticated:false,needsLogin:false,ready:false,authType:null,loginPending:!!this.loginAttempt,requiresAccountSwitch:false,managed:this.managed,errorCode:error.code||'CONNECTION_CLOSED'};}
  finally{if(freshStart)this.freshSessionStarting=false;}
 }
 async login(options={}){
  if(this.cancelFlight)await this.cancelFlight;
  if(this.loginFlight)return this.loginFlight;
  const flight=this.beginLogin(options);this.loginFlight=flight;
  try{return await flight;}finally{if(this.loginFlight===flight)this.loginFlight=null;}
 }
 async beginLogin({reauthenticate=false}={}){
  if(this.loginAttempt)return {...this.loginAttempt};
  // Only an explicit reconnect may replace authentication. Restart the reader
  // so an account switched outside this process cannot leave stale auth cached.
  if(reauthenticate&&!this.followDefault){
   if(this.managedHome&&!this.managed){
    try{fs.mkdirSync(this.managedHome,{recursive:true,mode:0o700});}catch{throw protocolError('MANAGED_HOME_UNAVAILABLE','本机额度服务未就绪');}
    this.stop();this.managed=true;
   }else this.stop();
  }
  let status=await this.setupStatus();
  if(status.authenticated&&(!reauthenticate||this.followDefault))return {alreadyConnected:true};
  if(status.errorCode)throw protocolError(status.errorCode,'本机额度服务未就绪');
  if(status.requiresAccountSwitch&&!this.followDefault&&!this.managed&&this.managedHome){
   try{fs.mkdirSync(this.managedHome,{recursive:true,mode:0o700});}catch{throw protocolError('MANAGED_HOME_UNAVAILABLE','本机额度服务未就绪');}
   this.stop();this.managed=true;status=await this.setupStatus();
   if(status.errorCode)throw protocolError(status.errorCode,'本机额度服务未就绪');
   if(status.authenticated)return {alreadyConnected:true};
  }
  if(status.requiresAccountSwitch)throw protocolError('ACCOUNT_SWITCH_REQUIRED','本机 Codex 暂未返回额度，请确认当前已登录 ChatGPT 账户');
  if(this.loginAttempt)return {...this.loginAttempt};
  this.loginStarting=true;
  try{
   const result=await this.request('account/login/start',{type:'chatgpt'});
   let url;try{url=new URL(result?.authUrl);}catch{throw protocolError('LOGIN_RESPONSE_INVALID','本机额度服务未就绪');}
   if(url.protocol!=='https:'||!['auth.openai.com','chatgpt.com'].includes(url.hostname)||url.username||url.password||url.port||!result?.loginId||typeof result.loginId!=='string'||result.loginId.length>256)throw protocolError('LOGIN_RESPONSE_INVALID','本机额度服务未就绪');
   const attempt={authUrl:url.href,loginId:result.loginId};this.loginAttempt=attempt;
   const completed=this.loginCompletions.get(attempt.loginId);
   if(completed){this.loginAttempt=null;if(completed.success)this.accountGeneration++;this.emit('login-completed',{success:completed.success});}
   return {...attempt};
  }finally{this.loginStarting=false;this.loginCompletions.clear();}
 }
 async cancelLogin(){if(this.cancelFlight)return this.cancelFlight;const flight=this.cancelPendingLogin();this.cancelFlight=flight;try{return await flight;}finally{if(this.cancelFlight===flight)this.cancelFlight=null;}}
 async cancelPendingLogin(){if(!this.loginAttempt&&this.loginFlight){try{await this.loginFlight;}catch{}}const pending=this.loginAttempt;if(!pending)return {cancelled:false};this.loginAttempt=null;this.loginCompletions.clear();await this.request('account/login/cancel',{loginId:pending.loginId});return {cancelled:true};}
 async read(){
  try{
   await this.start();const generation=this.accountGeneration;
   const before=await this.request('account/read',{refreshToken:false});
   if(!['chatgpt','chatgptAuthTokens'].includes(accountType(before)))throw protocolError('LOGIN_REQUIRED','请先登录 ChatGPT');
   const r=await this.request('account/rateLimits/read',{});
   const after=await this.request('account/read',{refreshToken:false});
   const beforeId=identityFromAccount(before),afterId=identityFromAccount(after),quotaId=accountIdentity(r?.account,r?.accountId),beforeHint=emailHint(before),afterHint=emailHint(after);
   if(!['chatgpt','chatgptAuthTokens'].includes(accountType(after)))throw protocolError('LOGIN_REQUIRED','请先登录 ChatGPT');
   if(generation!==this.accountGeneration||accountType(before)!==accountType(after)||(beforeId?.accountFingerprint||null)!==(afterId?.accountFingerprint||null)||(beforeHint?.accountFingerprint||null)!==(afterHint?.accountFingerprint||null))throw protocolError('ACCOUNT_CHANGED','账号发生变化，正在重新读取额度');
   if(afterId?.accountFingerprintKind==='account-id'&&quotaId?.accountFingerprintKind==='account-id'&&afterId.accountFingerprint!==quotaId.accountFingerprint)throw protocolError('ACCOUNT_CHANGED','账号发生变化，正在重新读取额度');
   const quota=sanitize(r);delete quota.accountFingerprint;
   const identity=quotaId?.accountFingerprintKind==='account-id'?quotaId:afterId;
   if(identity?.accountFingerprintKind==='account-id'){quota.accountFingerprint=identity.accountFingerprint;quota.accountFingerprintKind=identity.accountFingerprintKind;Object.defineProperty(quota,'_accountAliases',{value:identity.aliases,enumerable:false});}
   else quota.identityUnverified=true;
   if(afterHint)Object.defineProperty(quota,'_accountHint',{value:afterHint.accountFingerprint,enumerable:false});
   this.quotaReady=true;return quota;
  }catch(error){this.quotaReady=false;throw error;}
 }
 stop(){const c=this.child;this.child=null;this.ready=null;this.loginAttempt=null;this.loginStarting=false;this.loginCompletions.clear();this.quotaReady=false;this.fail('本机额度连接已关闭');if(c){try{c.stdin.end();}catch{}setTimeout(()=>{if(c.exitCode===null)c.kill();},1000).unref();}}
}
function sanitize(result){
 const source=result.rateLimitsByLimitId&&Object.keys(result.rateLimitsByLimitId).length?Object.values(result.rateLimitsByLimitId):[result.rateLimits];
 const window=w=>w&&Number.isFinite(w.usedPercent)&&Number.isFinite(w.windowDurationMins)&&w.windowDurationMins>0?{usedPercent:Math.min(100,Math.max(0,w.usedPercent)),durationMins:w.windowDurationMins,resetsAt:Number.isFinite(w.resetsAt)&&w.resetsAt>0?new Date(w.resetsAt*1000).toISOString():null}:null;
 const limits=source.filter(Boolean).map((b,i)=>({id:String(b.limitId||`quota-${i}`).slice(0,100),name:String(b.limitName||b.limitId||'Codex').slice(0,100),primary:window(b.primary),secondary:window(b.secondary),planType:typeof b.planType==='string'?b.planType:null,reached:b.rateLimitReachedType||null})).filter(b=>b.primary||b.secondary);
 if(!limits.length)throw new Error('当前本机账户未提供额度窗口数据');
 return {state:'ok',source:'local-codex',fetchedAt:new Date().toISOString(),limits,...(typeof result.accountId==='string'?{accountFingerprint:require('node:crypto').createHash('sha256').update(result.accountId).digest('hex')}:{}),ordinaryUsageAllowed:typeof result.ordinaryUsageAllowed==='boolean'?result.ordinaryUsageAllowed:null,resetCredits:Number.isFinite(result.rateLimitResetCredits?.availableCount)?result.rateLimitResetCredits.availableCount:null};
}
function quotaView(quota,settings={},now=Date.now()){
 if(quota?.source!=='local-codex'||!Array.isArray(quota.limits)||!quota.limits.length)return null;
 const bucket=quota.limits.find(b=>b.id===settings.quotaLimitId)||quota.limits.find(b=>b.id==='codex')||quota.limits[0];
 const key=settings.quotaWindow==='primary'&&bucket.primary?'primary':bucket.secondary?'secondary':'primary';
 const w=bucket[key];if(!w)return null;
 const end=w.resetsAt?Date.parse(w.resetsAt):NaN;
 const theoretical=Number.isFinite(end)?Math.max(0,Math.min(1,(now-(end-w.durationMins*60000))/(w.durationMins*60000))):null;
 const owner=typeof quota.accountFingerprint==='string'&&/^[a-f\d]{64}$/i.test(quota.accountFingerprint)?quota.accountFingerprint.toLowerCase():null;
 return {...w,source:'local-codex',state:quota.state,bucketId:bucket.id,name:bucket.name,planType:bucket.planType,key,actual:w.usedPercent/100,remainingPercent:100-w.usedPercent,theoretical,delta:theoretical===null?null:w.usedPercent-theoretical*100,
  primary:bucket.primary,secondary:bucket.secondary,resetCredits:quota.resetCredits,ordinaryUsageAllowed:quota.ordinaryUsageAllowed,...(owner?{accountFingerprint:owner}:{}),...(owner&&quota.accountFingerprintKind?{accountFingerprintKind:quota.accountFingerprintKind}:{}),...(!owner?{identityUnverified:true}:{}),
  stale:quota.state!=='ok'||now-Date.parse(quota.fetchedAt)>120000||(Number.isFinite(end)&&end<=now),fetchedAt:quota.fetchedAt};
}
function quotaChanges(previous,next,settings={},now=Date.now(),options={}){
 const a=quotaView(previous,settings,now),b=quotaView(next,settings,now);
 const priorAge=now-Date.parse(previous?.fetchedAt);
 if(previous?.accountFingerprint&&next?.accountFingerprint&&previous.accountFingerprint!==next.accountFingerprint)return [];
 if(options.requireIdentity===true&&(!a?.accountFingerprint||a.accountFingerprint!==b?.accountFingerprint))return [];
 const recovery=options.recoverInterrupted===true&&previous?.accountFingerprint&&previous.accountFingerprint===next?.accountFingerprint;
 if(!a||!b||previous.state!=='ok'||!Number.isFinite(priorAge)||priorAge<0||priorAge>(recovery?300000:120000)||b.stale||a.bucketId!==b.bucketId||a.key!==b.key)return [];
 const events=[],at=new Date(now).toISOString();
 if(Date.parse(b.resetsAt)>Date.parse(a.resetsAt)+60000&&b.usedPercent<a.usedPercent-.5)events.push({key:`quota-reset:${b.accountFingerprint?`${b.accountFingerprint}:`:''}${b.bucketId}:${b.key}:${b.resetsAt}`,kind:'quota_reset',bucketId:b.bucketId,windowKey:b.key,resetsAt:b.resetsAt,durationMins:b.durationMins,...(b.durationMins<=360?{periodicWindow:true}:{}),...(b.accountFingerprint?{accountFingerprint:b.accountFingerprint}:{}),beforeRemainingPercent:a.remainingPercent,afterRemainingPercent:b.remainingPercent,beforeFetchedAt:previous.fetchedAt,beforeResetsAt:a.resetsAt,title:b.durationMins<=360?'周期额度补充':'本机额度已补充',body:`当前周期剩余 ${b.remainingPercent.toFixed(0)}%。${b.durationMins<=360?'':'个人重置时间已更新，请查看看板。'}`,at,sourceId:null,url:null});
 if(options.requireIdentity===true&&Date.parse(b.resetsAt)<=Date.parse(a.resetsAt)+60000&&b.remainingPercent>=90&&b.remainingPercent-a.remainingPercent>=20)events.push({key:`quota-refill:${b.accountFingerprint}:${b.bucketId}:${b.key}:${at}`,kind:'quota_refill',bucketId:b.bucketId,windowKey:b.key,resetsAt:b.resetsAt,durationMins:b.durationMins,...(b.durationMins<=360?{periodicWindow:true}:{}),accountFingerprint:b.accountFingerprint,beforeRemainingPercent:a.remainingPercent,afterRemainingPercent:b.remainingPercent,beforeFetchedAt:previous.fetchedAt,beforeResetsAt:a.resetsAt,title:'本机额度已补充',body:'额度明显增加，具体原因待核实。',at,sourceId:null,url:null});
 if(a.ordinaryUsageAllowed===true&&b.ordinaryUsageAllowed===false)events.push({key:`quota-denied:${b.accountFingerprint?`${b.accountFingerprint}:`:''}${b.bucketId}:${b.resetsAt}`,kind:'quota_denied',...(b.accountFingerprint?{accountFingerprint:b.accountFingerprint}:{}),title:'本机额度状态发生变化',body:'本机接口报告当前不允许常规使用，请查看额度明细。',at,sourceId:null,url:null});
 if(recovery&&priorAge>120000)for(const e of events.filter(e=>e.kind==='quota_reset'||e.kind==='quota_refill'))Object.assign(e,{beforeBasis:'snapshot',beforeDurationMins:a.durationMins,beforeProvenance:{kind:'local-poll'}});
 return events;
}
module.exports={LocalCodexQuota,findCodex,sanitize,quotaView,quotaChanges};
