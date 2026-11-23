'use strict';
const test=require('node:test'),a=require('node:assert/strict'),H=require('../app/local-quota-history.cjs'),G=require('../app/ui/history-groups.js');
const before={bucketId:'codex',windowKey:'primary',resetsAt:'2026-11-09T08:47:05.000Z',durationMins:10080,remainingPercent:0,fetchedAt:'2026-11-03T03:15:50.653Z',provenance:{kind:'local-poll'}};
const after={...before,resetsAt:'2026-11-10T03:16:38.000Z',remainingPercent:100,fetchedAt:'2026-11-03T03:18:19.477Z'};
const now=Date.parse('2026-11-03T04:00:00Z');
const upgrade=(b=before,c=after)=>({key:`plan-upgrade:${c.bucketId}:${c.windowKey}:${c.fetchedAt}`,kind:'plan-upgrade',confirmedBy:'user',beforeMultiplier:5,afterMultiplier:20,beforeSample:b,afterSample:c});
test('interrupted polling recovers short-gap same-account refill and excludes account switches',()=>{
 const {quotaChanges}=require('../app/codex-quota.cjs');const q=(s,account)=>({state:'ok',source:'local-codex',accountFingerprint:account,fetchedAt:s.fetchedAt,limits:[{id:'codex',primary:{usedPercent:100-s.remainingPercent,durationMins:s.durationMins,resetsAt:s.resetsAt}}]});
 const t=Date.parse(after.fetchedAt),old=q(before,'a'.repeat(64)),next=q(after,'a'.repeat(64));a.equal(quotaChanges(old,next,{},t).length,0);const events=quotaChanges(old,next,{},t,{recoverInterrupted:true});a.equal(events.length,1);a.equal(events[0].beforeBasis,'snapshot');const state={};H.rememberLocalQuotaReset(state,events[0],t);a.equal(H.localQuotaHistoryRows(state,t)[0].beforeRemainingPercent,0);a.equal(quotaChanges(old,q(after,'b'.repeat(64)),{},t,{recoverInterrupted:true}).length,0);
});
test('user confirmed5x to20x snapshot refill survives polling/restart with148second observationgap',()=>{
 const s={localQuotaHistory:[upgrade()]};H.recoverLocalQuotaHistory(s,now);const r=H.localQuotaHistoryRows(s,now)[0];a.equal(r.type,'plan_upgrade');a.equal(r.beforeRemainingPercent,0);a.equal(r.afterRemainingPercent,100);a.equal(r.beforeFetchedAt,before.fetchedAt);a.equal(r.at,after.fetchedAt);
 const copy=JSON.parse(JSON.stringify(s));H.recoverLocalQuotaHistory(copy,now);a.deepEqual(copy,s);
 const out=G.rows([{id:'official',type:'global',at:r.at,sources:[]}],[r],{now});a.equal(out.length,2);a.equal(out.find(x=>x.type==='plan_upgrade').beforeMultiplier,5);
});
test('confirmed upgrade allows unchanged reset deadline but rejects unknown cause or mismatched window',()=>{
 const s={localQuotaHistory:[upgrade(before,{...after,resetsAt:before.resetsAt})]};H.recoverLocalQuotaHistory(s,now);a.equal(H.localQuotaHistoryRows(s,now).length,1);
 for(const bad of [{...upgrade(),confirmedBy:null},upgrade(before,{...after,bucketId:'other'})]){const x={localQuotaHistory:[bad]};H.recoverLocalQuotaHistory(x,now);a.equal(H.localQuotaHistoryRows(x,now).length,0);a.equal(x.localQuotaHistory.length,1);}
});
test('six-hour nearby ordinary observations join local receipt without asserting global reset',()=>{
 const l={id:'local',type:'local',at:'2026-10-23T17:40:46Z',beforeRemainingPercent:41,sources:[]};const o={id:'observation',type:'observation',at:'2026-10-23T17:00:00Z',sources:[]};
 const r=G.rows([o],[l],{now});a.equal(r.length,1);a.equal(r[0].type,'local');a.equal(r[0].beforeRemainingPercent,41);a.equal(r[0].members.length,2);
});

