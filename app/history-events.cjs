'use strict';

const observationsToCompletions=new Map([
 ['2110595554036400151','2110618732666257557'],
 ['2111492738025959922','2111566005684289735']
]);
const automatic=new Set(['global','automatic','regular','reset','global_and_banked','both','combined']);
const knownFamilies={codex:'codex-reset',did:'didcodexreset',next:'codex-resets-feed',tibo:'codex-resets-feed',today:null};
const copy=value=>value===undefined?undefined:structuredClone(value);
function postId(value){
 try{const u=new URL(value);return u.protocol==='https:'&&['x.com','twitter.com','www.x.com','www.twitter.com'].includes(u.hostname)?u.pathname.match(/^\/[^/]+\/status\/(\d+)\/?$/)?.[1]||null:null;}catch{return null;}
}
const identity=row=>postId(row.url)||String(row.id??'');
const idsOf=row=>new Set([identity(row),String(row.id??'')].filter(Boolean));
function phase(row){
 if(observationsToCompletions.has(identity(row))||row.type==='observation'||row.phase==='observation'||/^\s*Reset observed\b[^\n]*\bawaiting\b/i.test(row.text||''))return 'observation';
 if(identity(row)==='2097183639356489952'||row.type==='commentary'||row.phase==='commentary')return 'commentary';
 if(identity(row)==='2106239435461579088'||row.type==='repair'||row.phase==='repair')return 'repair';
 if(row.evidenceOnly===true)return 'observation';
 if(row.sources?.length&&row.sources.every(source=>source.evidenceOnly||['observation','commentary','repair'].includes(source.phase)))return 'observation';
 return 'completion';
}
function classified(row){
 const result=copy(row),role=phase(result);
 if(role!=='completion'){
  if(result.type!==role&&result.originalType===undefined)result.originalType=result.type;
  if(result.kindLabel!==undefined&&result.originalKindLabel===undefined)result.originalKindLabel=result.kindLabel;
  delete result.kindLabel;result.type=role;result.phase=role;
  if(Array.isArray(result.sources))result.sources=result.sources.map(source=>({...source,phase:role,evidenceOnly:true}));
 }
 if(role==='observation'&&observationsToCompletions.has(identity(result)))result.completionRecordId=observationsToCompletions.get(identity(result));
 if(identity(result)==='2097183639356489952')result.relation={kind:'commentary',eventId:'2097174560412246215'};
 if(identity(result)==='2106239435461579088'){
  if(result.originalScope===undefined)result.originalScope=copy(result.scope??null);
  result.scope={...(result.scope||{}),plans:['pro500']};
  result.relation={kind:'repair',eventId:'2106131810921136451'};
 }
 return result;
}
function sourceKey(source){return `${source.id||source.family||''}:${source.phase||'completion'}:${postId(source.url)||source.url||''}`;}
function uniqueSources(sources){
 const result=new Map();
 for(const source of sources||[]){
  const key=sourceKey(source),previous=result.get(key);
  if(!previous||Date.parse(source.observedAt)>Date.parse(previous.observedAt))result.set(key,copy(source));
 }
 return [...result.values()];
}
const collectionFields=new Set(['observedAt','fetchedAt']);
function evidenceVersion(value,key){
 if(Array.isArray(value)){
  const result=value.map(item=>evidenceVersion(item));
  return key==='sources'?[...new Map(result.map(item=>[JSON.stringify(item),item])).values()].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))):result;
 }
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().filter(name=>!collectionFields.has(name)&&!['familyCount','timeConflict'].includes(name)).map(name=>[name,evidenceVersion(value[name],name)]));
 return value;
}
const evidenceKey=value=>JSON.stringify(evidenceVersion(value));
function mergeCollectionTimes(previous,incoming){
 if(Array.isArray(previous)&&Array.isArray(incoming))return previous.map(item=>{
  const match=incoming.find(candidate=>evidenceKey(candidate)===evidenceKey(item));return match===undefined?copy(item):mergeCollectionTimes(item,match);
 });
 if(previous&&incoming&&typeof previous==='object'&&typeof incoming==='object'){
  const result=copy(previous);
  for(const [key,value] of Object.entries(incoming)){
   if(collectionFields.has(key)){
    if(result[key]===undefined||Date.parse(value)>Date.parse(result[key]))result[key]=copy(value);
   }else if(result[key]!==undefined)result[key]=mergeCollectionTimes(result[key],value);
  }
  return result;
 }
 return copy(previous);
}
function uniqueEvidence(evidence){
 const result=new Map();
 for(const item of evidence){const key=evidenceKey(item);result.set(key,result.has(key)?mergeCollectionTimes(result.get(key),item):copy(item));}
 return [...result.values()];
}
function snapshot(row){const result=copy(row);delete result.evidence;delete result.observations;return result;}
const evidenceOf=row=>row.evidence===undefined?[snapshot(row)]:Array.isArray(row.evidence)?row.evidence:[row.evidence];
function completion(row){return phase(row)==='completion'&&(automatic.has(row.type)||row.type==='banked')&&!['forecast','scheduled','hint'].includes(row.phase);}
function compatible(a,b){
 const plans=row=>(row.scope?.plans||[]).map(p=>String(p).toLowerCase()).filter(p=>p!=='unknown');
 const x=plans(a),y=plans(b);
 if(x.length&&y.length&&!x.includes('all')&&!y.includes('all')&&!x.some(p=>y.includes(p)))return false;
 const original=a.originalType||a.type;
 return original==='banked'?b.type==='banked':original==='observation'||!automatic.has(original)||automatic.has(b.type);
}
function targetFor(row,completed){
 const direct=observationsToCompletions.get(identity(row))||row.completionRecordId;
 const candidates=direct?completed.filter(item=>idsOf(item).has(String(direct))):completed.filter(item=>(item.relatedRecordIds||[]).some(id=>idsOf(row).has(String(id))));
 const matches=candidates.filter(item=>compatible(row,item));return matches.length===1?matches[0]:null;
}
function metrics(row){
 row.sources=uniqueSources(row.sources);
 const completed=phase(row)==='completion'?row.sources.filter(s=>!s.evidenceOnly&&!['observation','commentary','repair'].includes(s.phase)):[];
 const families=new Set(completed.map(s=>Object.hasOwn(knownFamilies,s.id)?knownFamilies[s.id]:s.family).filter(f=>f&&f!=='unverified-feed'));
 const times=completed.map(s=>Date.parse(s.at||row.at)).filter(Number.isFinite);
 return {...row,familyCount:families.size,timeConflict:times.length>1&&Math.max(...times)!==Math.min(...times)};
}
function manualIdentity(row){
 if(row.url)return null;
 const segments=String(row.id??'').split(':'),manual=segments.indexOf('manual');
 if(manual<1||manual===segments.length-1||!segments.slice(0,manual).every(id=>Object.hasOwn(knownFamilies,id)))return null;
 return segments.slice(manual-1).join(':');
}
function mergeCachedCopies(records){
 const groups=new Map(),absorbed=new Set();
 for(const row of records){const key=manualIdentity(row);if(key){if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}}
 for(const [key,rows] of groups){
  if(rows.length<2)continue;
  const canonical=rows.find(row=>row.id===key&&completion(row))||rows.find(completion)||rows.find(row=>row.id===key)||rows[0];
  for(const duplicate of rows){
   if(duplicate===canonical||!compatible(duplicate,canonical))continue;
   const before=evidenceOf(canonical);
   canonical.sources=uniqueSources([...(canonical.sources||[]),...(duplicate.sources||[])]);
   if(canonical.observations||duplicate.observations)canonical.observations=uniqueEvidence([...(canonical.observations||[]),...(duplicate.observations||[])]);
   canonical.evidence=uniqueEvidence([...before,...evidenceOf(duplicate),snapshot(duplicate)]);
   if(canonical.relatedRecordIds||duplicate.relatedRecordIds)canonical.relatedRecordIds=[...new Set([...(canonical.relatedRecordIds||[]),...(duplicate.relatedRecordIds||[])])];
   absorbed.add(duplicate);
  }
 }
 return records.filter(row=>!absorbed.has(row));
}
function reconcileHistory(rows){
 const records=mergeCachedCopies((Array.isArray(rows)?rows:[]).filter(row=>row&&typeof row==='object').map(classified));
 const completed=records.filter(completion),absorbed=new Set();
 for(const observed of records.filter(row=>phase(row)==='observation')){
  const canonical=targetFor(observed,completed);if(!canonical)continue;
  const existingEvidence=evidenceOf(canonical);
  canonical.observations=uniqueEvidence([...(canonical.observations||[]),observed]);
  canonical.evidence=uniqueEvidence([...existingEvidence,...evidenceOf(observed)]);
  canonical.sources=uniqueSources([...(canonical.sources||[]),...(observed.sources||[])]);
  absorbed.add(observed);
 }
 return records.filter(row=>!absorbed.has(row)).map(metrics);
}
function projectSourceHistory(source){
 if(!source||typeof source!=='object')return source;
 const result={...source};
 if(source.lastReset&&typeof source.lastReset==='object')result.lastReset=classified(source.lastReset);
 if(Array.isArray(source.historyEvents))result.historyEvents=source.historyEvents.filter(row=>row&&typeof row==='object').map(classified);
 return result;
}
module.exports={reconcileHistory,projectSourceHistory,uniqueEvidence};
