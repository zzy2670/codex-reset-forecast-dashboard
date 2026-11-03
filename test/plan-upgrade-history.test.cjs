'use strict';
const test=require('node:test'),a=require('node:assert/strict'),H=require('../app/local-quota-history.cjs'),G=require('../app/ui/history-groups.js');
const before={bucketId:'codex',windowKey:'primary',resetsAt:'2026-11-09T08:47:05.000Z',durationMins:10080,remainingPercent:0,fetchedAt:'2026-11-03T03:15:50.653Z',provenance:{kind:'local-poll'}};
const after={...before,resetsAt:'2026-11-10T03:16:38.000Z',remainingPercent:100,fetchedAt:'2026-11-03T03:18:19.477Z'};
const now=Date.parse('2026-11-03T04:00:00Z');
const upgrade=(b=before,c=after)=>({key:`plan-upgrade:${c.bucketId}:${c.windowKey}:${c.fetchedAt}`,kind:'plan-upgrade',confirmedBy:'user',beforeMultiplier:5,afterMultiplier:20,beforeSample:b,afterSample:c});
test('interrupted polling recovers short-gap same-account refill and excludes account switches',()=>{
 const {quotaChanges}=require('../app/codex-quota.cjs');const q=(s,account)=>({state:'ok',source:'local-codex',accountFingerprint:account,fetchedAt:s.fetchedAt,limits:[{id:'codex',primary:{usedPercent:100-s.remainingPercent,durationMins:s.durationMins,resetsAt:s.resetsAt}}]});
 const t=Date.parse(after.fetchedAt),old=q(before,'same'),next=q(after,'same');a.equal(quotaChanges(old,next,{},t).length,0);const events=quotaChanges(old,next,{},t,{recoverInterrupted:true});a.equal(events.length,1);a.equal(events[0].beforeBasis,'snapshot');const state={};H.rememberLocalQuotaReset(state,events[0],t);a.equal(H.localQuotaHistoryRows(state,t)[0].beforeRemainingPercent,0);a.equal(quotaChanges(old,q(after,'other'),{},t,{recoverInterrupted:true}).length,0);
});
test('user confirmed5x to20x snapshot refill survives polling/restart with148second observationgap',()=>{
 const s={localQuotaHistory:[upgrade()]};H.recoverLocalQuotaHistory(s,now);const r=H.localQuotaHistoryRows(s,now)[0];a.equal(r.type,'plan_upgrade');a.equal(r.beforeRemainingPercent,0);a.equal(r.afterRemainingPercent,100);a.equal(r.beforeFetchedAt,before.fetchedAt);a.equal(r.at,after.fetchedAt);
 const copy=JSON.parse(JSON.stringify(s));H.recoverLocalQuotaHistory(copy,now);a.deepEqual(copy,s);
 const out=G.rows([{id:'official',type:'global',at:r.at,sources:[]}],[r],{now});a.equal(out.length,2);a.equal(out.find(x=>x.type==='plan_upgrade').beforeMultiplier,5);
});
test('confirmed upgrade allows unchanged reset deadline but rejects unknown cause or mismatched window',()=>{
 const s={localQuotaHistory:[upgrade(before,{...after,resetsAt:before.resetsAt})]};H.recoverLocalQuotaHistory(s,now);a.equal(H.localQuotaHistoryRows(s,now).length,1);
 for(const bad of [{...upgrade(),confirmedBy:null},upgrade(before,{...after,bucketId:'other'})]){const x={localQuotaHistory:[bad]};H.recoverLocalQuotaHistory(x,now);a.equal(x.localQuotaHistory.length,0);}
});
test('six-hour nearby ordinary observations join local receipt without asserting global reset',()=>{
 const l={id:'local',type:'local',at:'2026-10-23T17:40:46Z',beforeRemainingPercent:41,sources:[]};const o={id:'observation',type:'observation',at:'2026-10-23T17:00:00Z',sources:[]};
 const r=G.rows([o],[l],{now});a.equal(r.length,1);a.equal(r[0].type,'local');a.equal(r[0].beforeRemainingPercent,41);a.equal(r[0].members.length,2);
});