test('verified same-window sharp refill with unchanged deadline is preserved without claiming a cause',()=>{
 const {quotaChanges}=require('../app/codex-quota.cjs'),owner='a'.repeat(64);
 const q=s=>({state:'ok',source:'local-codex',accountFingerprint:owner,fetchedAt:s.fetchedAt,limits:[{id:'codex',primary:{usedPercent:100-s.remainingPercent,durationMins:s.durationMins,resetsAt:s.resetsAt}}]});
 const t=Date.parse(after.fetchedAt),later={...after,resetsAt:before.resetsAt},events=quotaChanges(q(before),q(later),{},t,{recoverInterrupted:true,requireIdentity:true});
 a.equal(events.length,1);a.equal(events[0].kind,'quota_refill');a.match(events[0].body,/原因待核实/);const state={};H.rememberLocalQuotaReset(state,events[0],t);let row=H.localQuotaHistoryRows(state,t)[0];a.equal(row.beforeRemainingPercent,0);a.equal(row.afterRemainingPercent,100);a.equal(row.refillReasonUnverified,true);H.recoverLocalQuotaHistory(state,t);row=H.localQuotaHistoryRows(state,t)[0];a.equal(row.refillReasonUnverified,true);
 const other={...q(later),accountFingerprint:'b'.repeat(64)};a.equal(quotaChanges(q(before),other,{},t,{recoverInterrupted:true,requireIdentity:true}).length,0);
 const mild=q({...later,remainingPercent:15});a.equal(quotaChanges(q(before),mild,{},t,{recoverInterrupted:true,requireIdentity:true}).length,0);
 const primaryToSecondary={...q(later),limits:[{id:'codex',secondary:q(later).limits[0].primary}]};a.equal(quotaChanges(q(before),primaryToSecondary,{},t,{recoverInterrupted:true,requireIdentity:true}).length,0);
});

test('same receipt preserves verified later duration without crossing account or overwriting known duration',()=>{
 const owner='a'.repeat(64),other='b'.repeat(64),key=`quota-reset:${owner}:codex:primary:${after.resetsAt}`;
 const old={key,kind:'quota-reset',accountFingerprint:owner,bucketId:'codex',windowKey:'primary',resetsAt:after.resetsAt,observedAt:'2026-11-03T03:18:09.477Z'};
 const incoming={key,kind:'quota_reset',accountFingerprint:owner,bucketId:'codex',windowKey:'primary',resetsAt:after.resetsAt,at:after.fetchedAt,sourceId:null,durationMins:300};
 const state={localQuotaHistory:[old],events:[incoming]};H.recoverLocalQuotaHistory(state,now);const row=H.localQuotaHistoryRows(state,now,owner)[0];a.equal(row.durationMins,300);a.equal(row.periodicWindow,true);
 const conflict={localQuotaHistory:[{...old,durationMins:10080}],events:[incoming]};H.recoverLocalQuotaHistory(conflict,now);a.equal(H.localQuotaHistoryRows(conflict,now,owner)[0].durationMins,10080);a.equal(H.localQuotaHistoryRows(conflict,now,owner)[0].periodicWindow,undefined);
 const legacyKey=`quota-reset:codex:primary:${after.resetsAt}`,separate={localQuotaHistory:[{...old,key:legacyKey,accountFingerprint:owner}],events:[{...incoming,key:legacyKey,accountFingerprint:other}]};H.recoverLocalQuotaHistory(separate,now);a.equal(H.localQuotaHistoryRows(separate,now,owner)[0].periodicWindow,undefined);a.equal(H.localQuotaHistoryRows(separate,now,other)[0].periodicWindow,true);
});

test('same-account continuous refill retains pre-balance when the reset deadline moves earlier',()=>{
 const {quotaChanges}=require('../app/codex-quota.cjs'),owner='a'.repeat(64),t=Date.parse(after.fetchedAt),oldEnd='2026-11-09T08:47:05.000Z',newEnd='2026-11-07T08:47:05.000Z';
 const q=(time,used,end,id=owner)=>({state:'ok',source:'local-codex',accountFingerprint:id,fetchedAt:time,limits:[{id:'codex',primary:{usedPercent:used,durationMins:10080,resetsAt:end}}]});
 const previous=q('2026-11-03T03:17:50.000Z',75,oldEnd),current=q(after.fetchedAt,0,newEnd),events=quotaChanges(previous,current,{},t,{requireIdentity:true});
 a.equal(events.length,1);a.equal(events[0].kind,'quota_refill');a.equal(events[0].beforeRemainingPercent,25);const state={};H.rememberLocalQuotaReset(state,events[0],t);H.recoverLocalQuotaHistory(state,t);
 const row=H.localQuotaHistoryRows(state,t,owner)[0];a.equal(row.beforeRemainingPercent,25);a.equal(row.refillReasonUnverified,true);a.equal(H.localQuotaHistoryRows(state,t,'b'.repeat(64)).length,0);
 a.equal(quotaChanges(previous,q(after.fetchedAt,0,newEnd,'b'.repeat(64)),{},t,{requireIdentity:true}).length,0);
});
