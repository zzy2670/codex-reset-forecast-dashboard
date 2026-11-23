'use strict';
const crypto=require('node:crypto');
const {localCycleCompletion}=require('./ui/pace-timing.js');
const TOLERANCE=15*60000;
const QUIET_MS=6*3600000;
const notificationId=key=>crypto.createHash('sha256').update(key).digest('hex').slice(0,16);
const isQuiet=(until,now=Date.now())=>Number.isFinite(Date.parse(until))&&Date.parse(until)>now;
const allowedTypes=new Set(['reset','regular','global','automatic','global_and_banked','both','combined']);
function displayClock(timeZone){
 let zone=typeof timeZone==='string'?timeZone:'Asia/Shanghai',formatter;
 const options={month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false};
 try{formatter=new Intl.DateTimeFormat('zh-CN',{...options,timeZone:zone});}
 catch{zone='Asia/Shanghai';formatter=new Intl.DateTimeFormat('zh-CN',{...options,timeZone:zone});}
 return {stamp:t=>formatter.format(new Date(t)),label:zone==='Asia/Shanghai'?'北京时间':zone};
}
function interval(e,now=Date.now(),planType=null){
 if(e.kind==='quota_reset'){
  const at=Date.parse(e.at);
  if(!e.bucketId||!['primary','secondary'].includes(e.windowKey)||!Number.isFinite(Date.parse(e.resetsAt))||!Number.isFinite(at)||at>now||at<now-120000)return null;
  return {start:at,end:at,type:'local',phase:'confirmed'};
 }
 if(!['forecast','time_changed','cancelled','confirmed'].includes(e.kind)||!allowedTypes.has(e.resetType)||['hint','inferred','model'].includes(e.timingKind))return null;
 const start=Date.parse(e.start||e.end),end=Date.parse(e.end||e.start);
 if(!Number.isFinite(start)||!Number.isFinite(end)||start>end)return null;
 if(e.kind==='confirmed'?(end>now+60000||end<now-86400000):end<=now)return null;
 const plans=e.scope?.plans?.map(p=>String(p).toLowerCase());
 if(plans?.length&&!plans.includes('all')&&(!planType||!plans.includes(String(planType).toLowerCase())))return null;
 return {start,end,type:'automatic',phase:e.kind==='cancelled'?'cancelled':e.kind==='confirmed'?'confirmed':'forecast'};
}
function mergeMessage(groups,event,now=Date.now(),planType=null,timeZone='Asia/Shanghai'){
 const time=interval(event,now,planType);if(!time)return null;
 const scope=(event.scope?.plans||[]).map(p=>String(p).toLowerCase()).sort();
 // Compare the original bounds, not repeatedly widened ranges, to prevent drift.
 const entity=event.transition?.entity;
 let group=groups.find(g=>{
  if(g.type!==time.type||g.phase!==time.phase)return false;
  if(time.type==='local')return g.localResetKey===event.key;
  if(scope.length&&g.scope?.length&&!scope.includes('all')&&!g.scope.includes('all')&&!scope.some(p=>g.scope.includes(p)))return false;
  const samePost=entity&&g.entities?.includes(entity);
  if(samePost&&(Math.abs(time.start-g.start)>TOLERANCE||Math.abs(time.end-g.end)>TOLERANCE))return false;
  return time.start<=g.end+TOLERANCE&&time.end>=g.start-TOLERANCE;
 });
 const first=!group;
 if(!group){group={id:`reset-message:${event.key}`,type:time.type,phase:time.phase,start:time.start,end:time.end,scope,createdAt:new Date(now).toISOString(),sources:[],entities:[],evidence:[],...(time.type==='local'?{localResetKey:event.key}:{})};groups.push(group);}
 if(entity&&!group.entities.includes(entity))group.entities.push(entity);
 if(event.sourceId&&!group.sources.includes(event.sourceId))group.sources.push(event.sourceId);
 if(!group.evidence.some(p=>p.key===event.key&&p.sourceId===event.sourceId))group.evidence.push({key:event.key,sourceId:event.sourceId,url:event.url||null,start:event.start||null,end:event.end||null,title:event.title,scope});
 group.evidence=group.evidence.slice(-30);group.updatedAt=new Date(now).toISOString();
 const clock=displayClock(timeZone);
 const when=time.start===time.end?clock.stamp(time.end):`${clock.stamp(time.start)} 至 ${clock.stamp(time.end)}`;
 const scopes=[...new Set(group.evidence.map(p=>!p.scope?.length||p.scope.includes('all')?'全体':p.scope.join('、').toUpperCase()))];
 const body=time.type==='local'?`${event.body}\n本机确认时间：${when}（${clock.label}）`:`${event.body}\n${event.kind==='cancelled'?'原排期':'重置时间'}：${when}（${clock.label}）\n适用范围：${scopes.join('；')}${group.sources.length>1?`\n已合并 ${group.sources.length} 个信源的同类消息`:''}`;
 return {first,group,event:{...event,notificationGroup:group.id,body,sources:[...group.sources],evidence:[...group.evidence]}};
}
const xml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const shouldNotify=(group,enabled,quietUntil=null,now=Date.now())=>!!group&&enabled&&!group.delivered&&!group.pending&&!group.suppressedAt&&!isQuiet(quietUntil,now);
const accountFingerprint=value=>typeof value==='string'&&/^[a-f\d]{64}$/i.test(value)?value.toLowerCase():null;
function parseResetKey(key){
 const match=typeof key==='string'&&key.match(/^quota-reset:(?:([a-f\d]{64}):)?(.+):(primary|secondary):(.+)$/i);
 return match?{accountFingerprint:accountFingerprint(match[1]),bucketId:match[2],windowKey:match[3],resetsAt:match[4]}:null;
}
function actualResetProof(value,now){
 if(value?.kind!=='quota-reset'||!value.bucketId||!['primary','secondary'].includes(value.windowKey))return null;
 const fields=parseResetKey(value.key),supplied=accountFingerprint(value.accountFingerprint);
 if(!fields||value.accountFingerprint!=null&&!supplied||fields.accountFingerprint&&supplied&&fields.accountFingerprint!==supplied||fields.bucketId!==value.bucketId||fields.windowKey!==value.windowKey||fields.resetsAt!==value.resetsAt)return null;
 const at=Date.parse(value.observedAt),end=Date.parse(value.resetsAt),owner=supplied||fields.accountFingerprint;
 if(!Number.isFinite(at)||!Number.isFinite(end)||at>now||at>=end)return null;
 return {key:value.key,bucketId:value.bucketId,windowKey:value.windowKey,resetsAt:value.resetsAt,observedAt:value.observedAt,kind:'quota-reset',...(owner?{accountFingerprint:owner}:{}),...(value.acknowledgedAt?{acknowledgedAt:value.acknowledgedAt}:{})};
}
function legacyResetEvent(event){
 const parsed=parseResetKey(event.key);if(!parsed)return null;
 const {bucketId,windowKey,resetsAt}=parsed,owner=accountFingerprint(event.accountFingerprint)||parsed.accountFingerprint;
 if(event.accountFingerprint!=null&&!accountFingerprint(event.accountFingerprint)||parsed.accountFingerprint&&accountFingerprint(event.accountFingerprint)&&parsed.accountFingerprint!==accountFingerprint(event.accountFingerprint))return null;
 const stamp=resetsAt.match(/^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/);
 if(!stamp||!Number.isFinite(Date.parse(resetsAt)))return null;
 const day=Date.parse(`${stamp[1]}T00:00:00.000Z`);
 if(!Number.isFinite(day)||new Date(day).toISOString().slice(0,10)!==stamp[1])return null;
 const fields={bucketId,windowKey,resetsAt};
 for(const [key,value] of Object.entries(fields))if(Object.hasOwn(event,key)&&event[key]!==value)return null;
 return {...fields,...event,...(owner?{accountFingerprint:owner}:{}),kind:'quota-reset',observedAt:event.at};
}
function recoverActualProofs(state,now){
 const proofs=new Map();
 const remember=value=>{
  const proof=actualResetProof(value,now);if(!proof)return;
  const old=proofs.get(proof.key);
  proofs.set(proof.key,{...old,...proof,observedAt:old&&Date.parse(old.observedAt)<Date.parse(proof.observedAt)?old.observedAt:proof.observedAt,...(proof.acknowledgedAt||old?.acknowledgedAt?{acknowledgedAt:proof.acknowledgedAt||old.acknowledgedAt}:{})});
 };
 for(const [key,value] of Object.entries(state.localResetProofs||{}))if(value?.key===key)remember(value);
 for(const event of state.events||[])if(event.kind==='quota_reset'&&event.sourceId===null)remember(legacyResetEvent(event));
 remember(state.localReset);
 const unrecognized=Object.entries(state.localResetProofs||{}).filter(([key,value])=>value?.key===key&&!actualResetProof(value,now));
 if(proofs.size||state.localResetProofs)state.localResetProofs=Object.fromEntries([...unrecognized,...[...proofs].sort((a,b)=>Date.parse(a[1].observedAt)-Date.parse(b[1].observedAt)).slice(-200)]);
 return proofs;
}
function recoverLocalReset(state,quota,now=Date.now(),options={}){
 const proofs=recoverActualProofs(state,now);
 const owner=accountFingerprint(quota?.accountFingerprint);
 if(options.requireIdentity===true&&!owner){state.localReset=null;return;}
 if(!quota||!quota.bucketId||!quota.key||!quota.resetsAt)return;
 const key=`quota-reset:${owner?`${owner}:`:''}${quota.bucketId}:${quota.key}:${quota.resetsAt}`;
 const same=state.localReset?.key===key;
 const accepted=new Set(owner?[owner,...(options.accountAliases||[]).map(accountFingerprint).filter(Boolean)]:[null]);
 const actual=proofs.get(key)||[...proofs.values()].find(p=>accepted.has(accountFingerprint(p.accountFingerprint))&&p.bucketId===quota.bucketId&&p.windowKey===quota.key&&p.resetsAt===quota.resetsAt);
 if(actual){state.localReset={...(same?state.localReset:{}),...actual,...(same&&state.localReset.acknowledgedAt?{acknowledgedAt:state.localReset.acknowledgedAt}:state.localResetReceipts?.[key]?{acknowledgedAt:state.localResetReceipts[key]}:{})};return;}
 if(same&&state.localReset.kind)return;
 // Short cycles are valid local observations even though they must never
 // retire a public global-reset forecast.
 const duration=Number(quota.durationMins)*60000,end=Date.parse(quota.resetsAt),observed=Date.parse(quota.fetchedAt),start=end-duration;
 const shortCycle=duration>0&&duration<=360*60000&&Number.isFinite(start)&&start<=now&&Number.isFinite(observed)&&observed>=start&&observed<=now+60000;
 const cycle=!quota.stale&&quota.source==='local-codex'&&(shortCycle||localCycleCompletion(quota,null,now));
 if(same){if(cycle)state.localReset.kind='observed-cycle';return;}
 if(cycle)state.localReset={key,bucketId:quota.bucketId,windowKey:quota.key,resetsAt:quota.resetsAt,observedAt:quota.fetchedAt,kind:'observed-cycle',...(owner?{accountFingerprint:owner}:{}),...(state.localResetReceipts?.[key]?{acknowledgedAt:state.localResetReceipts[key]}:{})};
}
function acknowledgeReset(state,tag,quota,now=Date.now()){
 const group=state.notificationGroups?.find(g=>notificationId(g.id)===tag);
 if(!group||!group.delivered||group.acknowledgedAt)return {received:false,quietStarted:false};
 group.acknowledgedAt=new Date(now).toISOString();
 const reset=state.localReset;
 if(!reset||reset.acknowledgedAt||state.localResetReceipts?.[reset.key]||!quota||quota.stale||accountFingerprint(reset.accountFingerprint)!==accountFingerprint(quota.accountFingerprint)||reset.bucketId!==quota.bucketId||reset.windowKey!==quota.key||reset.resetsAt!==quota.resetsAt||(group.type==='local'?group.localResetKey!==reset.key:group.localResetKeyAtDelivery!==reset.key))return {received:true,quietStarted:false};
 reset.acknowledgedAt=group.acknowledgedAt;
 state.localResetReceipts={...state.localResetReceipts,[reset.key]:reset.acknowledgedAt};
 state.localResetReceipts=Object.fromEntries(Object.entries(state.localResetReceipts).slice(-200));
 state.resetQuietUntil=new Date(now+QUIET_MS).toISOString();
 return {received:true,quietStarted:true};
}
function toastXml(title,body,id,silent=true,receiptLabel='确认收到'){
 return `<toast scenario="reminder" launch="type=click&amp;tag=${xml(id)}"><visual><binding template="ToastGeneric"><text>${xml(title)}</text><text>${xml(body)}</text></binding></visual><actions><action activationType="foreground" arguments="type=action&amp;action=0&amp;tag=${xml(id)}" content="${xml(receiptLabel)}"/></actions><audio silent="${silent?'true':'false'}"/></toast>`;
}
module.exports={interval,mergeMessage,toastXml,TOLERANCE,shouldNotify,isQuiet,notificationId,acknowledgeReset,recoverLocalReset,QUIET_MS};
