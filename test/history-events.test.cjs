'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {reconcileHistory}=require('../app/history-events.cjs');
const source=(id,at,extra={})=>({id,name:id,family:{codex:'codex-reset',did:'didcodexreset',next:'codex-resets-feed',tibo:'codex-resets-feed',today:'unverified-feed'}[id],at,observedAt:'2026-10-21T00:00:00Z',...extra});
const row=(id,at,extra={})=>({id,at,type:'global',kindLabel:'global',scope:null,url:`https://x.com/thsottiaux/status/${id}`,text:'Reset completed',timeBasis:'announcement',sources:[source('did',at)],...extra});
const pairs=[['2110595554036400151','2110618732666257557','2026-10-15T06:13:01Z','2026-10-15T06:28:13Z'],['2111492738025959922','2111566005684289735','2026-10-17T20:41:01Z','2026-10-17T21:12:21Z']];

test('reviewed operator observations and later official completions are one historical event with all evidence',()=>{
 for(const [observedId,completeId,observedAt,completeAt] of pairs){
  const observed=row(observedId,observedAt,{text:'Reset observed by operator; awaiting Tibo confirmation.',sources:[source('codex',observedAt)]});
  const complete=row(completeId,completeAt,{text:'Done',sources:[source('did',completeAt),source('tibo',completeAt),source('next',completeAt),source('today',completeAt)]});
  const input=[observed,complete],before=JSON.stringify(input),result=reconcileHistory(input);
  assert.equal(result.length,1);assert.equal(result[0].id,completeId);assert.equal(result[0].at,completeAt);assert.equal(result[0].text,'Done');
  assert.equal(result[0].familyCount,2);assert.equal(result[0].timeConflict,false);
  assert.equal(result[0].sources.length,5);assert.equal(result[0].observations[0].id,observedId);
  assert.ok(result[0].evidence.some(e=>e.id===observedId&&e.at===observedAt));
  assert.ok(result[0].evidence.some(e=>e.id===completeId&&e.at===completeAt));
  assert.deepEqual(result[0].sources.find(s=>s.id==='codex'),{...observed.sources[0],phase:'observation',evidenceOnly:true});
  assert.equal(JSON.stringify(input),before);assert.deepEqual(reconcileHistory(result),result);
 }
});

test('an operator observation by itself cannot invent an official completed row or votes',()=>{
 for(const [id,,at] of pairs){const result=reconcileHistory([row(id,at,{sources:[source('codex',at)]})]);
  assert.equal(result.length,1);assert.equal(result[0].id,id);assert.equal(result[0].type,'observation');assert.equal(result[0].originalType,'global');assert.equal(result[0].familyCount,0);assert.equal(result[0].timeConflict,false);
 }
});

test('the reviewed retrospective reply remains readable as commentary rather than a second completion',()=>{
 const at='2026-09-08T04:41:58Z',text='You forgot the part where I reset usage twice in the middle';
 const result=reconcileHistory([row('2097183639356489952',at,{text}),row('2097174560412246215','2026-09-08T04:05:53Z')]);
 assert.equal(result.length,2);assert.equal(result[0].type,'commentary');assert.equal(result[0].text,text);assert.equal(result[0].at,at);
 assert.equal(result[0].relation.eventId,'2097174560412246215');assert.equal(result[0].familyCount,0);assert.equal(result[1].type,'global');
 assert.deepEqual(reconcileHistory(result),result);
});

test('the reviewed Pro 500 follow-up is a limited repair and preserves its original scope and text',()=>{
 const repair=row('2106239435461579088','2026-10-03T04:26:28Z',{scope:{plans:['all'],windows:['weekly']},text:'All fixed. Surprising number of Pro 500 users on here.'});
 const result=reconcileHistory([repair,row('2106131810921136451','2026-10-02T21:18:48Z')]);
 assert.equal(result.length,2);assert.equal(result[0].type,'repair');assert.deepEqual(result[0].scope,{plans:['pro500'],windows:['weekly']});assert.deepEqual(result[0].originalScope,repair.scope);
 assert.equal(result[0].text,repair.text);assert.equal(result[0].relation.eventId,'2106131810921136451');assert.equal(result[1].type,'global');
 assert.deepEqual(reconcileHistory(result),result);
});

