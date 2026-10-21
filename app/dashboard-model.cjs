'use strict';
const {safeUrl}=require('./core.cjs');
const {historyStart,hypotheticalPace}=require('./ui/pace-timing.js');
const {reconcileHistory,uniqueEvidence}=require('./history-events.cjs');
const sourceIdentity=source=>`${source.id}:${source.evidenceOnly?'evidence':source.phase||'completion'}:${source.evidenceOnly?source.url||'':''}`;
function preserveEvidence(row,event){
 for(const key of ['observations','evidence','relatedRecordIds']){
  if(event[key]===undefined)continue;
  const before=row[key]===undefined?[]:Array.isArray(row[key])?row[key]:[row[key]];
  const incoming=Array.isArray(event[key])?event[key]:[event[key]];
  row[key]=uniqueEvidence([...before,...incoming]);
 }
 for(const key of ['relation','originalType','originalScope','originalKindLabel','completionRecordId','phase'])if(row[key]===undefined&&event[key]!==undefined)row[key]=structuredClone(event[key]);
}
function resetHistory(sources,previous=[],now=Date.now()){
 const cutoff=historyStart(),records=[];
 for(const old of previous)for(const source of old.sources||[])records.push({...old,source});
 for(const s of sources){for(const e of [...(s.historyEvents||[]),...(s.lastReset?[s.lastReset]:[])])records.push({...e,current:true,source:{id:s.id,name:s.name,family:s.family,observedAt:s.fetchedAt}});}
 const observations=new Map(),groups=new Map();
 for(const e of records){
  const url=safeUrl(e.url),post=url?.match(/(?:x\.com|twitter\.com)\/[^/]+\/status\/(\d+)/)?.[1];
  let stableId=String(e.id||`${e.at}:${e.type}`);
  // Repair older persisted keys, then keep that identity stable across refreshes.
  if(e.type)while(stableId.endsWith(`:${e.type}`))stableId=stableId.slice(0,-e.type.length-1);
  const source=e.source;if(!source?.id)continue;
  if(stableId.startsWith(`${source.id}:`))stableId=stableId.slice(source.id.length+1);
  // The provider regenerates opaque manual closure IDs between responses.
  const key=post||`${source.id}:${/^manual:cl_/.test(stableId)?`manual:${e.at}`:stableId}`;
  const sourceKey=`${key}:${sourceIdentity(source)}`,existing=observations.get(sourceKey);
  const next={...e,key,url};
  if(existing)preserveEvidence(next,existing);
  observations.set(sourceKey,next);
 }
 const rank=e=>(e.timeBasis==='effective'?2:0)+(e.scope?.plans?.length?1:0);
 const sorted=[...observations.values()].sort((a,b)=>Number(!!b.current)-Number(!!a.current)||rank(b)-rank(a)||(Date.parse(b.source.observedAt)||0)-(Date.parse(a.source.observedAt)||0));
 for(const e of sorted){
  const at=Date.parse(e.at);if(!Number.isFinite(at))continue;
  const {key,url}=e,source={...e.source,at:e.source.at||e.at,timeBasis:e.source.timeBasis||e.timeBasis,url:e.source.url||url};
  let row=groups.get(key);
  if(!row){row={...structuredClone(e),id:key,at:new Date(at).toISOString(),url,text:e.text||'',sources:[]};delete row.current;delete row.source;delete row.key;groups.set(key,row);}
  preserveEvidence(row,e);
  if(e.text && e.text.length>row.text.length)row.text=e.text;
  const existing=row.sources.findIndex(x=>sourceIdentity(x)===sourceIdentity(source));
  if(existing<0)row.sources.push(source);else row.sources[existing]=source;
 }
 return reconcileHistory([...groups.values()].filter(r=>Date.parse(r.at)>=cutoff&&Date.parse(r.at)<=now)).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
}
module.exports={historyStart,hypotheticalPace,resetHistory};
