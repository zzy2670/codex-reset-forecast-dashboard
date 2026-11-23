'use strict';
const {forecastUsage}=require('./quota-usage-forecast.cjs');

// Retain one last verified weekly reading per account. The stored identity is
// never sent to the renderer; an ordinal supplies the visible account label.
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/i.test(value)?value.toLowerCase():null;
const validTime=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const percent=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=100;
const weekly=value=>typeof value==='number'&&value===7*24*60;
const plan=value=>typeof value==='string'&&/^[a-z0-9_-]{1,40}$/i.test(value)?value:null;

function weeklyReading(quota){
 const buckets=Array.isArray(quota?.limits)?quota.limits:[];
 const codex=buckets.find(b=>String(b?.id||'').toLowerCase()==='codex')||buckets.find(b=>String(b?.name||'').toLowerCase()==='codex');
 if(!codex)return {planType:null,weekly:null};
 const windows=['primary','secondary'].map(key=>({key,value:codex[key]})).filter(({value})=>value&&weekly(value.durationMins)&&percent(value.usedPercent)&&(value.resetsAt==null||validTime(value.resetsAt)));
 windows.sort((a,b)=>Math.abs(a.value.durationMins-10080)-Math.abs(b.value.durationMins-10080));
 const chosen=windows[0]?.value;
 return {planType:plan(codex.planType),weekly:chosen?{remainingPercent:100-chosen.usedPercent,resetsAt:chosen.resetsAt??null}:null};
}
function validRow(row){
 return !!row&&!!hash(row.owner)&&!!hash(row.hint)&&Number.isSafeInteger(row.ordinal)&&row.ordinal>0&&validTime(row.fetchedAt)&&
  (row.remainingPercent===null&&row.resetsAt===null||percent(row.remainingPercent)&&(row.resetsAt===null||validTime(row.resetsAt)))&&
  (row.planType===null||!!plan(row.planType));
}
function canUse(state,owner,hint){return !!owner&&!!hint&&!state?.ambiguousAccountOwners?.[owner]&&hash(state?.accountIdentityHints?.[owner])===hint;}
function store(state,{owner,hint,aliases=[],fetchedAt,remainingPercent,resetsAt,planType},now){
 owner=hash(owner);hint=hash(hint);if(!canUse(state,owner,hint)||!validTime(fetchedAt)||Date.parse(fetchedAt)>now+60000)return false;
 if(!(remainingPercent===null&&resetsAt===null||percent(remainingPercent)&&(resetsAt===null||validTime(resetsAt))))return false;
 planType=plan(planType);
 const rows=Array.isArray(state.weeklyAccountSnapshots)?state.weeklyAccountSnapshots:[];
 // Alias hashes are supplied by the same verified protocol response. A legacy
 // alias need not already have an identity-hint entry, but the saved hint must
 // still match and any known ambiguous alias is excluded.
 const owners=new Set([owner,...aliases.map(hash).filter(alias=>alias&&!state?.ambiguousAccountOwners?.[alias])]);
 const index=rows.findIndex(row=>validRow(row)&&owners.has(hash(row.owner))&&hash(row.hint)===hint);
 const old=index>=0?rows[index]:null;
 // Partial API responses do not erase the last known weekly reading.
 if(old&&remainingPercent===null&&old.remainingPercent!==null)return false;
 if(old&&Date.parse(fetchedAt)<Date.parse(old.fetchedAt))return false;
 const ordinal=old?.ordinal||Math.max(0,...rows.filter(validRow).map(row=>row.ordinal))+1;
 const next={owner,hint,ordinal,planType,remainingPercent,resetsAt,fetchedAt};
 if(old&&JSON.stringify(old)===JSON.stringify(next))return false;
 state.weeklyAccountSnapshots=[...rows];if(index>=0)state.weeklyAccountSnapshots[index]=next;else state.weeklyAccountSnapshots.push(next);return true;
}
function rememberWeeklyAccountSnapshot(state,quota,hint,aliases=[],now=Date.now()){
 if(quota?.source!=='local-codex'||quota.state!=='ok')return false;
 const reading=weeklyReading(quota);
 return store(state,{owner:quota.accountFingerprint,hint,aliases,fetchedAt:quota.fetchedAt,planType:reading.planType,remainingPercent:reading.weekly?.remainingPercent??null,resetsAt:reading.weekly?.resetsAt??null},now);
}
function weeklyAccountRows(state,quota,{verified=false,hint=null,aliases=[],checking=false,now=Date.now()}={}){
 const current=verified?hash(quota?.accountFingerprint):null,currentHint=hash(hint);
 const owners=new Set([current,...aliases.map(hash).filter(alias=>alias&&!state?.ambiguousAccountOwners?.[alias])].filter(Boolean));
 const active=canUse(state,current,currentHint),reading=weeklyReading(quota);
 return (Array.isArray(state.weeklyAccountSnapshots)?state.weeklyAccountSnapshots:[]).filter(validRow).sort((a,b)=>a.ordinal-b.ordinal).map(row=>{
  const isCurrent=!!active&&owners.has(hash(row.owner))&&hash(row.hint)===currentHint;
  const live=isCurrent&&!checking&&!state.paused&&quota?.state==='ok'&&quota?.source==='local-codex'&&validTime(quota.fetchedAt)&&Date.parse(quota.fetchedAt)<=now+60000&&now-Date.parse(quota.fetchedAt)<=120000;
  const available=live?reading.weekly:null;
  // If a partial response omits the weekly window, keep the previous verified
  // weekly sample together with its original timestamp and plan. A first-ever
  // missing window remains explicitly unavailable.
  const useStored=live&&!available&&row.remainingPercent!==null;
  const isStale=isCurrent&&!checking&&(!live||useStored||!!available?.resetsAt&&Date.parse(available.resetsAt)<=now);
  const useLive=live&&!useStored;
  const bucket=quota?.limits?.find(b=>String(b.id).toLowerCase()==='codex')||quota?.limits?.find(b=>String(b.name).toLowerCase()==='codex');
  const key=['primary','secondary'].find(k=>bucket?.[k]?.durationMins===10080&&bucket[k].resetsAt===available?.resetsAt&&bucket[k].usedPercent===100-available?.remainingPercent);
  const usageForecast=useLive&&available&&key?forecastUsage(state,{...bucket[key],bucketId:bucket.id,key,accountFingerprint:current,fetchedAt:quota.fetchedAt},now,state.settings?.timeZone):null;
  return {...(usageForecast?{usageForecast}:{}),id:`account-${row.ordinal}`,label:`账号 ${row.ordinal}`,planType:useLive?reading.planType:row.planType,
   remainingPercent:useLive?(available?.remainingPercent??null):row.remainingPercent,resetsAt:useLive?(available?.resetsAt??null):row.resetsAt,
   fetchedAt:useLive?quota.fetchedAt:row.fetchedAt,isCurrent,isChecking:isCurrent&&checking,isStale,isLive:!!(live&&!isStale&&available)};
 });
}
module.exports={weeklyReading,rememberWeeklyAccountSnapshot,weeklyAccountRows};