test('two actual completions on the same day are never merged just because the times are close',()=>{
 const input=[row('100','2026-10-21T04:00:00Z'),row('101','2026-10-21T04:01:00Z')];
 const result=reconcileHistory(input);assert.deepEqual(result.map(r=>r.id),['100','101']);assert.ok(result.every(r=>r.type==='global'));
});

test('banked reset records retain their type, scope, source facts and separate event',()=>{
 const banked=row('100','2026-10-21T04:00:00Z',{type:'banked',scope:{plans:['pro']}});
 const result=reconcileHistory([banked,row('101','2026-10-21T04:01:00Z')]);
 assert.equal(result.length,2);assert.equal(result[0].type,'banked');assert.deepEqual(result[0].scope,banked.scope);assert.deepEqual(result[0].sources,banked.sources);
});

test('future explicit completionRecordId relations merge only an explicitly observed phase',()=>{
 const at='2026-10-21T04:00:00Z',doneAt='2026-10-21T04:20:00Z';
 const observed=row('100',at,{phase:'observation',completionRecordId:'101',sources:[source('codex',at)]});
 const result=reconcileHistory([observed,row('101',doneAt)]);
 assert.equal(result.length,1);assert.equal(result[0].id,'101');assert.equal(result[0].familyCount,1);assert.equal(result[0].timeConflict,false);
 const missing=reconcileHistory([observed]);assert.equal(missing.length,1);assert.equal(missing[0].type,'observation');
 const noObservedPhase=reconcileHistory([{...observed,phase:undefined,text:'A separate completed reset'},row('101',doneAt)]);assert.equal(noObservedPhase.length,2);
});

test('future relatedRecordIds relationships use exact ID or original post, not chronological proximity',()=>{
 const observed=row('100','2026-10-21T04:00:00Z',{text:'Reset observed by operator; awaiting confirmation.',sources:[source('codex','2026-10-21T04:00:00Z')]});
 const completed=row('101','2026-10-21T04:20:00Z',{relatedRecordIds:['100']});
 const result=reconcileHistory([observed,completed]);assert.equal(result.length,1);assert.equal(result[0].id,'101');
 assert.equal(reconcileHistory([observed,{...completed,relatedRecordIds:[]}]).length,2);
 const ambiguous=reconcileHistory([observed,completed,{...completed,id:'102',url:'https://x.com/thsottiaux/status/102'}]);assert.equal(ambiguous.length,3);
});

test('unrelated plan or reset-credit relationships cannot combine different reset categories',()=>{
 const observed=row('100','2026-10-21T04:00:00Z',{phase:'observation',completionRecordId:'101',scope:{plans:['pro']}});
 assert.equal(reconcileHistory([observed,row('101','2026-10-21T04:20:00Z',{scope:{plans:['plus']}})]).length,2);
 const credit={...observed,originalType:'banked'};
 assert.equal(reconcileHistory([credit,row('101','2026-10-21T04:20:00Z')]).length,2);
});

test('observation sources never inflate confirmation families or create a false time conflict',()=>{
 const at='2026-10-15T06:28:13Z',observed='2026-10-15T06:13:01Z';
 const complete=row('2110618732666257557',at,{familyCount:99,timeConflict:true,sources:[source('tibo',at),source('next',at),source('today',at)]});
 const result=reconcileHistory([complete,row('2110595554036400151',observed,{sources:[source('codex',observed)]})]);
 assert.equal(result[0].familyCount,1);assert.equal(result[0].timeConflict,false);assert.deepEqual(reconcileHistory(result),result);
});

test('real conflicting completion times remain visible and equivalent ISO representations do not conflict',()=>{
 const at='2026-10-15T06:28:13Z',completed=row('100',at,{sources:[source('did',at),source('tibo','2026-10-15T06:31:14Z')]});
 assert.equal(reconcileHistory([completed])[0].timeConflict,true);
 completed.sources[1].at='2026-10-15T06:28:13.001Z';assert.equal(reconcileHistory([completed])[0].timeConflict,true);
 completed.sources[1].at='2026-10-15T14:28:13+08:00';assert.equal(reconcileHistory([completed])[0].timeConflict,false);
});

test('existing evidence survives merging and repeated reads without evidence growth',()=>{
 const at='2026-10-15T06:28:13Z',note={kind:'upstream-note',text:'Original evidence remains'};
 const observed=row('2110595554036400151','2026-10-15T06:13:01Z',{evidence:[{kind:'operator-check',at:'2026-10-15T06:13:01Z'}],sources:[source('codex','2026-10-15T06:13:01Z')]});
 const completed=row('2110618732666257557',at,{evidence:[note]});
 let result=reconcileHistory([observed,completed]);assert.ok(result[0].evidence.some(e=>e.text===note.text));
 const first=copyJson(result);for(let i=0;i<4;i++)result=reconcileHistory(result);assert.deepEqual(result,first);
});
function copyJson(value){return JSON.parse(JSON.stringify(value));}

