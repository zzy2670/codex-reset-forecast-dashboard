'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {resetHistory}=require('../app/dashboard-model.cjs');
const now=Date.parse('2026-10-21T12:00:00+08:00'),stamp='2026-10-21T00:00:00.000Z';
const item=(id,at,extra={})=>({id,at,type:'global',url:`https://x.com/thsottiaux/status/${id}`,timeBasis:'announcement',text:'Done',...extra});
const feed=(id,event)=>({id,name:id,family:{did:'didcodexreset',tibo:'codex-resets-feed',next:'codex-resets-feed',today:'unverified-feed',codex:'codex-reset'}[id],fetchedAt:stamp,lastReset:event});
const pairs=[['2110595554036400151','2110618732666257557','2026-10-15T06:13:01.000Z','2026-10-15T06:28:13.000Z'],['2111492738025959922','2111566005684289735','2026-10-17T20:41:01.000Z','2026-10-17T21:12:21.000Z']];
const roundTrip=value=>JSON.parse(JSON.stringify(value));

test('real reviewed IDs keep observation text, URL and time after polling again and a disk round trip',()=>{
 for(const [observedId,completeId,observedAt,completeAt] of pairs){
  const observed=item(observedId,observedAt,{text:'Reset observed by operator; awaiting Tibo confirmation.'}),complete=item(completeId,completeAt);
  const feeds=[feed('codex',observed),feed('did',complete),feed('tibo',complete),feed('next',complete),feed('today',complete)];
  const first=resetHistory(feeds,[],now),second=resetHistory(feeds,roundTrip(first),now);
  assert.equal(first.length,1);assert.equal(second.length,1);assert.equal(second[0].id,completeId);assert.equal(second[0].at,completeAt);
  assert.equal(second[0].familyCount,2);assert.equal(second[0].timeConflict,false);
  const proof=second[0].observations.find(r=>r.id===observedId);
  assert.equal(proof.text,observed.text);assert.equal(proof.url,observed.url);assert.equal(proof.at,observed.at);
  const source=second[0].sources.find(s=>s.id==='codex');assert.equal(source.at,observedAt);assert.equal(source.url,observed.url);assert.equal(source.phase,'observation');assert.equal(source.evidenceOnly,true);
  assert.equal(second[0].sources.length,5);assert.deepEqual(second,first);
  assert.deepEqual(resetHistory([],roundTrip(second),now),first);
 }
});

test('stored canonical evidence remains stable when only official completion data refreshes',()=>{
 const [observedId,completeId,observedAt,completeAt]=pairs[0];
 const feeds=[feed('codex',item(observedId,observedAt,{text:'Reset observed by operator; awaiting Tibo confirmation.'})),feed('did',item(completeId,completeAt)),feed('tibo',item(completeId,completeAt))];
 const first=resetHistory(feeds,[],now);
 let current=roundTrip(first);
 for(let i=0;i<3;i++)current=resetHistory(feeds.slice(1),roundTrip(current),now);
 assert.deepEqual(current,first);assert.equal(current[0].observations.length,1);assert.equal(current[0].evidence.length,2);
});

test('the same provider can retain an observation source without replacing its completion source',()=>{
 const [observedId,completeId,observedAt,completeAt]=pairs[0];
 const feedA=feed('codex',item(completeId,completeAt));feedA.historyEvents=[item(observedId,observedAt,{text:'Reset observed by operator; awaiting Tibo confirmation.'})];
 const first=resetHistory([feedA,feed('did',item(completeId,completeAt))],[],now);
 assert.equal(first.length,1);assert.equal(first[0].sources.filter(s=>s.id==='codex').length,2);assert.equal(first[0].familyCount,2);assert.equal(first[0].timeConflict,false);
 const nextFeed=feed('codex',item(completeId,completeAt));
 const second=resetHistory([nextFeed],roundTrip(first),now);
 assert.equal(second[0].sources.filter(s=>s.id==='codex').length,2);assert.equal(second[0].familyCount,2);assert.equal(second[0].timeConflict,false);
 assert.equal(second[0].sources.find(s=>s.id==='codex'&&s.phase==='observation').at,observedAt);
});

test('standalone observation survives restart without becoming a completed event',()=>{
 const [observedId,,observedAt]=pairs[0],event=item(observedId,observedAt,{text:'Reset observed by operator; awaiting Tibo confirmation.'});
 const first=resetHistory([feed('codex',event)],[],now),second=resetHistory([],roundTrip(first),now);
 assert.equal(first.length,1);assert.equal(first[0].type,'observation');assert.equal(second[0].type,'observation');assert.equal(second[0].familyCount,0);assert.equal(second[0].sources[0].evidenceOnly,true);
 assert.deepEqual(second,first);
});

