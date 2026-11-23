(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.HistoryGroups=api;})(globalThis,()=>{
 'use strict';
 const MARGIN=6*3600000;
 const automatic=new Set(['global','automatic','regular','reset','global_and_banked','both','combined']);
 const combinedCard=new Set(['global_and_banked','both','combined']);
 const supportPhases=new Set(['observation','commentary','repair']);
 const forecastPhases=new Set(['forecast','scheduled','hint','pending','preview']);
 const knownFamilies={codex:'codex-reset',did:'didcodexreset',next:'codex-resets-feed',tibo:'codex-resets-feed',today:null};
 const validPercent=value=>Number.isFinite(value)&&value>=0&&value<=100;
 const stamp=row=>Date.parse(row?.at);
 const plans=row=>Array.isArray(row?.scope?.plans)?row.scope.plans.map(value=>String(value).toLowerCase()).filter(Boolean):[];
 const limited=row=>{const values=plans(row).filter(value=>value!=='unknown');return values.length>0&&!values.includes('all');};
 const unknownScope=row=>{const values=plans(row);return values.length>0&&values.every(value=>value==='unknown');};
 const onlyEvidence=row=>Array.isArray(row.sources)&&row.sources.length>0&&row.sources.every(source=>source.evidenceOnly||supportPhases.has(source.phase));
 const forecastOnly=row=>forecastPhases.has(row.type)||forecastPhases.has(row.phase);
 const completion=row=>automatic.has(row.type)&&!limited(row)&&!unknownScope(row)&&!row.evidenceOnly&&!onlyEvidence(row)&&!supportPhases.has(row.phase)&&!forecastOnly(row);
 const supporting=row=>!limited(row)&&!['banked','repair'].includes(row.type)&&row.phase!=='repair'&&!forecastOnly(row)&&(row.type==='observation'||row.type==='commentary'||row.phase==='observation'||row.phase==='commentary'||row.evidenceOnly||onlyEvidence(row)||automatic.has(row.type)&&unknownScope(row));
 const asSupport=row=>supporting(row)&&automatic.has(row.type)?{...row,originalType:row.originalType||row.type,type:row.phase==='commentary'?'commentary':'observation',phase:row.phase==='commentary'?'commentary':'observation',evidenceOnly:true}:row;
 const accountKey=row=>typeof row?.accountFingerprint==='string'&&row.accountFingerprint?`account:${row.accountFingerprint}`:'unknown';
 // Every quota window has its own arrival and pre-refill balance.
 const localClusterKey=row=>row.identityUnverified?`unverified:${JSON.stringify(row)}`:JSON.stringify([accountKey(row),row.bucketId||'codex',row.windowKey||'primary']);
 const compatible=(a,b)=>accountKey(a)===accountKey(b)&&(a.bucketId||'codex')===(b.bucketId||'codex')&&(a.windowKey||'primary')===(b.windowKey||'primary');
 // A quota deadline describes a cycle, not a receipt: several refills may
 // happen before the same deadline. Require receipt identity or the same
 // observed arrival time plus the same cycle to deduplicate records.
 const sameReceipt=(a,b)=>compatible(a,b)&&(!(a.identityUnverified||b.identityUnverified)||JSON.stringify(a)===JSON.stringify(b))&&(!!a.id&&a.id===b.id||stamp(a)===stamp(b)&&!!a.resetsAt&&a.resetsAt===b.resetsAt);
 function postKey(value){
  try{const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password)return null;
   const match=['x.com','www.x.com','twitter.com','www.twitter.com'].includes(url.hostname)&&url.pathname.match(/^\/[^/]+\/status\/(\d+)\/?$/);
   // Provider homepages and latest-feed endpoints recur across many resets;
   // only a specific X post is a safe URL identity for this data set.
   return match?`post:${match[1]}`:null;
  }catch{return null;}
 }
 function idsOf(row){
  const ids=new Set();
  const add=value=>{if(value===undefined||value===null)return;const id=String(value);if(!id||id==='null')return;ids.add(id);const manual=id.match(/(?:^|:)manual:(\d+)$/);if(manual)ids.add(manual[1]);};
  add(row.id);add(row.key);for(const value of [row.url,...(row.sources||[]).map(source=>source.url)]){const key=postKey(value);if(key){ids.add(key);if(key.startsWith('post:'))ids.add(key.slice(5));}}
  return ids;
 }
 function refsOf(row){return new Set([...(Array.isArray(row.relatedRecordIds)?row.relatedRecordIds:[]),row.relation?.eventId,row.completionRecordId].filter(value=>value!==undefined&&value!==null&&String(value)!==''&&String(value)!=='null').map(String));}
 function related(row,group){
  const ids=idsOf(row),refs=refsOf(row);
  return group.members.some(member=>{const otherIds=idsOf(member),otherRefs=refsOf(member);return [...ids].some(id=>otherIds.has(id)||otherRefs.has(id))||[...refs].some(id=>otherIds.has(id));});
 }
 function sourcesOf(members){
  const found=new Map();
  for(const row of members)for(const source of row.sources||[]){
   // The event time and an individual source's reported time are different
   // facts. A missing source timestamp must remain unknown.
   const evidence=supporting(row),value={...source};
   if(evidence){value.evidenceOnly=true;if(!value.phase)value.phase=row.phase||row.type;}
   const key=JSON.stringify([value.id,value.url,value.at,value.phase]);if(!found.has(key))found.set(key,value);
  }
  return [...found.values()];
 }
 function officialBounds(row,now){
  const anchor=stamp(row),times=[anchor,...(row.sources||[]).filter(source=>!source.evidenceOnly&&!supportPhases.has(source.phase)).map(stamp)].filter(value=>Number.isFinite(value)&&value<=now).sort((a,b)=>a-b);
  // Keep distant source timestamps as evidence but never let them widen a
  // single record's time-matching interval beyond six hours.
  let best={start:anchor,end:anchor,count:0};
  for(let i=0;i<times.length;i++)for(let j=i;j<times.length&&times[j]-times[i]<=MARGIN;j++){
   if(times[i]>anchor||times[j]<anchor)continue;
   const count=j-i+1;if(count>best.count||count===best.count&&times[j]-times[i]<best.end-best.start)best={start:times[i],end:times[j],count};
  }
  return {start:best.start,end:best.end};
 }
 const distance=(at,group)=>at<group.start?group.start-at:at>group.end?at-group.end:0;
 const rangeDistance=(range,group)=>range.end<group.start?group.start-range.end:range.start>group.end?range.start-group.end:0;
 const fits=(range,group)=>Math.max(range.end,group.end)-Math.min(range.start,group.start)<=MARGIN;
 function nearest(groups,at){return groups.sort((a,b)=>distance(at,a)-distance(at,b)||Math.abs(at-(a.start+a.end)/2)-Math.abs(at-(b.start+b.end)/2)||a.start-b.start)[0];}
 function attach(group,row,range){
  group.members.push(asSupport(row));
  // A directly linked late announcement is evidence, but must not expand the
  // temporal window used to attach an unrelated later receipt.
  if(range&&fits(range,group)){group.start=Math.min(group.start,range.start);group.end=Math.max(group.end,range.end);}
 }
 function combine(group,locals=[]){
  const ordered=[...group.members,...locals].sort((a,b)=>stamp(a)-stamp(b)||String(a.id).localeCompare(String(b.id)));
  const local=locals.find(row=>row.windowKey!=='secondary')||locals[0];
  const primary=local||ordered.find(completion)||ordered[0];
  const result={...primary,sources:sourcesOf(ordered),members:ordered,mergedCount:ordered.length};
  if(group.official){result.type='global';result.officialGroupKey=group.key;result.officialWindow={start:new Date(group.start).toISOString(),end:new Date(group.end).toISOString()};result.hasLocalReset=!!local;result.hasBankedIssuance=group.members.some(row=>combinedCard.has(row.type)||combinedCard.has(row.originalType));}
  if(local){
   const candidates=locals.filter(row=>{
    if(!compatible(row,local)||!validPercent(row.beforeRemainingPercent))return false;
    const captured=Date.parse(row.beforeFetchedAt);
    if(row.beforeBasis==='snapshot'&&!Number.isFinite(captured))return false;
    if(row.beforeFetchedAt&&(!Number.isFinite(captured)||captured>stamp(local)))return false;
    return row===local||Number.isFinite(captured)&&captured<=stamp(local);
   });
   candidates.sort((a,b)=>Number(b.beforeBasis==='transition')-Number(a.beforeBasis==='transition')||(Date.parse(b.beforeFetchedAt)||-Infinity)-(Date.parse(a.beforeFetchedAt)||-Infinity));
   const before=candidates[0];
   for(const field of ['beforeRemainingPercent','beforeFetchedAt','beforeBasis','beforeProvenance']){delete result[field];if(before&&before[field]!==undefined)result[field]=before[field];}
   const after=[...locals].reverse().find(row=>compatible(row,local)&&validPercent(row.afterRemainingPercent));if(after)result.afterRemainingPercent=after.afterRemainingPercent;
  }
  const completedSources=result.sources.filter(source=>!source.evidenceOnly&&!supportPhases.has(source.phase));
  result.familyCount=new Set(completedSources.map(source=>Object.hasOwn(knownFamilies,source.id)?knownFamilies[source.id]:source.family).filter(family=>family&&family!=='unverified-feed')).size;
  const times=completedSources.map(stamp).filter(Number.isFinite);if(group.official&&new Set(times).size>1)result.timeConflict=true;
  return result;
 }
 function rows(history=[],localHistory=[],{now=Date.now(),cutoff=-Infinity}={}){
  const valid=row=>row&&Number.isFinite(stamp(row))&&stamp(row)>=cutoff&&stamp(row)<=now;
  const publicRows=(Array.isArray(history)?history:[]).filter(row=>valid(row)&&!forecastOnly(row)),locals=(Array.isArray(localHistory)?localHistory:[]).filter(valid).sort((a,b)=>stamp(a)-stamp(b));
  const groups=[],separate=[];
  for(const row of publicRows.filter(completion).sort((a,b)=>stamp(a)-stamp(b)||String(a.id).localeCompare(String(b.id)))){
   const range=officialBounds(row,now),linked=groups.filter(group=>related(row,group));
   const byTime=groups.filter(group=>fits(range,group)).sort((a,b)=>rangeDistance(range,a)-rangeDistance(range,b)||a.start-b.start);
   const group=linked.length?nearest(linked,stamp(row)):byTime[0];
   if(group)attach(group,row,range);else groups.push({official:true,key:`official:${String(row.id??postKey(row.url)??row.at)}`,members:[row],locals:new Map(),...range});
  }
  const pending=publicRows.filter(row=>!completion(row)).sort((a,b)=>stamp(a)-stamp(b));
  let changed=true;
  while(changed){changed=false;for(let i=pending.length-1;i>=0;i--){const row=pending[i];if(!supporting(row))continue;
   const linked=groups.filter(group=>related(row,group));if(!linked.length)continue;
   // A stale manual reference can point to an older post even though a new
   // local receipt was observed beside the manual record. Keep it pending for
   // that nearby receipt instead of widening the older official event.
   const nearLocal=locals.some(local=>!local.periodicWindow&&!['personal_card','plan_upgrade'].includes(local.type)&&Math.abs(stamp(local)-stamp(row))<=MARGIN);
   if(nearLocal&&linked.every(group=>distance(stamp(row),group)>MARGIN))continue;
   attach(nearest(linked,stamp(row)),row,null);pending.splice(i,1);changed=true;
  }}
  for(let i=pending.length-1;i>=0;i--){const row=pending[i];if(!supporting(row))continue;const nearby=groups.filter(group=>distance(stamp(row),group)<=MARGIN);if(nearby.length){attach(nearest(nearby,stamp(row)),row,null);pending.splice(i,1);}}
  const unmatched=[],processed=[],upgrades=locals.filter(row=>row.type==='plan_upgrade');
  for(const row of locals){
   // An ordinary short-cycle renewal is independent even if it happens at
   // exactly the same time as an official reset or another local refill.
   if(row.periodicWindow&&!['plan_upgrade','personal_card'].includes(row.type)){separate.push({...row,type:'local',sources:[...(row.sources||[])]});continue;}
   if(row.type==='plan_upgrade'||row.type==='personal_card'){separate.push({...row,sources:[...(row.sources||[])]});processed.push({row,group:null});continue;}
   // A confirmed upgrade for the same verified account and quota cycle is
   // the more specific explanation for the identical refill observation.
   if(row.accountFingerprint&&!row.identityUnverified&&upgrades.some(upgrade=>upgrade.accountFingerprint===row.accountFingerprint&&!upgrade.identityUnverified&&sameReceipt(row,upgrade)))continue;
   const nearby=groups.filter(group=>distance(stamp(row),group)<=MARGIN),group=nearby.length?nearest(nearby,stamp(row)):null;
   const cluster=group?.locals.get(localClusterKey(row))||[];
   const priorInGroup=cluster.find(previous=>compatible(previous,row)&&stamp(previous)<stamp(row)&&!sameReceipt(previous,row));
   if(group){
    if(priorInGroup){
     if(row.beforeRemainingPercent===0&&!row.refillReasonUnverified&&!row.identityUnverified&&!priorInGroup.identityUnverified)separate.push({...row,type:'personal_card',sources:[...(row.sources||[])],cardBasis:'exhausted-after-reset',cardInferred:true});
     else separate.push({...row,type:'local',sources:[...(row.sources||[])]});
    }
    else{cluster.push(row);group.locals.set(localClusterKey(row),cluster);}
   }else{
    const previous=[...processed].reverse().find(item=>item.group&&compatible(item.row,row)&&stamp(item.row)<stamp(row)&&!sameReceipt(item.row,row));
    const intervening=previous&&groups.some(candidate=>candidate!==previous.group&&candidate.start>stamp(previous.row)&&candidate.start<=stamp(row));
    if(row.beforeRemainingPercent===0&&previous&&!intervening&&!row.identityUnverified&&!previous.row.identityUnverified){
     if(row.refillReasonUnverified)separate.push({...row,type:'local',sources:[...(row.sources||[])]});
     else separate.push({...row,type:'personal_card',sources:[...(row.sources||[])],cardBasis:'exhausted-after-reset',cardInferred:true});
    }
    else{const duplicate=unmatched.find(item=>item.locals.some(previous=>sameReceipt(previous,row)));if(duplicate)duplicate.locals.push(row);else unmatched.push({members:[],locals:[row]});}
   }
   processed.push({row,group});
  }
  const combined=[];
  for(const group of groups){if(group.locals.size){for(const cluster of group.locals.values())combined.push(combine(group,cluster));}else combined.push(combine(group));}
  for(const group of unmatched)combined.push(combine(group,group.locals));
  for(const row of pending){
   const target=supporting(row)?combined.filter(item=>!item.periodicWindow&&['global','local'].includes(item.type)&&Math.abs(stamp(item)-stamp(row))<=MARGIN).sort((a,b)=>Math.abs(stamp(a)-stamp(row))-Math.abs(stamp(b)-stamp(row)))[0]:null;
   if(target){target.members=[...(target.members||[]),asSupport(row)];target.sources=sourcesOf(target.members);target.mergedCount=target.members.length;}
   else if(supporting(row)&&automatic.has(row.type))separate.push({...asSupport(row),sources:sourcesOf([row])});
   else separate.push({...row,sources:[...(row.sources||[])]});
  }
  return [...separate,...combined].sort((a,b)=>stamp(b)-stamp(a)||String(a.id).localeCompare(String(b.id)));
 }
 return {rows};
});