function cachedManualFixture(){
 const observedId='2113162277688070445',observedAt='2026-10-22T17:10:01.000Z',at='2026-10-22T17:09:00.000Z';
 const observed=row(observedId,observedAt,{text:"Reset observed by operator; awaiting Tibo's confirmation.",type:'observation',phase:'observation',originalType:'global',originalKindLabel:'global',sources:[source('codex',observedAt,{phase:'observation',evidenceOnly:true,url:`https://x.com/thsottiaux/status/${observedId}`})]});
 delete observed.kindLabel;
 const completed=row(`did:manual:${observedId}`,at,{url:null,text:'Actually completed; awaiting public announcement',timeBasis:'effective',relatedRecordIds:[observedId],sources:[source('did',at,{url:null})],observations:[copyJson(observed)],evidence:[{kind:'manual-effective-record',at},copyJson(observed)]});
 const duplicate={...copyJson(completed),id:`codex:${completed.id}`,sources:copyJson(observed.sources)};
 return {observed,completed,duplicate};
}

test('a cached source prefix cannot duplicate the same manual event or its confirmation votes',()=>{
 const {observed,completed,duplicate}=cachedManualFixture(),input=[observed,completed,duplicate],before=JSON.stringify(input);
 const output=reconcileHistory(input);assert.equal(output.length,1);assert.equal(output[0].id,completed.id);assert.equal(output[0].at,completed.at);assert.equal(output[0].type,'global');
 assert.equal(output[0].familyCount,1);assert.equal(output[0].timeConflict,false);assert.equal(output[0].sources.length,2);
 assert.equal(output[0].sources.find(s=>s.id==='codex').evidenceOnly,true);assert.equal(output[0].sources.find(s=>s.id==='codex').phase,'observation');
 assert.equal(output[0].observations.length,1);assert.equal(output[0].observations[0].id,observed.id);assert.equal(output[0].observations[0].text,observed.text);assert.equal(output[0].observations[0].at,observed.at);
 assert.ok(output[0].evidence.some(e=>e.id===duplicate.id));assert.ok(output[0].evidence.some(e=>e.kind==='manual-effective-record'));assert.equal(JSON.stringify(input),before);
 assert.deepEqual(reconcileHistory(copyJson(output)),output);
});

test('manual cache copies reconcile regardless of input order and survive real polling and disk restarts',()=>{
 const {observed,completed,duplicate}=cachedManualFixture();
 for(const input of [[duplicate,observed,completed],[completed,duplicate,observed]]){
  let output=reconcileHistory(input);
  for(let index=0;index<10;index++){
   const current=copyJson(observed);current.sources[0].observedAt=new Date(Date.parse('2026-10-23T00:00:00Z')+index*30000).toISOString();
   output=reconcileHistory([...copyJson(output),current]);
   assert.equal(output.length,1);assert.equal(output[0].id,completed.id);assert.equal(output[0].familyCount,1);assert.equal(output[0].observations.length,1);
  }
  assert.deepEqual(reconcileHistory(copyJson(output)),output);
 }
});

test('a manual cache copy with only observation sources never invents a completion without its owner',()=>{
 const {duplicate}=cachedManualFixture(),result=reconcileHistory([duplicate]);
 assert.equal(result.length,1);assert.equal(result[0].id,duplicate.id);assert.equal(result[0].type,'observation');assert.equal(result[0].familyCount,0);
});

test('manual prefix repair does not combine unrelated same-minute records or different reset categories',()=>{
 const {completed,duplicate}=cachedManualFixture();
 for(const other of [{...copyJson(completed),id:'did:manual:2113162277688070446'},{...copyJson(completed),id:'external:did:manual:2113162277688070445'},{...copyJson(completed),id:'codex:did:manual:2113162277688070445',type:'banked',sources:[source('codex',completed.at)]}]){
  const output=reconcileHistory([completed,other]);assert.equal(output.length,2);
 }
 const second=row('2113162277688070446',completed.at);assert.equal(reconcileHistory([completed,duplicate,second]).length,2);
});
