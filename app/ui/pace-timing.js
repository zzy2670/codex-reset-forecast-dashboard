(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PaceTiming=api;})(globalThis,()=>{
 'use strict';
 const automatic=new Set(['reset','regular','global','automatic','global_and_banked','both','combined']);
 function isFresh(s,now=Date.now()){
  const age=now-Date.parse(s?.updatedAt),readAge=now-Date.parse(s?.fetchedAt);
  return ['ok','retrying'].includes(s?.status)&&Number.isFinite(age)&&age>=-300000&&age<=s.maxAge&&Number.isFinite(readAge)&&readAge>=-300000&&readAge<=s.maxAge&&(!s.expiresAt||Date.parse(s.expiresAt)>now);
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
 // Separate the default official gap from actual local refill association and
 // announcement reporting lag. A later explicit completion remains evidence.
 const officialResetGap=6*3600000,localCompletionTolerance=2*3600000,reportingLagTolerance=2*3600000;
 const plansOf=record=>(record?.scope?.plans||[]).map(p=>String(p).toLowerCase());
 function appliesToPlan(record,plan){
  const plans=plansOf(record);return !plans.length||plans.includes('all')||!!plan&&plans.includes(String(plan).toLowerCase());
 }
 function completionCovers(f,completion,plan){
  const covered=plansOf(completion),wanted=plansOf(f);
  return !covered.length||covered.includes('all')||wanted.length&&!wanted.includes('all')&&wanted.every(p=>covered.includes(p))||!!plan&&appliesToPlan(f,plan)&&appliesToPlan(completion,plan);
 }
 function completionPost(record){
  try{const u=new URL(record.url);return u.protocol==='https:'&&['x.com','twitter.com'].includes(u.hostname)&&/^\/[^/]+\/status\/\d+\/?$/.test(u.pathname);}catch{return false;}
 }
 function localCycleCompletion(quota,localReset,now){
  if(!quota||quota.state&&quota.state!=='ok'||quota.source&&quota.source!=='local-codex')return null;
  const end=Date.parse(quota.resetsAt),duration=Number(quota.durationMins)*60000,at=end-duration;
  const used=Number.isFinite(quota.usedPercent)?quota.usedPercent:Number.isFinite(quota.actual)?quota.actual*100:NaN;
  if(!Number.isFinite(at)||duration<=0||!Number.isFinite(duration)||at>now||!Number.isFinite(used)||used<0||used>100)return null;
  const observed=Date.parse(quota.fetchedAt),receipt=Date.parse(localReset?.observedAt);
  const matching=localReset?.bucketId===quota.bucketId&&localReset?.windowKey===quota.key&&localReset?.resetsAt===quota.resetsAt&&Number.isFinite(receipt)&&receipt>=at&&receipt<=now;
  // Cached cycle boundaries remain historical facts while polling is paused.
  // An unobserved/future cycle or a bare stale/error response is not completion.
  if(!(Number.isFinite(observed)&&observed>=at&&observed<=now+60000)&&!matching)return null;
  return {at,kind:'local-cycle',sourceId:null};
 }
 function projectAfterReset(sources,quota,localReset,now=Date.now()){
  const projected=(sources||[]).map(s=>projectForecasts(s,now));
  const cycle=localCycleCompletion(quota,localReset,now),observed=Date.parse(localReset?.observedAt);
  const local=cycle&&localReset?.kind==='quota-reset'&&localReset.bucketId===quota?.bucketId&&localReset.windowKey===quota?.key&&localReset.resetsAt===quota?.resetsAt&&Number.isFinite(observed)&&observed>=cycle.at&&observed<=now?cycle:null;
  const completions=[];
  for(const s of projected)for(const record of [s.lastReset,...(s.historyEvents||[])]){
   const at=Date.parse(record?.at);
   if(record&&automatic.has(record.type)&&Number.isFinite(at)&&at<=now&&completionPost(record))completions.push({...record,at,kind:'completion-record',sourceId:s.id});
  }
  return projected.map(s=>{
   const active=[],retired=[];
   for(const f of [s.forecast,...(s.additionalForecasts||[])]){
    if(!f||f.state==='none')continue;
    const issued=Date.parse(f.issuedAt),start=Date.parse(f.originalStart||f.start||f.end),end=Date.parse(f.end||f.start);
    const eligible=automatic.has(f.type)&&f.state==='scheduled'&&Number.isFinite(issued)&&Number.isFinite(start)&&Number.isFinite(end)&&start<=end;
    const nearby=(c,tolerance)=>issued<c.at&&(start<=c.at&&c.at<=end||c.at<start&&end-c.at<=tolerance);
    const related=c=>(c.relatedRecordIds||[]).some(id=>String(id)===String(f.id)||String(id)===String(f.url?.match(/\/status\/(\d+)/)?.[1]));
    const explicit=c=>related(c)||c.timeBasis==='effective'&&issued<c.at;
    const officialNearby=c=>issued<c.at&&c.at<=end&&start<=c.at+officialResetGap;
    // Completion announcements can follow the actual refill. Do not let that
    // reporting lag consume an announcement published after the local refill.
    const publicMatches=c=>completionCovers(f,c,quota?.planType)&&(related(c)||officialNearby(c))&&(!cycle||explicit(c)||Math.abs(c.at-cycle.at)>reportingLagTolerance||issued<cycle.at);
    const completion=eligible&&(completions.find(c=>publicMatches(c)&&explicit(c))||(local&&appliesToPlan(f,quota?.planType)&&nearby(local,localCompletionTolerance)?local:null)||completions.find(publicMatches));
    if(completion&&completion.kind==='completion-record'&&!related(completion)&&start>completion.at&&end>completion.at+officialResetGap){
     // The old lower bound falls inside the default gap. Keep the source's
     // original upper bound; the six-hour cutoff is not an announced ETA.
     active.push({...f,start:null,originalStart:f.originalStart||f.start,resetGapClipped:true});
    }
    else if(completion)retired.push({...f,retiredReason:completion.kind==='local-cycle'?'local-reset':'completed',retiredAt:new Date(completion.at).toISOString(),retirementEvidence:{kind:completion.kind,sourceId:completion.sourceId,url:completion.url||null}});
    else active.push(f);
   }
   const primary=active.find(f=>automatic.has(f.type)&&f.state==='scheduled')||active.find(f=>automatic.has(f.type));
   return projectForecasts({...s,forecast:primary||{state:'none'},additionalForecasts:active.filter(f=>f!==primary),archivedForecasts:[...(s.archivedForecasts||[]),...retired]},now);
  });
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
 function warning(sources,quota,consensus,days=3,now=Date.now(),localReset=null){
  const entries=[];
  for(const s of projectAfterReset(sources,quota,localReset,now)){
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
 return {warning,isFresh,forecastState,remainingSchedule,paceProgress,historyStart,projectForecasts,projectAfterReset,localCycleCompletion,latestNews};
});
