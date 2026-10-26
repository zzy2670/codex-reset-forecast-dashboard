'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {quotaChanges}=require('../app/codex-quota.cjs');
const {rememberLocalQuotaReset,recoverLocalQuotaHistory,localQuotaHistoryRows}=require('../app/local-quota-history.cjs');
const now=Date.parse('2026-10-26T06:00:00.000Z'),iso=value=>new Date(value).toISOString();
function quota(usedPercent,end,at=now){return {source:'local-codex',state:'ok',fetchedAt:iso(at),limits:[{id:'codex',primary:{usedPercent,durationMins:10080,resetsAt:iso(end)}}]};}
function event(patch={}){const resetsAt=iso(now+7*86400000);return {key:`quota-reset:codex:primary:${resetsAt}`,kind:'quota_reset',sourceId:null,bucketId:'codex',windowKey:'primary',resetsAt,at:iso(now),beforeRemainingPercent:12.25,afterRemainingPercent:100,beforeFetchedAt:iso(now-30000),beforeResetsAt:iso(now-1000),...patch};}
test('real fresh refill captures the preceding remaining quota rather than the refill result',()=>{
 const before=quota(87.75,now-1000,now-30000),after=quota(0,now+7*86400000);
 const e=quotaChanges(before,after,{},now)[0];
 assert.equal(e.beforeRemainingPercent,12.25);assert.equal(e.afterRemainingPercent,100);
 assert.equal(e.beforeFetchedAt,before.fetchedAt);assert.equal(e.beforeResetsAt,before.limits[0].primary.resetsAt);
 const state={};rememberLocalQuotaReset(state,e,now);const [row]=localQuotaHistoryRows(state,now);
 assert.equal(row.beforeRemainingPercent,12.25);assert.equal(row.afterRemainingPercent,100);assert.equal(row.type,'local');assert.deepEqual(row.sources,[]);
});
test('zero remaining is a real recorded value and survives JSON restart',()=>{
 const e=quotaChanges(quota(100,now-1000,now-30000),quota(0,now+7*86400000),{},now)[0],state={};
 rememberLocalQuotaReset(state,e,now);const saved=JSON.parse(JSON.stringify(state));recoverLocalQuotaHistory(saved,now+60000);
 assert.equal(localQuotaHistoryRows(saved,now+60000)[0].beforeRemainingPercent,0);
 assert.deepEqual(saved.localQuotaHistory,state.localQuotaHistory);
});
test('ordinary consumption, stale observations and changed bucket do not create a refill history event',()=>{
 const before=quota(30,now+86400000,now-30000),after=quota(40,now+86400000);
 assert.deepEqual(quotaChanges(before,after,{},now),[]);
 const fresh=quota(0,now+7*86400000);before.fetchedAt=iso(now-120001);assert.deepEqual(quotaChanges(before,fresh,{},now),[]);
 before.fetchedAt=iso(now-30000);fresh.limits[0].id='other';assert.deepEqual(quotaChanges(before,fresh,{},now),[]);
});
test('old local proofs and events migrate with unknown quota and never borrow current quota or message text',()=>{
 const e=event();delete e.beforeRemainingPercent;delete e.afterRemainingPercent;delete e.beforeFetchedAt;delete e.beforeResetsAt;e.body='当前周期剩余 97%。';
 const state={events:[e],quota:{remainingPercent:88},history:[{id:'public',type:'global',at:iso(now)}]};
 recoverLocalQuotaHistory(state,now);const [row]=localQuotaHistoryRows(state,now);
 assert.equal(row.beforeRemainingPercent,null);assert.equal(row.afterRemainingPercent,null);assert.equal(state.history.length,1);assert.equal(state.history[0].id,'public');
 const legacy={events:[{key:e.key,kind:'quota_reset',sourceId:null,at:e.at}]};recoverLocalQuotaHistory(legacy,now);assert.equal(localQuotaHistoryRows(legacy,now)[0].beforeRemainingPercent,null);
});
test('an observed current cycle is not a real refill record',()=>{
 const e=event(),proof={...e,kind:'observed-cycle',observedAt:e.at};
 const state={events:[],localReset:proof,localResetProofs:{[proof.key]:proof}};
 recoverLocalQuotaHistory(state,now);assert.deepEqual(localQuotaHistoryRows(state,now),[]);
});
test('event, durable proof and existing stored row merge by exact refill identity without losing captured values',()=>{
 const e=event(),state={events:[e]};rememberLocalQuotaReset(state,e,now);
 state.localResetProofs={[e.key]:{key:e.key,kind:'quota-reset',bucketId:e.bucketId,windowKey:e.windowKey,resetsAt:e.resetsAt,observedAt:e.at}};
 const original=JSON.stringify(state.localQuotaHistory);for(let i=0;i<10;i++)recoverLocalQuotaHistory(state,now+i*30000);
 assert.equal(JSON.stringify(state.localQuotaHistory),original);assert.equal(state.localQuotaHistory.length,1);
 rememberLocalQuotaReset(state,event({at:iso(now+1000),beforeFetchedAt:iso(now),beforeRemainingPercent:55}),now+1000);
 assert.equal(state.localQuotaHistory[0].beforeRemainingPercent,12.25);assert.equal(state.localQuotaHistory[0].observedAt,iso(now));
});
test('different buckets and windows at the same timestamp remain separate local records',()=>{
 const a=event(),b=event({bucketId:'other',key:a.key.replace(':codex:',':other:')}),c=event({windowKey:'secondary',key:a.key.replace(':primary:',':secondary:')}),state={events:[a,b,c]};
 recoverLocalQuotaHistory(state,now);assert.equal(localQuotaHistoryRows(state,now).length,3);
});
test('history persists independently of the notifications queue and proof retention limit',()=>{
 const state={};for(let i=0;i<210;i++){const end=iso(now+7*86400000+i*60000);rememberLocalQuotaReset(state,event({key:`quota-reset:codex:primary:${end}`,resetsAt:end}),now);}
 assert.equal(state.localQuotaHistory.length,210);state.events=[];state.localResetProofs={};state.localReset=null;
 const restored=JSON.parse(JSON.stringify(state));recoverLocalQuotaHistory(restored,now+60000);assert.equal(localQuotaHistoryRows(restored,now+60000).length,210);
});
test('invalid local identities, public events, future observations and invalid dates are rejected',()=>{
 const bad=[{kind:'confirmed'},{sourceId:'did'},{bucketId:'other'},{windowKey:'secondary'},{resetsAt:iso(now+86400000)},{at:iso(now+1)},{at:iso(now+7*86400000)},{key:'wrong'},{bucketId:null},{resetsAt:'2026-02-30T00:00:00Z'},{at:'2026-02-30T00:00:00Z'},{at:'2026-10-26T24:00:00Z'}];
 for(const patch of bad){const state={};assert.equal(rememberLocalQuotaReset(state,event(patch),now),false,JSON.stringify(patch));assert.deepEqual(localQuotaHistoryRows(state,now),[]);}
 const e=event(),proof={key:e.key,kind:'quota-reset',observedAt:e.at};const mismatch={localResetProofs:{other:proof}};recoverLocalQuotaHistory(mismatch,now);assert.deepEqual(localQuotaHistoryRows(mismatch,now),[]);
});
test('unknown, invalid and stale pre-refill samples stay unknown rather than becoming zero',()=>{
 for(const value of [null,undefined,'0',NaN,Infinity,-1,101]){const state={};rememberLocalQuotaReset(state,event({beforeRemainingPercent:value}),now);assert.equal(localQuotaHistoryRows(state,now)[0].beforeRemainingPercent,null);}
 for(const patch of [{beforeFetchedAt:iso(now+1)},{beforeFetchedAt:iso(now-120001)},{beforeFetchedAt:null},{beforeResetsAt:iso(now+7*86400000)}]){const state={};rememberLocalQuotaReset(state,event(patch),now);assert.equal(localQuotaHistoryRows(state,now)[0].beforeRemainingPercent,null);}
});
test('stored array and keyed-map forms recover consistently and omit unrelated private payloads',()=>{
 const state={};rememberLocalQuotaReset(state,event({body:'not retained',url:'https://private.example/',unrelated:'secret'}),now);const original=structuredClone(state.localQuotaHistory);
 state.localQuotaHistory=Object.fromEntries(original.map(row=>[row.key,{...row,unrelated:'not retained'}]));recoverLocalQuotaHistory(state,now);
 assert.deepEqual(state.localQuotaHistory,original);assert.equal('unrelated' in state.localQuotaHistory[0],false);
});
