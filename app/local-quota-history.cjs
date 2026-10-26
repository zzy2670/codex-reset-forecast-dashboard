'use strict';

// Personal refill observations are separate from public reset announcements.
// In particular, their timestamps never establish a relationship to a public post.
const isoTime=value=>{
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value))return null;
 const day=value.slice(0,10),dayValue=Date.parse(`${day}T00:00:00.000Z`),at=Date.parse(value);
 return Number.isFinite(dayValue)&&new Date(dayValue).toISOString().slice(0,10)===day&&Number.isFinite(at)?at:null;
};
const percent=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=100?value:null;
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
 const beforeAt=isoTime(value.beforeFetchedAt),previousEnd=isoTime(value.beforeResetsAt);
 const beforeValid=beforeAt!==null&&beforeAt<=at&&at-beforeAt<=120000&&previousEnd!==null&&previousEnd<end-60000;
 return {key:value.key,kind:'quota-reset',bucketId,windowKey,resetsAt,observedAt,
  beforeRemainingPercent:beforeValid?percent(value.beforeRemainingPercent):null,
  afterRemainingPercent:percent(value.afterRemainingPercent),
  beforeFetchedAt:beforeValid?value.beforeFetchedAt:null,beforeResetsAt:beforeValid?value.beforeResetsAt:null};
}
function storedValues(value){return Array.isArray(value)?value:value&&typeof value==='object'?Object.entries(value).filter(([key,row])=>row?.key===key).map(([,row])=>row):[];}
function merge(rows,value){
 const old=rows.get(value.key);
 if(!old){rows.set(value.key,value);return;}
 // A duplicate read cannot replace an already captured pre-refill observation.
 const first=Date.parse(old.observedAt)<=Date.parse(value.observedAt)?old:value,other=first===old?value:old;
 const before=first.beforeRemainingPercent!==null?first:other.beforeRemainingPercent!==null&&Date.parse(other.beforeFetchedAt)<=Date.parse(first.observedAt)?other:first;
 rows.set(value.key,{...first,beforeRemainingPercent:before.beforeRemainingPercent,beforeFetchedAt:before.beforeFetchedAt,beforeResetsAt:before.beforeResetsAt,afterRemainingPercent:first.afterRemainingPercent??other.afterRemainingPercent});
}
function collected(state,now){
 const rows=new Map();
 for(const value of storedValues(state.localQuotaHistory)){const row=normalized(value,now);if(row)merge(rows,row);}
 return rows;
}
const sorted=rows=>[...rows.values()].sort((a,b)=>Date.parse(b.observedAt)-Date.parse(a.observedAt)||a.key.localeCompare(b.key));
function recoverLocalQuotaHistory(state,now=Date.now()){
 const rows=collected(state,now);
 for(const event of state.events||[]){const row=normalized(event,now,true);if(row)merge(rows,row);}
 for(const [key,proof] of Object.entries(state.localResetProofs||{})){if(proof?.key!==key)continue;const row=normalized(proof,now);if(row)merge(rows,row);}
 const current=normalized(state.localReset,now);if(current)merge(rows,current);
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
function localQuotaHistoryRows(state,now=Date.now()){
 return sorted(collected(state,now)).map(row=>({id:row.key,at:row.observedAt,type:'local',
  bucketId:row.bucketId,windowKey:row.windowKey,resetsAt:row.resetsAt,
  beforeRemainingPercent:row.beforeRemainingPercent,afterRemainingPercent:row.afterRemainingPercent,
  beforeFetchedAt:row.beforeFetchedAt,beforeResetsAt:row.beforeResetsAt,sources:[]}));
}
module.exports={rememberLocalQuotaReset,recoverLocalQuotaHistory,localQuotaHistoryRows};
