(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.HistoryGroups=api;})(globalThis,()=>{
 'use strict';
 const MARGIN=3*3600000;
 const automatic=new Set(['global','automatic','regular','reset','global_and_banked','both','combined']);
 const validPercent=x=>Number.isFinite(x)&&x>=0&&x<=100;
 const stamp=x=>Date.parse(x.at);
 const limited=row=>{const plans=row.scope?.plans||[];return plans.length&&!plans.includes('all');};
 const completion=row=>automatic.has(row.type)&&!limited(row)&&!row.evidenceOnly&&!['observation','commentary','repair'].includes(row.phase);
 function sourcesOf(members){const found=new Map();for(const row of members)for(const source of row.sources||[]){const value={...source,at:source.at||row.at},key=JSON.stringify([value.id,value.url,value.at,value.phase]);if(!found.has(key))found.set(key,value);}return [...found.values()];}
 function officialBounds(row){const times=[stamp(row),...(row.sources||[]).filter(s=>!s.evidenceOnly&&!['observation','commentary','repair'].includes(s.phase)).map(stamp)].filter(Number.isFinite);return {start:Math.min(...times),end:Math.max(...times)};}
 const distance=(at,g)=>at<g.start?g.start-at:at>g.end?at-g.end:0;
 const compatible=(a,b)=>(a.bucketId||'codex')===(b.bucketId||'codex')&&(a.windowKey||'primary')===(b.windowKey||'primary');
 function sameReceipt(a,b){return !!a.id&&a.id===b.id||!!a.resetsAt&&a.resetsAt===b.resetsAt&&compatible(a,b);}
 function combine(group){
  const ordered=[...group.members].sort((a,b)=>stamp(a)-stamp(b)||String(a.id).localeCompare(String(b.id)));
  const locals=ordered.filter(r=>r.type==='local'),local=locals.find(r=>r.windowKey!=='secondary')||locals[0];
  const primary=local||ordered.find(completion)||ordered[0];
  const result={...primary,sources:sourcesOf(ordered),members:ordered,mergedCount:ordered.length};
  if(group.official){result.type='global';result.officialWindow={start:new Date(group.start).toISOString(),end:new Date(group.end).toISOString()};result.hasLocalReset=!!local;}
  if(local){
   const candidates=locals.filter(r=>compatible(r,local));
   const before=candidates.find(r=>validPercent(r.beforeRemainingPercent)&&(Number.isFinite(Date.parse(r.beforeFetchedAt))?Date.parse(r.beforeFetchedAt)<=stamp(local):stamp(r)<=stamp(local)));
   for(const field of ['beforeRemainingPercent','beforeFetchedAt','beforeBasis','beforeProvenance']){delete result[field];if(before&&before[field]!==undefined)result[field]=before[field];}
   const after=[...candidates].reverse().find(r=>validPercent(r.afterRemainingPercent));if(after)result.afterRemainingPercent=after.afterRemainingPercent;
  }
  result.familyCount=new Set(result.sources.map(s=>s.family).filter(Boolean)).size;
  return result;
 }
 function rows(history=[],localHistory=[],{now=Date.now(),cutoff=-Infinity}={}){
  const valid=row=>Number.isFinite(stamp(row))&&stamp(row)>=cutoff&&stamp(row)<=now;
  const publicRows=history.filter(valid),locals=localHistory.filter(valid).sort((a,b)=>stamp(a)-stamp(b));
  const groups=[],separate=[];
  for(const row of publicRows.filter(completion).sort((a,b)=>stamp(a)-stamp(b))){
   const range=officialBounds(row),group=groups.find(g=>range.start<=g.end+MARGIN&&range.end>=g.start-MARGIN);
   if(group){group.members.push(row);group.start=Math.min(group.start,range.start);group.end=Math.max(group.end,range.end);}
   else groups.push({official:true,members:[row],...range});
  }
  for(const row of publicRows.filter(r=>!completion(r))){
   const group=row.type==='observation'&&!limited(row)?groups.filter(g=>distance(stamp(row),g)<=MARGIN).sort((a,b)=>distance(stamp(row),a)-distance(stamp(row),b))[0]:null;
   if(group)group.members.push(row);else separate.push({...row,sources:[...(row.sources||[])]});
  }
  const unmatched=[];
  for(const row of locals){
   const group=groups.filter(g=>distance(stamp(row),g)<=MARGIN).sort((a,b)=>distance(stamp(row),a)-distance(stamp(row),b))[0];
   if(group){
    const prior=group.members.find(r=>r.type==='local'&&compatible(r,row)&&stamp(r)<stamp(row)&&!sameReceipt(r,row));
    if(prior&&row.beforeRemainingPercent===0){separate.push({...row,type:'personal_card',sources:[...(row.sources||[])],cardBasis:'exhausted-after-reset'});}
    else group.members.push(row);
   }else{
    const previous=groups.filter(g=>g.end<stamp(row)&&g.members.some(member=>member.type==='local'&&compatible(member,row)&&stamp(member)<stamp(row))).sort((a,b)=>b.end-a.end)[0];
    const intervening=previous&&groups.some(g=>g!==previous&&g.start>previous.end&&g.start<=stamp(row));
    if(row.beforeRemainingPercent===0&&previous&&!intervening){separate.push({...row,type:'personal_card',sources:[...(row.sources||[])],cardBasis:'exhausted-after-reset'});continue;}
    // Without public completion evidence, retain the local identity. Only
    // duplicate quota-cycle receipts may be collapsed; a calendar day is not evidence.
    const existing=unmatched.find(g=>g.members.some(member=>sameReceipt(member,row)));
    if(existing)existing.members.push(row);else unmatched.push({members:[row]});
   }
  }
  return [...separate,...groups.map(combine),...unmatched.map(combine)].sort((a,b)=>stamp(b)-stamp(a));
 }
 return {rows};
});
