'use strict';

// Personal refill observations are separate from public reset announcements.
// In particular, their timestamps never establish a relationship to a public post.
const isoTime=value=>{
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value))return null;
 const day=value.slice(0,10),dayValue=Date.parse(`${day}T00:00:00.000Z`),at=Date.parse(value);
 return Number.isFinite(dayValue)&&new Date(dayValue).toISOString().slice(0,10)===day&&Number.isFinite(at)?at:null;
};
const percent=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=100?value:null;
const fingerprint=value=>typeof value==='string'&&/^[a-f\d]{64}$/i.test(value)?value.toLowerCase():null;
const recordIdentity=value=>JSON.stringify([fingerprint(value.accountFingerprint),value.key]);
function verifiedProvenance(value){
 if(value?.kind==='local-poll')return {kind:'local-poll'};
 if(value?.verified!==true||!Number.isSafeInteger(value.profileDevice)||value.profileDevice<=0||typeof value.file!=='string'||!value.file.trim()||value.file.length>1024||/[\u0000-\u001f]/.test(value.file)||typeof value.sha256!=='string'||!/^[a-f\d]{64}$/i.test(value.sha256))return null;
 // Verification is supplied explicitly by the authorized importer. A filename,
 // filesystem device or digest alone does not establish a snapshot's origin.
 return {verified:true,file:value.file,sha256:value.sha256.toLowerCase(),profileDevice:value.profileDevice};
}
function snapshotSample(value,now){
 const provenance=verifiedProvenance(value?.provenance),at=isoTime(value?.fetchedAt),end=isoTime(value?.resetsAt),remaining=percent(value?.remainingPercent),duration=value?.durationMins;
 if(value?.accountFingerprint!=null&&!fingerprint(value.accountFingerprint))return null;
 if(!provenance||typeof value.bucketId!=='string'||!value.bucketId.trim()||value.bucketId.length>100||/[\u0000-\u001f]/.test(value.bucketId)||!['primary','secondary'].includes(value.windowKey)||at===null||end===null||at>now||at>=end||remaining===null||!Number.isFinite(duration)||duration<=0||at<end-duration*60000)return null;
 const accountFingerprint=fingerprint(value.accountFingerprint);
 return {bucketId:value.bucketId,windowKey:value.windowKey,resetsAt:value.resetsAt,durationMins:duration,remainingPercent:remaining,fetchedAt:value.fetchedAt,provenance,...(accountFingerprint?{accountFingerprint}:{})};
}
const sampleIdentity=value=>JSON.stringify([fingerprint(value.accountFingerprint),value.bucketId,value.windowKey,value.resetsAt]);
function mergeSamples(values,now){
 const samples=new Map();
 for(const value of values){const row=snapshotSample(value,now);if(!row)continue;const key=sampleIdentity(row),old=samples.get(key);if(!old||Date.parse(row.fetchedAt)>Date.parse(old.fetchedAt))samples.set(key,row);}
 return [...samples.values()].sort((a,b)=>Date.parse(a.fetchedAt)-Date.parse(b.fetchedAt)||sampleIdentity(a).localeCompare(sampleIdentity(b)));
}
function normalized(value,now,event=false){
 if(!event&&value?.kind==='plan-upgrade'){
  const before=snapshotSample(value.beforeSample,now),after=snapshotSample(value.afterSample,now);
  if(value.accountFingerprint!=null&&!fingerprint(value.accountFingerprint))return null;
  const owner=fingerprint(value.accountFingerprint),beforeOwner=fingerprint(before?.accountFingerprint),afterOwner=fingerprint(after?.accountFingerprint);
  if(beforeOwner!==afterOwner||owner&&owner!==beforeOwner)return null;
  if(value.confirmedBy!=='user'||!before||!after||before.bucketId!==after.bucketId||before.windowKey!==after.windowKey||Date.parse(before.fetchedAt)>=Date.parse(after.fetchedAt)||after.remainingPercent<=before.remainingPercent||!Number.isFinite(value.beforeMultiplier)||!Number.isFinite(value.afterMultiplier)||value.beforeMultiplier<=0||value.afterMultiplier<=value.beforeMultiplier)return null;
  const key=`plan-upgrade:${after.bucketId}:${after.windowKey}:${after.fetchedAt}`;
  if(value.key!==key)return null;
  return {...value,key,kind:'plan-upgrade',bucketId:after.bucketId,windowKey:after.windowKey,resetsAt:after.resetsAt,observedAt:after.fetchedAt,...(owner||beforeOwner?{accountFingerprint:owner||beforeOwner}:{}),beforeRemainingPercent:before.remainingPercent,afterRemainingPercent:after.remainingPercent,beforeFetchedAt:before.fetchedAt,beforeResetsAt:before.resetsAt,beforeBasis:'snapshot',beforeDurationMins:before.durationMins,beforeProvenance:before.provenance,beforeSample:before,afterSample:after};
 }
 if(!value||typeof value!=='object'||(event?(!['quota_reset','quota_refill'].includes(value.kind)||value.sourceId!==null):!['quota-reset','quota-refill'].includes(value.kind)))return null;
 if(Object.hasOwn(value,'sourceId')&&value.sourceId!==null)return null;
 const refill=value.kind==='quota_refill'||value.kind==='quota-refill';
 const match=typeof value.key==='string'&&value.key.match(refill?/^quota-refill:([a-f\d]{64}):(.+):(primary|secondary):(.+)$/i:/^quota-reset:(?:([a-f\d]{64}):)?(.+):(primary|secondary):(.+)$/i);
 if(!match)return null;
 const [,keyOwner,bucketId,windowKey,keyTime]=match,resetsAt=refill?value.resetsAt:keyTime,owner=fingerprint(value.accountFingerprint)||fingerprint(keyOwner);
 if(refill&&keyTime!==(event?value.at:value.observedAt))return null;
 if(value.accountFingerprint!=null&&!fingerprint(value.accountFingerprint)||keyOwner&&value.accountFingerprint&&fingerprint(keyOwner)!==fingerprint(value.accountFingerprint))return null;
 if(!bucketId.trim()||bucketId.length>100||/[\u0000-\u001f]/.test(bucketId))return null;
 for(const [key,expected] of Object.entries({bucketId,windowKey,resetsAt}))if(Object.hasOwn(value,key)&&value[key]!==expected)return null;
 const observedAt=event?value.at:value.observedAt,at=isoTime(observedAt),end=isoTime(resetsAt);
 if(at===null||end===null||at>now||at>=end)return null;
 const beforeAt=isoTime(value.beforeFetchedAt),previousEnd=isoTime(value.beforeResetsAt),snapshot=value.beforeBasis==='snapshot';
 const provenance=snapshot?verifiedProvenance(value.beforeProvenance):null,duration=value.beforeDurationMins;
 const beforeValid=beforeAt!==null&&beforeAt<=at&&previousEnd!==null&&(refill?beforeAt<previousEnd:previousEnd<end-60000)&&(snapshot?!!provenance&&beforeAt<at&&beforeAt<previousEnd&&Number.isFinite(duration)&&duration>0&&beforeAt>=previousEnd-duration*60000:at-beforeAt<=120000);
 return {key:value.key,kind:refill?'quota-refill':'quota-reset',bucketId,windowKey,resetsAt,observedAt,...(Number.isFinite(value.durationMins)&&value.durationMins>0?{durationMins:value.durationMins,...(value.durationMins<=360?{periodicWindow:true}:{})}:{}),...(owner?{accountFingerprint:owner}:{}),
  beforeRemainingPercent:beforeValid?percent(value.beforeRemainingPercent):null,
  afterRemainingPercent:percent(value.afterRemainingPercent),
  beforeFetchedAt:beforeValid?value.beforeFetchedAt:null,beforeResetsAt:beforeValid?value.beforeResetsAt:null,
  beforeBasis:beforeValid&&percent(value.beforeRemainingPercent)!==null?(snapshot?'snapshot':'transition'):null,
  beforeDurationMins:beforeValid&&snapshot?duration:null,beforeProvenance:beforeValid&&snapshot?provenance:null};
}
function storedValues(value){return Array.isArray(value)?value:value&&typeof value==='object'?Object.entries(value).filter(([key,row])=>row?.key===key).map(([,row])=>row):[];}
function merge(rows,value){
 const identity=recordIdentity(value),old=rows.get(identity);
 if(!old){rows.set(identity,value);return;}
 // A real transition is more specific than an archived snapshot. Among snapshot
 // observations retain the latest sample before the earliest event observation.
 const first=Date.parse(old.observedAt)<=Date.parse(value.observedAt)?old:value,other=first===old?value:old;
 const candidates=[first,other].filter(row=>row.beforeRemainingPercent!==null&&Date.parse(row.beforeFetchedAt)<=Date.parse(first.observedAt));
 const before=candidates.find(row=>row.beforeBasis==='transition')||candidates.sort((a,b)=>Date.parse(b.beforeFetchedAt)-Date.parse(a.beforeFetchedAt))[0]||first;
 // Later observations can fill missing window metadata for this exact owner,
 // key and cycle. A known earlier duration remains authoritative on conflict.
 const durationMins=first.durationMins??other.durationMins;
 rows.set(identity,{...first,...(durationMins?{durationMins,...(durationMins<=360?{periodicWindow:true}:{})}:{}),beforeRemainingPercent:before.beforeRemainingPercent,beforeFetchedAt:before.beforeFetchedAt,beforeResetsAt:before.beforeResetsAt,beforeBasis:before.beforeBasis,beforeDurationMins:before.beforeDurationMins,beforeProvenance:before.beforeProvenance,afterRemainingPercent:first.afterRemainingPercent??other.afterRemainingPercent});
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
  const identity=JSON.stringify([fingerprint(row.accountFingerprint),row.bucketId,row.windowKey]),at=Date.parse(row.observedAt),prior=lastRefill.get(identity),lower=prior?.at??-Infinity,previousCycleEnd=prior?.end??-Infinity;
  // A subsequently recovered personal refill can disprove an older snapshot's
  // association. Leave direct transition evidence intact.
  if(row.beforeBasis==='snapshot'&&(Date.parse(row.beforeFetchedAt)<=lower||Date.parse(row.beforeResetsAt)+60000<previousCycleEnd)){row={...row,beforeRemainingPercent:null,beforeFetchedAt:null,beforeResetsAt:null,beforeBasis:null,beforeDurationMins:null,beforeProvenance:null};rows.set(recordIdentity(row),row);}
  // Never borrow a value from before another already known personal refill.
  // Public announcements are intentionally absent from these boundaries.
  const sample=trusted.filter(value=>fingerprint(value.accountFingerprint)===fingerprint(row.accountFingerprint)&&value.bucketId===row.bucketId&&value.windowKey===row.windowKey&&Date.parse(value.fetchedAt)>lower&&Date.parse(value.fetchedAt)<at&&Date.parse(value.resetsAt)+60000>=previousCycleEnd&&Date.parse(value.resetsAt)<Date.parse(row.resetsAt)-60000).sort((a,b)=>Date.parse(b.fetchedAt)-Date.parse(a.fetchedAt))[0];
  if(sample&&row.beforeBasis!=='transition'&&(row.beforeRemainingPercent===null||Date.parse(sample.fetchedAt)>Date.parse(row.beforeFetchedAt))){
   rows.set(recordIdentity(row),{...row,beforeRemainingPercent:sample.remainingPercent,beforeFetchedAt:sample.fetchedAt,beforeResetsAt:sample.resetsAt,beforeBasis:'snapshot',beforeDurationMins:sample.durationMins,beforeProvenance:sample.provenance});
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
 const unrecognized=storedValues(state.localQuotaHistory).filter(value=>!normalized(value,now));
 const next=[...sorted(rows),...unrecognized],changed=JSON.stringify(state.localQuotaHistory)!==JSON.stringify(next);
 state.localQuotaHistory=next;
 return changed;
}
function rememberLocalQuotaReset(state,event,now=Date.now()){
 const row=normalized(event,now,true);if(!row)return false;
 const rows=collected(state,now);merge(rows,row);
 const unrecognized=storedValues(state.localQuotaHistory).filter(value=>!normalized(value,now));
 const next=[...sorted(rows),...unrecognized],changed=JSON.stringify(state.localQuotaHistory)!==JSON.stringify(next);
 state.localQuotaHistory=next;
 return changed;
}
function backfillLocalQuotaHistory(state,samples,now=Date.now()){
 const previous=JSON.stringify(state.localQuotaHistory),previousSamples=JSON.stringify(state.localQuotaSamples);
 const existing=Array.isArray(state.localQuotaSamples)?state.localQuotaSamples:[],unrecognized=existing.filter(value=>!snapshotSample(value,now));
 state.localQuotaSamples=[...mergeSamples([...existing,...(Array.isArray(samples)?samples:[])],now),...unrecognized];
 recoverLocalQuotaHistory(state,now);
 return previous!==JSON.stringify(state.localQuotaHistory)||previousSamples!==JSON.stringify(state.localQuotaSamples);
}
function rememberLocalQuotaSnapshot(state,quota,now=Date.now(),options={}){
 if(options.requireIdentity===true&&!fingerprint(quota?.accountFingerprint))return false;
 const at=isoTime(quota?.fetchedAt);
 if(quota?.source!=='local-codex'||quota.state!=='ok'||!Array.isArray(quota.limits)||at===null||at>now||now-at>120000)return false;
 const added=[];
 for(const bucket of quota.limits)for(const windowKey of ['primary','secondary']){
  const window=bucket?.[windowKey];if(!window||percent(window.usedPercent)===null)continue;
  added.push({bucketId:bucket.id,windowKey,resetsAt:window.resetsAt,durationMins:window.durationMins,remainingPercent:100-window.usedPercent,fetchedAt:quota.fetchedAt,provenance:{kind:'local-poll'},...(fingerprint(quota.accountFingerprint)?{accountFingerprint:fingerprint(quota.accountFingerprint)}:{})});
 }
 const valid=added.map(value=>snapshotSample(value,now)).filter(Boolean);if(!valid.length)return false;
 const existing=Array.isArray(state.localQuotaSamples)?state.localQuotaSamples:[],unrecognized=existing.filter(value=>!snapshotSample(value,now));
 const before=JSON.stringify(state.localQuotaSamples),next=[...mergeSamples([...existing,...valid],now),...unrecognized];
 state.localQuotaSamples=next;
 const historyChanged=recoverLocalQuotaHistory(state,now);
 return before!==JSON.stringify(next)||historyChanged;
}
function localQuotaHistoryRows(state,now=Date.now(),activeFingerprint=undefined,aliases=[]){
 const active=fingerprint(activeFingerprint),accepted=new Set([active,...aliases.map(fingerprint)].filter(Boolean));
 return sorted(collected(state,now)).filter(row=>activeFingerprint===undefined||!row.accountFingerprint||accepted.has(fingerprint(row.accountFingerprint))).map(row=>({id:row.key,at:row.observedAt,type:row.kind==='plan-upgrade'?'plan_upgrade':'local',...(row.kind==='quota-refill'?{refillReasonUnverified:true}:{}),beforeMultiplier:row.beforeMultiplier,afterMultiplier:row.afterMultiplier,...(fingerprint(row.accountFingerprint)?{accountFingerprint:active&&accepted.has(fingerprint(row.accountFingerprint))?active:fingerprint(row.accountFingerprint)}:{identityUnverified:true}),
  bucketId:row.bucketId,windowKey:row.windowKey,resetsAt:row.resetsAt,...(row.durationMins?{durationMins:row.durationMins}:{}),...(row.periodicWindow?{periodicWindow:true}:{}),
  beforeRemainingPercent:row.beforeRemainingPercent,afterRemainingPercent:row.afterRemainingPercent,
  beforeFetchedAt:row.beforeFetchedAt,beforeResetsAt:row.beforeResetsAt,beforeBasis:row.beforeBasis,beforeDurationMins:row.beforeDurationMins,beforeProvenance:row.beforeProvenance,sources:[]}));
}
module.exports={rememberLocalQuotaReset,recoverLocalQuotaHistory,localQuotaHistoryRows,backfillLocalQuotaHistory,rememberLocalQuotaSnapshot};