test('commentary and repair relations preserve original classification across current updates and restart',()=>{
 const commentary=item('2097183639356489952','2026-09-08T04:41:58.000Z',{text:'You forgot the part where I reset usage twice in the middle'});
 const repair=item('2106239435461579088','2026-10-03T04:26:28.000Z',{scope:{plans:['all']},text:'All fixed. Surprising number of Pro 500 users on here.'});
 const fixture={...feed('did',null),historyEvents:[commentary,repair]};
 const first=resetHistory([fixture],[],now),second=resetHistory([fixture],roundTrip(first),now),third=resetHistory([],roundTrip(second),now);
 assert.deepEqual(second,first);assert.deepEqual(third,first);
 assert.equal(third[0].type,'repair');assert.equal(third[0].originalType,'global');assert.deepEqual(third[0].originalScope,repair.scope);assert.deepEqual(third[0].scope.plans,['pro500']);
 assert.equal(third[1].type,'commentary');assert.equal(third[1].relation.eventId,'2097174560412246215');assert.equal(third[1].text,commentary.text);
});

test('generic linked observation metadata survives the full history merger',()=>{
 const observed=item('900','2026-10-20T04:00:00.000Z',{phase:'observation',completionRecordId:'901',text:'Observed reset'});
 const complete=item('901','2026-10-20T04:20:00.000Z',{relatedRecordIds:['900'],evidence:[{kind:'upstream-confirmation',value:'Retain this evidence'}]});
 const sources=[feed('codex',observed),feed('did',complete)],first=resetHistory(sources,[],now),second=resetHistory(sources,roundTrip(first),now);
 assert.equal(first.length,1);assert.deepEqual(second,first);assert.ok(second[0].evidence.some(e=>e.kind==='upstream-confirmation'));assert.equal(second[0].observations[0].completionRecordId,'901');assert.deepEqual(second[0].relatedRecordIds,['900']);
});

test('separate genuine same-day completions and reset cards remain separate across two rounds',()=>{
 const source={...feed('did',null),historyEvents:[item('900','2026-10-20T04:00:00.000Z'),item('901','2026-10-20T04:01:00.000Z'),item('902','2026-10-20T04:02:00.000Z',{type:'banked'})]};
 const first=resetHistory([source],[],now),second=resetHistory([source],roundTrip(first),now);
 assert.equal(first.length,3);assert.deepEqual(second,first);assert.deepEqual(second.map(r=>r.type),['banked','global','global']);
});

test('ten real polling timestamps update collection metadata without creating new evidence versions',()=>{
 const [observedId,completeId,observedAt,completeAt]=pairs[0];
 const events=[item(observedId,observedAt,{text:'Reset observed by operator; awaiting Tibo confirmation.'}),item(completeId,completeAt)];
 let rows=[];
 for(let i=0;i<10;i++){
  const fetchedAt=new Date(Date.parse(stamp)+i*30000).toISOString();
  const sources=[{...feed('codex',events[0]),fetchedAt},{...feed('did',events[1]),fetchedAt},{...feed('tibo',events[1]),fetchedAt}];
  rows=resetHistory(sources,roundTrip(rows),now);
  assert.equal(rows.length,1);assert.equal(rows[0].observations.length,1);assert.equal(rows[0].evidence.length,2);
  assert.equal(rows[0].observations[0].sources[0].observedAt,fetchedAt);
  assert.equal(rows[0].observations[0].text,events[0].text);assert.equal(rows[0].observations[0].at,observedAt);
 }
 const last=roundTrip(rows),bytes=JSON.stringify(rows).length;
 rows=resetHistory([],roundTrip(rows),now);assert.deepEqual(rows,last);assert.equal(JSON.stringify(rows).length,bytes);
 assert.equal(rows[0].familyCount,2);assert.equal(rows[0].timeConflict,false);
});

test('observation content and event-time corrections retain distinct evidence versions',()=>{
 const [observedId,completeId,observedAt,completeAt]=pairs[0];
 const observed=item(observedId,observedAt,{text:'Reset observed by operator; awaiting Tibo confirmation.'});
 const complete=feed('did',item(completeId,completeAt));
 const first=resetHistory([feed('codex',observed),complete],[],now);
 const correction={...observed,at:'2026-10-15T06:14:01.000Z',text:'Reset observed by operator; awaiting Tibo confirmation. Updated observation time.'};
 const second=resetHistory([{...feed('codex',correction),fetchedAt:'2026-10-21T00:01:00.000Z'},complete],roundTrip(first),now);
 assert.equal(second[0].observations.length,2);assert.equal(second[0].evidence.length,3);
 assert.ok(second[0].observations.some(row=>row.at===observed.at&&row.text===observed.text));
 assert.ok(second[0].observations.some(row=>row.at===correction.at&&row.text===correction.text));
});
