'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process');
function findCodex(){
 const npm=path.join(process.env.APPDATA||path.join(os.homedir(),'AppData','Roaming'),'npm','node_modules','@openai','codex');
 const candidates=[path.join(npm,'node_modules','@openai','codex-win32-x64','vendor','x86_64-pc-windows-msvc','bin','codex.exe'),path.join(npm,'vendor','x86_64-pc-windows-msvc','codex','codex.exe')];
 for(const folder of (process.env.PATH||'').split(path.delimiter))candidates.push(path.join(folder,'codex.exe'));
 return candidates.find(p=>fs.existsSync(p))||null;
}
class LocalCodexQuota {
 constructor(){this.child=null;this.pending=new Map();this.id=0;this.ready=null;}
 async start(){
  if(this.ready)return this.ready;
  this.ready=(async()=>{
   const exe=findCodex();if(!exe)throw new Error('未找到本机 Codex 程序');
   const child=this.child=spawn(exe,['app-server','--listen','stdio://'],{windowsHide:true,stdio:['pipe','pipe','pipe'],cwd:os.homedir()});
   let buffer='';
   child.stdout.setEncoding('utf8');
   child.stdout.on('data',chunk=>{buffer+=chunk;if(buffer.length>8*1024*1024){this.stop();return;}let i;while((i=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,i);buffer=buffer.slice(i+1);let m;try{m=JSON.parse(line);}catch{continue;}const pending=this.pending.get(m.id);if(pending){clearTimeout(pending.timer);this.pending.delete(m.id);m.error?pending.reject(new Error('本机 Codex 暂未返回额度，请确认当前已登录 ChatGPT 账户')):pending.resolve(m.result);}}});
   // Do not retain protocol diagnostics, account metadata, or authentication material.
   child.stderr.resume();
   child.on('error',()=>this.fail('本机 Codex 启动失败'));
   child.on('exit',()=>{if(this.child===child){this.child=null;this.ready=null;this.fail('本机额度连接已断开');}});
   await this.request('initialize',{clientInfo:{name:'codex_reset_dashboard',title:'Codex Reset Dashboard',version:'1.1.0'},capabilities:{experimentalApi:true}});
   child.stdin.write(JSON.stringify({method:'initialized'})+'\n');
  })();
  try{await this.ready;}catch(e){this.stop();throw e;}
 }
 fail(message){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new Error(message));}this.pending.clear();}
 request(method,params){return new Promise((resolve,reject)=>{if(!this.child?.stdin.writable){reject(new Error('本机额度服务未就绪'));return;}const id=++this.id;const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('本机额度读取超时'));},20000);this.pending.set(id,{resolve,reject,timer});this.child.stdin.write(JSON.stringify({id,method,...(params?{params}:{})})+'\n');});}
 async read(){await this.start();const r=await this.request('account/rateLimits/read',{});return sanitize(r);}
 stop(){const c=this.child;this.child=null;this.ready=null;this.fail('本机额度连接已关闭');if(c){c.stdin.end();setTimeout(()=>{if(c.exitCode===null)c.kill();},1000).unref();}}
}
function sanitize(result){
 const source=result.rateLimitsByLimitId&&Object.keys(result.rateLimitsByLimitId).length?Object.values(result.rateLimitsByLimitId):[result.rateLimits];
 const window=w=>w&&Number.isFinite(w.usedPercent)&&Number.isFinite(w.windowDurationMins)&&w.windowDurationMins>0?{usedPercent:Math.min(100,Math.max(0,w.usedPercent)),durationMins:w.windowDurationMins,resetsAt:Number.isFinite(w.resetsAt)&&w.resetsAt>0?new Date(w.resetsAt*1000).toISOString():null}:null;
 const limits=source.filter(Boolean).map((b,i)=>({id:String(b.limitId||`quota-${i}`).slice(0,100),name:String(b.limitName||b.limitId||'Codex').slice(0,100),primary:window(b.primary),secondary:window(b.secondary),planType:typeof b.planType==='string'?b.planType:null,reached:b.rateLimitReachedType||null})).filter(b=>b.primary||b.secondary);
 if(!limits.length)throw new Error('当前本机账户未提供额度窗口数据');
 return {state:'ok',source:'local-codex',fetchedAt:new Date().toISOString(),limits,ordinaryUsageAllowed:typeof result.ordinaryUsageAllowed==='boolean'?result.ordinaryUsageAllowed:null,resetCredits:Number.isFinite(result.rateLimitResetCredits?.availableCount)?result.rateLimitResetCredits.availableCount:null};
}
function quotaView(quota,settings={},now=Date.now()){
 if(quota?.source!=='local-codex'||!Array.isArray(quota.limits)||!quota.limits.length)return null;
 const bucket=quota.limits.find(b=>b.id===settings.quotaLimitId)||quota.limits.find(b=>b.id==='codex')||quota.limits[0];
 const key=settings.quotaWindow==='primary'&&bucket.primary?'primary':bucket.secondary?'secondary':'primary';
 const w=bucket[key];if(!w)return null;
 const end=w.resetsAt?Date.parse(w.resetsAt):NaN;
 const theoretical=Number.isFinite(end)?Math.max(0,Math.min(1,(now-(end-w.durationMins*60000))/(w.durationMins*60000))):null;
 return {...w,source:'local-codex',state:quota.state,bucketId:bucket.id,name:bucket.name,planType:bucket.planType,key,actual:w.usedPercent/100,remainingPercent:100-w.usedPercent,theoretical,delta:theoretical===null?null:w.usedPercent-theoretical*100,
  primary:bucket.primary,secondary:bucket.secondary,resetCredits:quota.resetCredits,ordinaryUsageAllowed:quota.ordinaryUsageAllowed,
  stale:quota.state!=='ok'||now-Date.parse(quota.fetchedAt)>120000||(Number.isFinite(end)&&end<=now),fetchedAt:quota.fetchedAt};
}
function quotaChanges(previous,next,settings={},now=Date.now()){
 const a=quotaView(previous,settings,now),b=quotaView(next,settings,now);
 const priorAge=now-Date.parse(previous?.fetchedAt);
 if(!a||!b||previous.state!=='ok'||!Number.isFinite(priorAge)||priorAge<0||priorAge>120000||b.stale||a.bucketId!==b.bucketId||a.key!==b.key)return [];
 const events=[],at=new Date(now).toISOString();
 if(Date.parse(b.resetsAt)>Date.parse(a.resetsAt)+60000&&b.usedPercent<a.usedPercent-.5)events.push({key:`quota-reset:${b.bucketId}:${b.key}:${b.resetsAt}`,kind:'quota_reset',bucketId:b.bucketId,windowKey:b.key,resetsAt:b.resetsAt,title:'本机额度已补充',body:`当前周期剩余 ${b.remainingPercent.toFixed(0)}%。个人重置时间已更新，请查看看板。`,at,sourceId:null,url:null});
 if(a.ordinaryUsageAllowed===true&&b.ordinaryUsageAllowed===false)events.push({key:`quota-denied:${b.bucketId}:${b.resetsAt}`,kind:'quota_denied',title:'本机额度状态发生变化',body:'本机接口报告当前不允许常规使用，请查看额度明细。',at,sourceId:null,url:null});
 return events;
}
module.exports={LocalCodexQuota,findCodex,sanitize,quotaView,quotaChanges};
