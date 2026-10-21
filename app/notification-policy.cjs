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
function recoverLocalReset(state,quota,now=Date.now()){
 if(!quota||!quota.bucketId||!quota.key||!quota.resetsAt)return;
 const key=`quota-reset:${quota.bucketId}:${quota.key}:${quota.resetsAt}`;
 const same=state.localReset?.key===key;
 if(same&&state.localReset.kind)return;
 const event=state.events?.find(e=>e.kind==='quota_reset'&&e.key===key&&Number.isFinite(Date.parse(e.at))&&Date.parse(e.at)<=now&&e.sourceId===null);
 const cycle=!quota.stale&&quota.source==='local-codex'&&localCycleCompletion(quota,null,now);
 if(same){if(event||cycle)state.localReset.kind=event?'quota-reset':'observed-cycle';return;}
 if(event||cycle)state.localReset={key,bucketId:quota.bucketId,windowKey:quota.key,resetsAt:quota.resetsAt,observedAt:event?.at||quota.fetchedAt,kind:event?'quota-reset':'observed-cycle',...(state.localResetReceipts?.[key]?{acknowledgedAt:state.localResetReceipts[key]}:{})};
}
function acknowledgeReset(state,tag,quota,now=Date.now()){
 const group=state.notificationGroups?.find(g=>notificationId(g.id)===tag);
 if(!group||!group.delivered||group.acknowledgedAt)return {received:false,quietStarted:false};
 group.acknowledgedAt=new Date(now).toISOString();
 const reset=state.localReset;
 if(!reset||reset.acknowledgedAt||state.localResetReceipts?.[reset.key]||!quota||quota.stale||reset.bucketId!==quota.bucketId||reset.windowKey!==quota.key||reset.resetsAt!==quota.resetsAt||(group.type==='local'?group.localResetKey!==reset.key:group.localResetKeyAtDelivery!==reset.key))return {received:true,quietStarted:false};
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
