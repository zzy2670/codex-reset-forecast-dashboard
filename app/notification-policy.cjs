'use strict';
const TOLERANCE=15*60000;
const allowedTypes=new Set(['reset','regular','global','automatic','global_and_banked','both','combined']);
const fmt=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
const stamp=t=>fmt.format(new Date(t));
function interval(e,now=Date.now(),planType=null){
 if(!['forecast','time_changed','cancelled','confirmed'].includes(e.kind)||!allowedTypes.has(e.resetType)||['hint','inferred','model'].includes(e.timingKind))return null;
 const start=Date.parse(e.start||e.end),end=Date.parse(e.end||e.start);
 if(!Number.isFinite(start)||!Number.isFinite(end)||start>end)return null;
 if(e.kind==='confirmed'?(end>now+60000||end<now-86400000):end<=now)return null;
 const plans=e.scope?.plans?.map(p=>String(p).toLowerCase());
 if(plans?.length&&!plans.includes('all')&&(!planType||!plans.includes(String(planType).toLowerCase())))return null;
 return {start,end,type:'automatic',phase:e.kind==='cancelled'?'cancelled':e.kind==='confirmed'?'confirmed':'forecast'};
}
function mergeMessage(groups,event,now=Date.now(),planType=null){
 const time=interval(event,now,planType);if(!time)return null;
 const scope=(event.scope?.plans||[]).map(p=>String(p).toLowerCase()).sort();
 // Compare the original bounds, not repeatedly widened ranges, to prevent drift.
 const entity=event.transition?.entity;
 let group=groups.find(g=>{
  if(g.type!==time.type||g.phase!==time.phase)return false;
  if(scope.length&&g.scope?.length&&!scope.includes('all')&&!g.scope.includes('all')&&!scope.some(p=>g.scope.includes(p)))return false;
  const samePost=entity&&g.entities?.includes(entity);
  if(samePost&&(Math.abs(time.start-g.start)>TOLERANCE||Math.abs(time.end-g.end)>TOLERANCE))return false;
  return time.start<=g.end+TOLERANCE&&time.end>=g.start-TOLERANCE;
 });
 const first=!group;
 if(!group){group={id:`reset-message:${event.key}`,type:time.type,phase:time.phase,start:time.start,end:time.end,scope,createdAt:new Date(now).toISOString(),sources:[],entities:[],evidence:[]};groups.push(group);}
 if(entity&&!group.entities.includes(entity))group.entities.push(entity);
 if(event.sourceId&&!group.sources.includes(event.sourceId))group.sources.push(event.sourceId);
 if(!group.evidence.some(p=>p.key===event.key&&p.sourceId===event.sourceId))group.evidence.push({key:event.key,sourceId:event.sourceId,url:event.url||null,start:event.start||null,end:event.end||null,title:event.title,scope});
 group.evidence=group.evidence.slice(-30);group.updatedAt=new Date(now).toISOString();
 const when=time.start===time.end?stamp(time.end):`${stamp(time.start)} 至 ${stamp(time.end)}`;
 const scopes=[...new Set(group.evidence.map(p=>!p.scope?.length||p.scope.includes('all')?'全体':p.scope.join('、').toUpperCase()))];
 const body=`${event.body}\n${event.kind==='cancelled'?'原排期':'重置时间'}：${when}（北京时间）\n适用范围：${scopes.join('；')}${group.sources.length>1?`\n已合并 ${group.sources.length} 个信源的同类消息`:''}`;
 return {first,group,event:{...event,notificationGroup:group.id,body,sources:[...group.sources],evidence:[...group.evidence]}};
}
const xml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const shouldNotify=(group,enabled)=>!!group&&enabled&&!group.delivered&&!group.pending;
function toastXml(title,body,id,silent=true,receiptLabel='确认收到'){
 return `<toast scenario="reminder" launch="type=click&amp;tag=${xml(id)}"><visual><binding template="ToastGeneric"><text>${xml(title)}</text><text>${xml(body)}</text></binding></visual><actions><action activationType="system" arguments="dismiss" content="${xml(receiptLabel)}"/></actions><audio silent="${silent?'true':'false'}"/></toast>`;
}
module.exports={interval,mergeMessage,toastXml,TOLERANCE,shouldNotify};
