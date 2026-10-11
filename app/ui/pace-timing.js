(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PaceTiming=api;})(globalThis,()=>{
 'use strict';
 const automatic=new Set(['reset','regular','global','automatic','global_and_banked','both','combined']);
 function isFresh(s,now=Date.now()){
  const age=now-Date.parse(s?.updatedAt),readAge=now-Date.parse(s?.fetchedAt);
  return s?.status==='ok'&&Number.isFinite(age)&&age>=-300000&&age<=s.maxAge&&Number.isFinite(readAge)&&readAge>=-300000&&readAge<=s.maxAge&&(!s.expiresAt||Date.parse(s.expiresAt)>now);
 }
 function forecastState(f,now=Date.now()){
  if(!f)return 'none';
  return f.state==='scheduled'&&Date.parse(f.end||f.start)<=now?'elapsed':f.state;
 }
 function remainingSchedule(f,now=Date.now()){
  if(!f)return {state:'none'};
  const start=Date.parse(f.start),end=Date.parse(f.end);
  return forecastState(f,now)==='scheduled'&&start<=now&&end>now&&start<end
   ?{...f,start:null,originalStart:f.start,clippedStart:true}:f;
 }
 function paceProgress(anchor,deadline,now=Date.now()){
  if(!Number.isFinite(anchor)||!Number.isFinite(deadline)||deadline<=anchor)return null;
  return Math.max(0,Math.min(100,(now-anchor)/(deadline-anchor)*100));
 }
 function projectForecasts(source,now=Date.now()){
  const key=f=>`${f.id}:${f.start}:${f.end}:${f.type}:${[...(f.scope?.plans||[])].sort().join(',')}:${f.timingKind||'announcement'}`;
  const unique=items=>[...new Map(items.filter(f=>f&&f.state!=='none').map(f=>[key(f),f])).values()];
  const linked=new Set((source.historyEvents||[]).flatMap(e=>e.relatedRecordIds||[]).map(String));
  const disposed=new Map((source.dispositions||[]).map(f=>[String(f.id),f.outcome]));
  const active=[],retired=[];
  for(const f of unique([source.forecast,...(source.additionalForecasts||[])])){
   const outcome=disposed.get(String(f.id))||(linked.has(String(f.id))?'fulfilled':null);
   if(outcome||forecastState(f,now)==='elapsed')retired.push({...f,state:forecastState(f,now),retiredReason:outcome||'expired'});
   else active.push(f);
  }
  const primary=active.find(f=>automatic.has(f.type)&&f.state==='scheduled')||active.find(f=>automatic.has(f.type));
  return {...source,forecast:primary||{state:'none'},additionalForecasts:active.filter(f=>f!==primary),archivedForecasts:unique([...(source.archivedForecasts||[]),...retired])};
 }
 function historyStart(){return Date.parse('2026-09-01T00:00:00+08:00');}
 function latestNews(source,now=Date.now()){
  const items=[source.forecast,...(source.additionalForecasts||[]),...(source.archivedForecasts||[]),...(source.signals||[]),...(source.historyEvents||[]),source.lastReset]
   .filter(n=>n&&n.text&&Number.isFinite(Date.parse(n.issuedAt||n.at))&&Date.parse(n.issuedAt||n.at)<=now+60000)
   .map(n=>({...n,at:n.issuedAt||n.at})).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
  const latest=items[0];if(!latest)return null;
  // A short deadline reply needs the preceding banked-reset announcement as context.
  const context=latest.type==='banked'?items.find(n=>n.type==='banked'&&n.text!==latest.text&&n.url!==latest.url&&Math.abs(Date.parse(n.at)-Date.parse(latest.at))<=3600000):null;
  return {...latest,context};
 }
 function warning(sources,quota,consensus,days=3,now=Date.now()){
  const entries=[];
  for(const s of sources||[]){
   if(!isFresh(s,now))continue;
   const projected=projectForecasts(s,now);
   for(const f of [projected.forecast,...(projected.additionalForecasts||[])]){
    if(!f||forecastState(f,now)!=='scheduled'||['hint','inferred','model'].includes(f.timingKind)||!automatic.has(f.type||'global'))continue;
    const plans=f.scope?.plans;
    if(plans?.length&&!plans.includes('all')&&(!quota?.planType||!plans.includes(quota.planType.toLowerCase())))continue;
    const remaining=remainingSchedule(f,now);
    const times=[remaining.start,remaining.end].map(Date.parse).filter(Number.isFinite);if(!times.length)continue;
    const start=Math.min(...times),end=Math.max(...times);if(end<=now)continue;
    if(f.start&&f.end&&Date.parse(f.start)>Date.parse(f.end))continue;
    entries.push({sourceId:s.id,name:s.name,start,end,precision:f.precision});
   }
  }
  if(!entries.length)return {active:false};
  const earliest=Math.min(...entries.map(e=>e.start)),latest=Math.max(...entries.map(e=>e.end));
  const globalAnchor=Date.parse(consensus?.at),personalEnd=Date.parse(quota?.resetsAt),duration=Number(quota?.durationMins)*60000;
  const globalKnown=consensus?.state==='confirmed'&&Number.isFinite(globalAnchor)&&globalAnchor<=now;
  const personalAnchor=Number.isFinite(personalEnd)&&duration>0&&personalEnd>now?personalEnd-duration:NaN;
  const axisStart=globalKnown?globalAnchor:personalAnchor,axisEnd=latest;
  const mapped=Number.isFinite(axisStart)&&axisStart<=now&&earliest>axisStart;
  const axisLabel=globalKnown?'上次全局重置':'个人额度周期起点';
  // Earlier deadlines require faster consumption: their pace is the right edge.
  const left=mapped?paceProgress(axisStart,latest,now):null,right=mapped?paceProgress(axisStart,earliest,now):null;
  return {active:true,earliest,latest,range:earliest!==latest,entries,sourceCount:new Set(entries.map(e=>e.sourceId)).size,
   mapped,axisStart,axisEnd,axisLabel,left,right};
 }
 return {warning,isFresh,forecastState,remainingSchedule,paceProgress,historyStart,projectForecasts,latestNews};
});
