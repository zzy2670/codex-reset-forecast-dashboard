(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.HistoryGroups=api;})(globalThis,()=>{
 'use strict';
 const automatic=new Set(['global','automatic','regular','reset','global_and_banked','both','combined','observation']);
 const validPercent=x=>Number.isFinite(x)&&x>=0&&x<=100;
 const stamp=x=>Date.parse(x.at);
 function dayKey(at,zone){return new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at));}
 function eligible(row){const plans=row.scope?.plans||[];return row.type==='local'||automatic.has(row.type)&&(!plans.length||plans.includes('all'));}
 function sourcesOf(members){const found=new Map();for(const row of members)for(const source of row.sources||[]){const value={...source,at:source.at||row.at},key=JSON.stringify([value.id,value.url,value.at,value.phase]);if(!found.has(key))found.set(key,value);}return [...found.values()];}
 function combine(members,key){
  const ordered=[...members].sort((a,b)=>stamp(a)-stamp(b)||String(a.id).localeCompare(String(b.id)));
  const locals=ordered.filter(r=>r.type==='local');
  // The first main-window refill is the day's local reset clock. Extra samples
  // and public completion times stay in the evidence, not as extra refills.
  const local=locals.find(r=>r.windowKey!=='secondary')||locals[0];
  const primary=local||ordered.find(r=>r.type!=='observation')||ordered[0];
  const result={...primary,sources:sourcesOf(ordered),members:ordered,mergedCount:members.length,day:key};
  if(local){
   const compatible=locals.filter(r=>(r.bucketId||'codex')===(local.bucketId||'codex')&&(r.windowKey||'primary')===(local.windowKey||'primary'));
   const before=compatible.find(r=>validPercent(r.beforeRemainingPercent)&&(Number.isFinite(Date.parse(r.beforeFetchedAt))?Date.parse(r.beforeFetchedAt)<=stamp(local):stamp(r)<=stamp(local)));
   for(const field of ['beforeRemainingPercent','beforeFetchedAt','beforeBasis','beforeProvenance']){delete result[field];if(before&&before[field]!==undefined)result[field]=before[field];}
   const after=[...compatible].reverse().find(r=>validPercent(r.afterRemainingPercent));if(after)result.afterRemainingPercent=after.afterRemainingPercent;
  }
  result.familyCount=new Set(result.sources.map(s=>s.family).filter(Boolean)).size;
  return result;
 }
 function rows(history=[],localHistory=[],{now=Date.now(),cutoff=-Infinity,zone='Asia/Shanghai'}={}){
  const groups=new Map(),separate=[];
  for(const row of [...history,...localHistory]){
   const at=stamp(row);if(!Number.isFinite(at)||at<cutoff||at>now)continue;
   if(!eligible(row)){separate.push({...row,sources:[...(row.sources||[])]});continue;}
   const key=dayKey(at,zone);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);
  }
  return [...separate,...[...groups].map(([key,members])=>combine(members,key))].sort((a,b)=>stamp(b)-stamp(a));
 }
 return {rows};
});
