'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {quotaChanges}=require('../app/codex-quota.cjs');
const {rememberLocalQuotaReset,recoverLocalQuotaHistory,localQuotaHistoryRows,backfillLocalQuotaHistory,rememberLocalQuotaSnapshot}=require('../app/local-quota-history.cjs');
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
const verified={verified:true,file:'.verification/verified-quota.json',sha256:'a'.repeat(64),profileDevice:1234};
function archived(patch={}){return {bucketId:'codex',windowKey:'primary',resetsAt:iso(now+86400000),durationMins:10080,remainingPercent:41,fetchedAt:iso(now-8*3600000),provenance:verified,...patch};}
function unknownEvent(patch={}){return event({beforeRemainingPercent:null,beforeFetchedAt:null,beforeResetsAt:null,afterRemainingPercent:null,...patch});}
test('authorized eight-hour-old snapshot backfills its recorded percentage and timestamp across restart',()=>{
 const state={events:[unknownEvent()]},sample=archived();
 assert.equal(backfillLocalQuotaHistory(state,[sample],now),true);
 const [row]=localQuotaHistoryRows(state,now);assert.equal(row.beforeRemainingPercent,41);assert.equal(row.beforeFetchedAt,sample.fetchedAt);assert.equal(row.beforeBasis,'snapshot');assert.deepEqual(row.beforeProvenance,verified);
 const restored=JSON.parse(JSON.stringify(state));recoverLocalQuotaHistory(restored,now+86400000);
 assert.equal(localQuotaHistoryRows(restored,now+86400000)[0].beforeRemainingPercent,41);
 assert.equal(localQuotaHistoryRows(restored,now+86400000)[0].beforeFetchedAt,sample.fetchedAt);
});
test('snapshot zero is recorded, while invalid or unverified sources are rejected',()=>{
 const good={events:[unknownEvent()]};backfillLocalQuotaHistory(good,[archived({remainingPercent:0})],now);assert.equal(good.localQuotaHistory[0].beforeRemainingPercent,0);
 for(const patch of [{provenance:{...verified,verified:false}},{provenance:{...verified,profileDevice:null}},{provenance:{...verified,sha256:'bad'}},{remainingPercent:null},{remainingPercent:101},{fetchedAt:iso(now+1)},{fetchedAt:iso(now)},{resetsAt:iso(now-9*3600000)},{durationMins:0},{durationMins:5}]){
  const state={events:[unknownEvent()]};backfillLocalQuotaHistory(state,[archived(patch)],now);assert.equal(state.localQuotaHistory[0].beforeRemainingPercent,null,JSON.stringify(patch));
 }
});
test('only the latest eligible pre-event snapshot for the same bucket and window is selected',()=>{
 const state={events:[unknownEvent()]};const old=archived(),latest=archived({fetchedAt:iso(now-3*3600000),remainingPercent:29});
 backfillLocalQuotaHistory(state,[latest,old,archived({bucketId:'other',fetchedAt:iso(now-1000),remainingPercent:3}),archived({windowKey:'secondary',fetchedAt:iso(now-1000),remainingPercent:4}),archived({fetchedAt:iso(now+1),remainingPercent:5}),archived({resetsAt:event().resetsAt,fetchedAt:iso(now-1000),remainingPercent:6})],now);
 assert.equal(state.localQuotaHistory[0].beforeRemainingPercent,29);assert.equal(state.localQuotaHistory[0].beforeFetchedAt,latest.fetchedAt);
});
test('a snapshot cannot be borrowed across an intervening known personal refill',()=>{
 const oldEnd=iso(now+86400000),prior=unknownEvent({key:`quota-reset:codex:primary:${oldEnd}`,resetsAt:oldEnd,at:iso(now-4*3600000)}),next=unknownEvent(),state={events:[prior,next]};
 backfillLocalQuotaHistory(state,[archived({resetsAt:iso(now+3600000)})],now);
 const rows=localQuotaHistoryRows(state,now);assert.equal(rows.find(r=>r.id===next.key).beforeRemainingPercent,null);assert.equal(rows.find(r=>r.id===prior.key).beforeRemainingPercent,41);
 backfillLocalQuotaHistory(state,[archived({fetchedAt:prior.at,remainingPercent:22})],now);assert.equal(localQuotaHistoryRows(state,now).find(r=>r.id===next.key).beforeRemainingPercent,null);
});
test('newer snapshots upgrade older snapshot values but never replace a direct transition',()=>{
 const state={events:[unknownEvent()]};backfillLocalQuotaHistory(state,[archived()],now);backfillLocalQuotaHistory(state,[archived({fetchedAt:iso(now-3600000),remainingPercent:30})],now);assert.equal(state.localQuotaHistory[0].beforeRemainingPercent,30);
 rememberLocalQuotaReset(state,event({beforeRemainingPercent:12}),now);assert.equal(state.localQuotaHistory[0].beforeRemainingPercent,12);assert.equal(state.localQuotaHistory[0].beforeBasis,'transition');
 backfillLocalQuotaHistory(state,[archived({fetchedAt:iso(now-1000),remainingPercent:99})],now);assert.equal(state.localQuotaHistory[0].beforeRemainingPercent,12);
 recoverLocalQuotaHistory(state,now);assert.equal(state.localQuotaHistory[0].beforeRemainingPercent,12);
});
test('recovering an intervening historical refill clears a snapshot that now crosses that refill',()=>{
 const state={events:[unknownEvent()]};backfillLocalQuotaHistory(state,[archived()],now);assert.equal(state.localQuotaHistory[0].beforeRemainingPercent,41);
 const end=iso(now+3600000);state.events.push(unknownEvent({key:`quota-reset:codex:primary:${end}`,resetsAt:end,at:iso(now-4*3600000)}));recoverLocalQuotaHistory(state,now);
 assert.equal(localQuotaHistoryRows(state,now).find(r=>r.at===iso(now)).beforeRemainingPercent,null);
});
test('stored snapshot metadata requires a verified source and valid sample window on every recovery',()=>{
 const state={events:[unknownEvent()]};backfillLocalQuotaHistory(state,[archived()],now);const saved=structuredClone(state);
 saved.localQuotaSamples=[];saved.localQuotaHistory[0].beforeProvenance.verified=false;recoverLocalQuotaHistory(saved,now);assert.equal(saved.localQuotaHistory[0].beforeRemainingPercent,null);
 const wrong=structuredClone(state);wrong.localQuotaSamples=[];wrong.localQuotaHistory[0].beforeFetchedAt=wrong.localQuotaHistory[0].resetsAt;recoverLocalQuotaHistory(wrong,now);assert.equal(wrong.localQuotaHistory[0].beforeRemainingPercent,null);
});
test('successful local polls retain the last sample per cycle, including through restart and an offline refill',()=>{
 const state={},before=quota(59,now+86400000,now-60000);
 assert.equal(rememberLocalQuotaSnapshot(state,before,now),true);assert.equal(state.localQuotaSamples.length,1);
 rememberLocalQuotaSnapshot(state,quota(60,now+86400000,now-30000),now);assert.equal(state.localQuotaSamples.length,1);assert.equal(state.localQuotaSamples[0].remainingPercent,40);
 const restarted=JSON.parse(JSON.stringify(state));restarted.events=[unknownEvent()];recoverLocalQuotaHistory(restarted,now);
 assert.equal(restarted.localQuotaHistory[0].beforeRemainingPercent,40);assert.equal(restarted.localQuotaHistory[0].beforeBasis,'snapshot');assert.deepEqual(restarted.localQuotaHistory[0].beforeProvenance,{kind:'local-poll'});
 rememberLocalQuotaSnapshot(restarted,quota(0,now+7*86400000,now),now);assert.equal(restarted.localQuotaSamples.length,2);assert.equal(restarted.localQuotaHistory[0].beforeRemainingPercent,40);
});
test('invalid, expired, stale and future API samples never replace a saved local reading',()=>{
 for(const transform of [q=>({...q,state:'error'}),q=>({...q,source:'other'}),q=>({...q,fetchedAt:iso(now-120001)}),q=>({...q,fetchedAt:iso(now+1)}),q=>({...q,limits:[{id:'codex',primary:{usedPercent:5,durationMins:10080,resetsAt:iso(now-60000)}}]})]){
  const state={};rememberLocalQuotaSnapshot(state,quota(59,now+86400000,now-30000),now);rememberLocalQuotaSnapshot(state,transform(quota(0,now+86400000,now)),now);assert.equal(state.localQuotaSamples.length,1);assert.equal(state.localQuotaSamples[0].remainingPercent,41);
 }
});
test('a sample after a prior refill observation still cannot belong to a cycle older than that refill',()=>{
 const priorEnd=iso(now+2*86400000),prior=unknownEvent({key:`quota-reset:codex:primary:${priorEnd}`,resetsAt:priorEnd,at:iso(now-4*3600000)}),next=unknownEvent();
 const wrong=archived({fetchedAt:iso(now-3600000),resetsAt:iso(now+86400000)}),state={events:[prior,next]};
 backfillLocalQuotaHistory(state,[wrong],now);
 assert.equal(localQuotaHistoryRows(state,now).find(r=>r.id===next.key).beforeRemainingPercent,null);
 const valid=archived({fetchedAt:iso(now-2*3600000),resetsAt:priorEnd,remainingPercent:37});
 backfillLocalQuotaHistory(state,[valid],now);
 const result=localQuotaHistoryRows(state,now).find(r=>r.id===next.key);assert.equal(result.beforeRemainingPercent,37);assert.equal(result.beforeResetsAt,priorEnd);
});
test('restoring a prior refill clears a saved snapshot whose cycle end contradicts that refill',()=>{
 const next=unknownEvent(),state={events:[next]},sample=archived({fetchedAt:iso(now-3600000)});
 backfillLocalQuotaHistory(state,[sample],now);assert.equal(state.localQuotaHistory[0].beforeRemainingPercent,41);
 const priorEnd=iso(now+2*86400000);state.events.push(unknownEvent({key:`quota-reset:codex:primary:${priorEnd}`,resetsAt:priorEnd,at:iso(now-4*3600000)}));
 recoverLocalQuotaHistory(state,now);const row=localQuotaHistoryRows(state,now).find(r=>r.id===next.key);assert.equal(row.beforeRemainingPercent,null);assert.equal(row.beforeBasis,null);assert.equal(row.beforeProvenance,null);
});
test('cycle-end association allows only the documented one-minute tolerance',()=>{
 const priorEnd=now+2*86400000,prior=unknownEvent({key:`quota-reset:codex:primary:${iso(priorEnd)}`,resetsAt:iso(priorEnd),at:iso(now-4*3600000)}),next=unknownEvent();
 for(const [offset,expected] of [[-60000,41],[-60001,null],[0,41],[60000,41]]){
  const state={events:[prior,next]};backfillLocalQuotaHistory(state,[archived({fetchedAt:iso(now-3600000),resetsAt:iso(priorEnd+offset)})],now);assert.equal(localQuotaHistoryRows(state,now).find(r=>r.id===next.key).beforeRemainingPercent,expected,String(offset));
 }
});
