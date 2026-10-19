'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {historyStart,hypotheticalPace,resetHistory}=require('../app/dashboard-model.cjs');
const {normalize}=require('../app/core.cjs');
const fixture=require('./fixtures/did.json');
const now=Date.parse('2026-10-08T00:44:00+08:00');
test('history begins at Beijing September 1 and remains fixed across weeks and years',()=>{
 for(const time of [now,Date.parse('2026-10-12T00:00:00+08:00'),Date.parse('2027-01-01T00:00:00+08:00')])assert.equal(new Date(historyStart(time)).toISOString(),'2026-08-31T16:00:00.000Z');
});

test('hypothetical pace starts at verified global reset and stops at its assumed deadline',()=>{
 const c={state:'confirmed',at:new Date(now-86400000).toISOString()};assert.equal(hypotheticalPace(c,3,now).progress,1/3);assert.equal(hypotheticalPace(c,6,now).progress,1/6);
 c.at=new Date(now-4*86400000).toISOString();assert.equal(hypotheticalPace(c,3,now).progress,1);assert.equal(hypotheticalPace(c,3,now).overdue,true);
 c.state='pending';assert.equal(hypotheticalPace(c,3,now).available,false);
});

const historyProof=(at=now-86400000)=>({at:new Date(at).toISOString(),type:'global',timeConflict:false,url:'https://x.com/thsottiaux/status/123456',sources:['didcodexreset','codex-resets-feed'].map((family,i)=>({id:String(i),family,at:new Date(at).toISOString(),url:'https://x.com/thsottiaux/status/123456'}))});
test('assumed pace retains a cross-checked historical anchor when feeds expire or latest record is pending',()=>{
 const row=historyProof();
 for(const state of ['unavailable','pending','conflict'])assert.equal(hypotheticalPace({state,at:new Date(now-3600000).toISOString()},3,now,[row]).progress,1/3);
 assert.equal(hypotheticalPace(null,4,now,[row]).progress,1/4);
 assert.equal(hypotheticalPace(null,3,now+4*86400000,[row]).progress,1);
 assert.equal(hypotheticalPace(null,3,now+4*86400000,[row]).overdue,true);
 assert.equal(require('../app/ui/pace-timing.js').hypotheticalPace,hypotheticalPace);
});
test('historical pace requires matching post evidence from independent chains',()=>{
 const row=historyProof();
 for(const invalid of [{...row,timeConflict:true},{...row,type:'banked'},{...row,scope:{plans:['pro']}},historyProof(now+1000),{...row,sources:row.sources.map(s=>({...s,family:'codex-resets-feed'}))},{...row,familyCount:9,sources:[]},{...row,sources:row.sources.map(s=>({...s,family:'unverified-feed'}))},{...row,sources:row.sources.map((s,i)=>({...s,url:'https://x.com/thsottiaux/status/'+(123456+i)}))}])assert.equal(hypotheticalPace(null,3,now,[invalid]).available,false);
});
test('latest verified historical reset is selected and newer verified current reset replaces it',()=>{
 const rows=[historyProof(now-2*86400000),historyProof()];
 assert.equal(hypotheticalPace(null,3,now,rows).progress,1/3);
 const c={state:'confirmed',at:new Date(now-3600000).toISOString()};
 assert.equal(hypotheticalPace(c,3,now,rows).progress,1/72);
 assert.equal(hypotheticalPace(c,0,now,rows).available,false);
});
test('history includes recent completed global, limited-plan and banked events, newest first',()=>{
 const did=normalize('did',fixture,new Date(now).toISOString());const rows=resetHistory([did],[],now);
 assert.equal(rows.length,10);assert.equal(rows[0].id,'2107676072871600470');assert.equal(rows.at(-1).type,'banked');
 assert.ok(rows.some(r=>r.scope?.plans?.includes('pro')));assert.ok(rows.every(r=>Date.parse(r.at)>=historyStart(now)));
 assert.equal(resetHistory([],rows,now).length,10);
 let repeated=rows;for(let i=0;i<10;i++)repeated=resetHistory([did],repeated,now);assert.equal(repeated.length,10);
 const banked=rows.find(r=>r.type==='banked');assert.equal(resetHistory([], [...rows,{...banked,id:`${banked.id}:banked:banked`}],now).length,10);
});
test('same event from shared upstream is deduplicated; future and old rows excluded',()=>{
 const base={id:'event',at:new Date(now-1000).toISOString(),url:'https://x.com/thsottiaux/status/123456',type:'global'};
 const sources=['next','tibo'].map(id=>({id,name:id,family:'shared',lastReset:base}));const r=resetHistory(sources,[],now);assert.equal(r.length,1);assert.equal(r[0].familyCount,1);assert.equal(r[0].sources.length,2);
 sources[0].lastReset={...base,at:new Date(now+1000).toISOString()};assert.equal(resetHistory([sources[0]],[],now).length,0);
});

test('history excludes pre-September and future events, includes exact Beijing boundary',()=>{
 const events=['2026-08-31T15:59:59.999Z','2026-08-31T16:00:00.000Z','2026-09-01T00:00:00Z',new Date(now+1000).toISOString()].map((at,i)=>({id:String(i),at,type:'global'}));
 const rows=resetHistory([{id:'did',historyEvents:events}],[],now);assert.deepEqual(rows.map(r=>r.id),['did:2','did:1']);
});
test('manual provider closure IDs changing across responses do not duplicate history',()=>{
 const event={id:'manual:cl_first',at:'2026-09-22T20:37:00.000Z',type:'banked'};const source={id:'did',family:'did',historyEvents:[event]};const rows=resetHistory([source],[],now);source.historyEvents=[{...event,id:'manual:cl_second'}];assert.equal(resetHistory([source],rows,now).length,1);
});
