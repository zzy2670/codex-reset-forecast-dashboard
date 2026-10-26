'use strict';

// Personal refill observations are separate from public reset announcements.
// In particular, their timestamps never establish a relationship to a public post.
const isoTime=value=>{
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value))return null;
 const day=value.slice(0,10),dayValue=Date.parse(`${day}T00:00:00.000Z`),at=Date.parse(value);
 return Number.isFinite(dayValue)&&new Date(dayValue).toISOString().slice(0,10)===day&&Number.isFinite(at)?at:null;
};
const percent=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=100?value:null;
function legacyRefillRemaining(body){
 if(typeof body!=='string')return null;
 // These are the complete first sentences emitted by the local refill event
 // implementation, not a generic percentage search over arbitrary messages.
 const match=body.match(/^当前周期剩余 (100|[1-9]?\d)%。个人重置时间已更新，请查看看板。(?:\r?\n|$)/)||body.match(/^Remaining this cycle (100|[1-9]?\d)(?:%\. |%。)Your personal reset time has changed\. See the dashboard\.(?:\r?\n|$)/);
 return match?percent(Number(match[1])):null;
}
function verifiedProvenance(value){
 if(value?.kind==='local-poll')return {kind:'local-poll'};
 if(value?.verified!==true||!Number.isSafeInteger(value.profileDevice)||value.profileDevice<=0||typeof value.file!=='string'||!value.file.trim()||value.file.length>1024||/[\u0000-\u001f]/.test(value.file)||typeof value.sha256!=='string'||!/^[a-f\d]{64}$/i.test(value.sha256))return null;
 // Verification is supplied explicitly by the authorized importer. A filename,
 // filesystem device or digest alone does not establish a snapshot's origin.
 return {verified:true,file:value.file,sha256:value.sha256.toLowerCase(),profileDevice:value.profileDevice};
}
function snapshotSample(value,now){
 const provenance=verifiedProvenance(value?.provenance),at=isoTime(value?.fetchedAt),end=isoTime(value?.resetsAt),remaining=percent(value?.remainingPercent),duration=value?.durationMins;
 if(!provenance||typeof value.bucketId!=='string'||!value.bucketId.trim()||value.bucketId.length>100||/[\u0000-\u001f]/.test(value.bucketId)||!['primary','secondary'].includes(value.windowKey)||at===null||end===null||at>now||at>=end||remaining===null||!Number.isFinite(duration)||duration<=0||at<end-duration*60000)return null;
 return {bucketId:value.bucketId,windowKey:value.windowKey,resetsAt:value.resetsAt,durationMins:duration,remainingPercent:remaining,fetchedAt:value.fetchedAt,provenance};
}
const sampleIdentity=value=>JSON.stringify([value.bucketId,value.windowKey,value.resetsAt]);
function mergeSamples(values,now){
 const samples=new Map();
 for(const value of values){const row=snapshotSample(value,now);if(!row)continue;const key=sampleIdentity(row),old=samples.get(key);if(!old||Date.parse(row.fetchedAt)>Date.parse(old.fetchedAt))samples.set(key,row);}
 return [...samples.values()].sort((a,b)=>Date.parse(a.fetchedAt)-Date.parse(b.fetchedAt)||sampleIdentity(a).localeCompare(sampleIdentity(b)));
}
function normalized(value,now,event=false){
 if(!value||typeof value!=='object'||(event?(value.kind!=='quota_reset'||value.sourceId!==null):value.kind!=='quota-reset'))return null;
 if(Object.hasOwn(value,'sourceId')&&value.sourceId!==null)return null;
 const match=typeof value.key==='string'&&value.key.match(/^quota-reset:(.+):(primary|secondary):(.+)$/);
 if(!match)return null;
 const [,bucketId,windowKey,resetsAt]=match;
 if(!bucketId.trim()||bucketId.length>100||/[\u0000-\u001f]/.test(bucketId))return null;
 for(const [key,expected] of Object.entries({bucketId,windowKey,resetsAt}))if(Object.hasOwn(value,key)&&value[key]!==expected)return null;
 const observedAt=event?value.at:value.observedAt,at=isoTime(observedAt),end=isoTime(resetsAt);
 if(at===null||end===null||at>now||at>=end)return null;
 const beforeAt=isoTime(value.beforeFetchedAt),previousEnd=isoTime(value.beforeResetsAt),snapshot=value.beforeBasis==='snapshot';
 const provenance=snapshot?verifiedProvenance(value.beforeProvenance):null,duration=value.beforeDurationMins;
 const beforeValid=beforeAt!==null&&beforeAt<=at&&previousEnd!==null&&previousEnd<end-60000&&(snapshot?!!provenance&&beforeAt<at&&beforeAt<previousEnd&&Number.isFinite(duration)&&duration>0&&beforeAt>=previousEnd-duration*60000:at-beforeAt<=120000);
 return {key:value.key,kind:'quota-reset',bucketId,windowKey,resetsAt,observedAt,
  beforeRemainingPercent:beforeValid?percent(value.beforeRemainingPercent):null,
  afterRemainingPercent:percent(value.afterRemainingPercent)??(event&&value.afterRemainingPercent==null?legacyRefillRemaining(value.body):null),
  beforeFetchedAt:beforeValid?value.beforeFetchedAt:null,beforeResetsAt:beforeValid?value.beforeResetsAt:null,
  beforeBasis:beforeValid&&percent(value.beforeRemainingPercent)!==null?(snapshot?'snapshot':'transition'):null,
  beforeDurationMins:beforeValid&&snapshot?duration:null,beforeProvenance:beforeValid&&snapshot?provenance:null};
}
function storedValues(value){return Array.isArray(value)?value:value&&typeof value==='object'?Object.entries(value).filter(([key,row])=>row?.key===key).map(([,row])=>row):[];}
function merge(rows,value){
 const old=rows.get(value.key);
 if(!old){rows.set(value.key,value);return;}
 // A real transition is more specific than an archived snapshot. Among snapshot
 // observations retain the latest sample before the earliest event observation.
 const first=Date.parse(old.observedAt)<=Date.parse(value.observedAt)?old:value,other=first===old?value:old;
 const candidates=[first,other].filter(row=>row.beforeRemainingPercent!==null&&Date.parse(row.beforeFetchedAt)<=Date.parse(first.observedAt));
 const before=candidates.find(row=>row.beforeBasis==='transition')||candidates.sort((a,b)=>Date.parse(b.beforeFetchedAt)-Date.parse(a.beforeFetchedAt))[0]||first;
 rows.set(value.key,{...first,beforeRemainingPercent:before.beforeRemainingPercent,beforeFetchedAt:before.beforeFetchedAt,beforeResetsAt:before.beforeResetsAt,beforeBasis:before.beforeBasis,beforeDurationMins:before.beforeDurationMins,beforeProvenance:before.beforeProvenance,afterRemainingPercent:first.afterRemainingPercent??other.afterRemainingPercent});
}
function collected(state,now){
 const rows=new Map();
 for(const value of storedValues(state.localQuotaHistory)){const row=normalized(value,now);if(row)merge(rows,row);}
 return rows;
}
const sorted=rows=>[...rows.values()].sort((a,b)=>Date.parse(b.observedAt)-Date.parse(a.observedAt)||a.key.localeCompare(b.key));
function applySamples(rows,samples,now){
 const trusted=mergeSamples(samples,now),lastRefill=new Map();
 for(let row of [...rows.values()].sort((a,b)=>Date.parse(a.observedAt)-Date.parse(b.observedAt)||a.key.localeCompare(b.key))){
  const identity=JSON.stringify([row.bucketId,row.windowKey]),at=Date.parse(row.observedAt),prior=lastRefill.get(identity),lower=prior?.at??-Infinity,previousCycleEnd=prior?.end??-Infinity;
  // A subsequently recovered personal refill can disprove an older snapshot's
  // association. Leave direct transition evidence intact.
  if(row.beforeBasis==='snapshot'&&(Date.parse(row.beforeFetchedAt)<=lower||Date.parse(row.beforeResetsAt)+60000<previousCycleEnd)){row={...row,beforeRemainingPercent:null,beforeFetchedAt:null,beforeResetsAt:null,beforeBasis:null,beforeDurationMins:null,beforeProvenance:null};rows.set(row.key,row);}
  // Never borrow a value from before another already known personal refill.
  // Public announcements are intentionally absent from these boundaries.
  const sample=trusted.filter(value=>value.bucketId===row.bucketId&&value.windowKey===row.windowKey&&Date.parse(value.fetchedAt)>lower&&Date.parse(value.fetchedAt)<at&&Date.parse(value.resetsAt)+60000>=previousCycleEnd&&Date.parse(value.resetsAt)<Date.parse(row.resetsAt)-60000).sort((a,b)=>Date.parse(b.fetchedAt)-Date.parse(a.fetchedAt))[0];
  if(sample&&row.beforeBasis!=='transition'&&(row.beforeRemainingPercent===null||Date.parse(sample.fetchedAt)>Date.parse(row.beforeFetchedAt))){
   rows.set(row.key,{...row,beforeRemainingPercent:sample.remainingPercent,beforeFetchedAt:sample.fetchedAt,beforeResetsAt:sample.resetsAt,beforeBasis:'snapshot',beforeDurationMins:sample.durationMins,beforeProvenance:sample.provenance});
  }
  lastRefill.set(identity,{at,end:Date.parse(row.resetsAt)});
 }
}
function recoverLocalQuotaHistory(state,now=Date.now()){
 const rows=collected(state,now);
 for(const event of state.events||[]){const row=normalized(event,now,true);if(row)merge(rows,row);}
 for(const [key,proof] of Object.entries(state.localResetProofs||{})){if(proof?.key!==key)continue;const row=normalized(proof,now);if(row)merge(rows,row);}
 const current=normalized(state.localReset,now);if(current)merge(rows,current);
 applySamples(rows,Array.isArray(state.localQuotaSamples)?state.localQuotaSamples:[],now);
 const next=sorted(rows),changed=JSON.stringify(state.localQuotaHistory)!==JSON.stringify(next);
 state.localQuotaHistory=next;
 return changed;
}
function rememberLocalQuotaReset(state,event,now=Date.now()){
 const row=normalized(event,now,true);if(!row)return false;
 const rows=collected(state,now);merge(rows,row);
 const next=sorted(rows),changed=JSON.stringify(state.localQuotaHistory)!==JSON.stringify(next);
 state.localQuotaHistory=next;
 return changed;
}
function backfillLocalQuotaHistory(state,samples,now=Date.now()){
 const previous=JSON.stringify(state.localQuotaHistory),previousSamples=JSON.stringify(state.localQuotaSamples);
 state.localQuotaSamples=mergeSamples([...(Array.isArray(state.localQuotaSamples)?state.localQuotaSamples:[]),...(Array.isArray(samples)?samples:[])],now);
 recoverLocalQuotaHistory(state,now);
 return previous!==JSON.stringify(state.localQuotaHistory)||previousSamples!==JSON.stringify(state.localQuotaSamples);
}
function rememberLocalQuotaSnapshot(state,quota,now=Date.now()){
 const at=isoTime(quota?.fetchedAt);
 if(quota?.source!=='local-codex'||quota.state!=='ok'||!Array.isArray(quota.limits)||at===null||at>now||now-at>120000)return false;
 const added=[];
 for(const bucket of quota.limits)for(const windowKey of ['primary','secondary']){
  const window=bucket?.[windowKey];if(!window||percent(window.usedPercent)===null)continue;
  added.push({bucketId:bucket.id,windowKey,resetsAt:window.resetsAt,durationMins:window.durationMins,remainingPercent:100-window.usedPercent,fetchedAt:quota.fetchedAt,provenance:{kind:'local-poll'}});
 }
 const valid=added.map(value=>snapshotSample(value,now)).filter(Boolean);if(!valid.length)return false;
 const before=JSON.stringify(state.localQuotaSamples),next=mergeSamples([...(Array.isArray(state.localQuotaSamples)?state.localQuotaSamples:[]),...valid],now);
 state.localQuotaSamples=next;
 const historyChanged=recoverLocalQuotaHistory(state,now);
 return before!==JSON.stringify(next)||historyChanged;
}
function localQuotaHistoryRows(state,now=Date.now()){
 return sorted(collected(state,now)).map(row=>({id:row.key,at:row.observedAt,type:'local',
  bucketId:row.bucketId,windowKey:row.windowKey,resetsAt:row.resetsAt,
  beforeRemainingPercent:row.beforeRemainingPercent,afterRemainingPercent:row.afterRemainingPercent,
  beforeFetchedAt:row.beforeFetchedAt,beforeResetsAt:row.beforeResetsAt,beforeBasis:row.beforeBasis,beforeDurationMins:row.beforeDurationMins,beforeProvenance:row.beforeProvenance,sources:[]}));
}
function historyWithLastLocalReading(state,publicRows,quotaDisplay,now=Date.now()){
 const rows=Array.isArray(publicRows)?publicRows:[];
 const selected=quotaDisplay?.source==='local-codex'&&typeof quotaDisplay.bucketId==='string'&&['primary','secondary'].includes(quotaDisplay.key)?{bucketId:quotaDisplay.bucketId,windowKey:quotaDisplay.key}:null;
 // Recover into a temporary container: projecting public history must not alter
 // stored public rows, personal observations, notifications or settings.
 const personal={localQuotaHistory:state.localQuotaHistory,localQuotaSamples:state.localQuotaSamples,events:state.events,localResetProofs:state.localResetProofs,localReset:state.localReset};
 recoverLocalQuotaHistory(personal,now);
 const refills=personal.localQuotaHistory.filter(row=>selected&&row.bucketId===selected.bucketId&&row.windowKey===selected.windowKey);
 const readings=[...(Array.isArray(state.localQuotaSamples)?state.localQuotaSamples:[]).map(value=>snapshotSample(value,now)).filter(Boolean),...refills.filter(row=>row.afterRemainingPercent!==null).map(row=>({bucketId:row.bucketId,windowKey:row.windowKey,resetsAt:row.resetsAt,remainingPercent:row.afterRemainingPercent,fetchedAt:row.observedAt,provenance:{kind:'local-refill',key:row.key}}))].filter(row=>selected&&row.bucketId===selected.bucketId&&row.windowKey===selected.windowKey);
 const observed=state.localReset?.kind==='observed-cycle'?normalized({...state.localReset,kind:'quota-reset'},now):null;
 const boundaries=[...refills,...(observed&&selected&&observed.bucketId===selected.bucketId&&observed.windowKey===selected.windowKey?[observed]:[])];
 const completed=new Set(['global','regular','reset','automatic','global_and_banked','both','combined','banked']);
 return rows.map(row=>{
  if(!row||typeof row!=='object')return row;
  const {lastLocalReading:discarded,...result}=row;
  const at=isoTime(row.at);
  if(!selected||!completed.has(row.type)||row.evidenceOnly||row.phase&&!['completion','confirmed'].includes(row.phase)||at===null||at>now)return result;
  const prior=boundaries.filter(value=>Date.parse(value.observedAt)<at).sort((a,b)=>Date.parse(b.observedAt)-Date.parse(a.observedAt)||Date.parse(b.resetsAt)-Date.parse(a.resetsAt))[0];
  const reading=readings.filter(value=>Date.parse(value.fetchedAt)<at&&Date.parse(value.resetsAt)>at&&(!prior||Date.parse(value.fetchedAt)>=Date.parse(prior.observedAt)&&Date.parse(value.resetsAt)+60000>=Date.parse(prior.resetsAt))).sort((a,b)=>Date.parse(b.fetchedAt)-Date.parse(a.fetchedAt)||Date.parse(b.resetsAt)-Date.parse(a.resetsAt))[0];
  if(reading)result.lastLocalReading={remainingPercent:reading.remainingPercent,fetchedAt:reading.fetchedAt,bucketId:reading.bucketId,windowKey:reading.windowKey,resetsAt:reading.resetsAt,basis:'last-known',source:reading.provenance.kind==='local-refill'?'refill-receipt':'quota-snapshot'};
  return result;
 });
}
module.exports={rememberLocalQuotaReset,recoverLocalQuotaHistory,localQuotaHistoryRows,backfillLocalQuotaHistory,rememberLocalQuotaSnapshot,historyWithLastLocalReading};
