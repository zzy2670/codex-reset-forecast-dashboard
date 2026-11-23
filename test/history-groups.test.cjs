'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{rows}=require('../app/ui/history-groups.js');
const now=Date.parse('2026-10-28T00:00:00Z'),opts={now};
const local=(at,extra={})=>({id:'local-'+at,type:'local',at,bucketId:'codex',windowKey:'primary',sources:[],...extra});
const official=(at,extra={})=>({id:'public-'+at,type:'global',at,sources:[{id:'feed',family:'family',url:'https://example.com/'+at,at}],...extra});
test('14:07 local receipt is the global reset with its own clock and 75% before-value',()=>{
 const l=local('2026-10-26T06:07:40Z',{beforeRemainingPercent:75,beforeFetchedAt:'2026-10-26T06:07:10Z',afterRemainingPercent:100});
 const h=[official('2026-10-26T06:08:46Z'),official('2026-10-26T06:10:00Z')],before=JSON.stringify([h,l]);
 const result=rows(h,[l],opts);assert.equal(result.length,1);assert.equal(result[0].type,'global');assert.equal(result[0].hasLocalReset,true);assert.equal(result[0].at,l.at);assert.equal(result[0].beforeRemainingPercent,75);assert.equal(result[0].members.length,3);assert.equal(result[0].sources.length,2);assert.equal(JSON.stringify([h,l]),before);
});
test('the multi-source completion interval accepts a local receipt up to six hours before and after',()=>{
 const h=[official('2026-10-26T06:00:00Z'),official('2026-10-26T07:00:00Z')];
 for(const at of ['2026-10-26T00:00:00Z','2026-10-26T13:00:00Z']){const result=rows(h,[local(at)],opts);assert.equal(result.length,1);assert.equal(result[0].at,at);assert.equal(result[0].hasLocalReset,true);}
 assert.equal(rows(h,[local('2026-10-26T13:00:00.001Z')],opts).length,2);
});
test('nearby official/local records merge across midnight',()=>{
 const result=rows([official('2026-10-25T15:59:59Z')],[local('2026-10-25T16:00:00Z')],opts);assert.equal(result.length,1);assert.equal(result[0].hasLocalReset,true);
});
test('same-day official resets outside the time range are not blindly merged',()=>{
 const result=rows([official('2026-10-26T00:00:00Z'),official('2026-10-26T12:00:00Z')],[],opts);assert.equal(result.length,2);
});
test('observations cannot establish a global reset for a local receipt',()=>{
 const result=rows([official('2026-10-26T06:00:00Z',{type:'observation'})],[local('2026-10-26T06:07:40Z')],opts);assert.equal(result.length,1);assert.equal(result[0].type,'local');assert.equal(result[0].hasLocalReset,undefined);
});
test('the first depleted local receipt in the official range is still a global reset',()=>{
 const result=rows([official('2026-10-26T06:08:46Z')],[local('2026-10-26T06:07:40Z',{beforeRemainingPercent:0})],opts);assert.equal(result[0].type,'global');assert.equal(result[0].beforeRemainingPercent,0);
});
test('a second depleted refill after global receipt is a separate personal card',()=>{
 const h=[official('2026-10-26T06:08:46Z')],first=local('2026-10-26T06:07:40Z',{beforeRemainingPercent:75});
 for(const at of ['2026-10-26T07:07:40Z','2026-10-26T12:07:40Z']){const result=rows(h,[first,local(at,{beforeRemainingPercent:0})],opts);assert.equal(result.length,2);assert.equal(result[0].type,'personal_card');assert.equal(result[0].cardInferred,true);assert.equal(result[1].type,'global');assert.equal(result[1].beforeRemainingPercent,75);}
});
test('two observations with the same receipt id are not a second card',()=>{
 const first=local('2026-10-26T06:07:40Z',{beforeRemainingPercent:75,resetsAt:'2026-11-02T06:07:40Z'}),duplicate=local('2026-10-26T06:08:00Z',{id:first.id,beforeRemainingPercent:0,resetsAt:first.resetsAt});
 const result=rows([official('2026-10-26T06:08:46Z')],[first,duplicate],opts);assert.equal(result.length,1);assert.equal(result[0].type,'global');assert.equal(result[0].beforeRemainingPercent,75);
});
test('new official window keeps the next depleted receipt global',()=>{
 const h=[official('2026-10-26T06:08:46Z'),official('2026-10-27T06:08:46Z')],l=[local('2026-10-26T06:07:40Z',{beforeRemainingPercent:75}),local('2026-10-27T06:07:40Z',{beforeRemainingPercent:0})];
 assert.ok(rows(h,l,opts).every(row=>row.type==='global'));
});
test('different quota windows each display their own arrival and pre-refill balance',()=>{
 const accountFingerprint='a'.repeat(64),s=local('2026-10-26T06:00:00Z',{accountFingerprint,windowKey:'secondary',beforeRemainingPercent:90}),p=local('2026-10-26T06:07:40Z',{accountFingerprint,beforeRemainingPercent:41,beforeBasis:'snapshot',beforeFetchedAt:'2026-10-25T09:22:42Z'});
 const result=rows([official('2026-10-26T06:08:46Z')],[s,p],opts);assert.equal(result.length,2);
 const primary=result.find(row=>row.windowKey==='primary'),secondary=result.find(row=>row.windowKey==='secondary');
 assert.equal(primary.at,p.at);assert.equal(primary.beforeRemainingPercent,41);assert.equal(primary.beforeBasis,'snapshot');assert.equal(primary.beforeFetchedAt,p.beforeFetchedAt);
 assert.equal(secondary.at,s.at);assert.equal(secondary.beforeRemainingPercent,90);assert.equal(secondary.beforeFetchedAt,undefined);assert.equal(primary.officialGroupKey,secondary.officialGroupKey);
});
test('public card issuance, repairs, commentary and limited plans remain their own records',()=>{
 const h=['banked','repair','commentary'].map(type=>official('2026-10-26T06:08:46Z',{id:type,type}));h.push(official('2026-10-26T06:10:00Z',{scope:{plans:['pro500']}}));const result=rows(h,[local('2026-10-26T06:07:40Z')],opts);assert.equal(result.length,4);assert.equal(result.filter(r=>r.type==='personal_card').length,0);assert.ok(result.some(r=>r.type==='banked'));
});
test('unknown/invalid/future evidence does not infer a personal card or global reset',()=>{
 const result=rows([official('invalid'),official('2026-10-29T00:00:00Z')],[local('2026-10-26T06:07:40Z'),local('2026-10-26T10:07:40Z',{beforeRemainingPercent:0})],opts);assert.equal(result.length,2);assert.ok(result.every(r=>r.type==='local'));
});
test('a later sample cannot become the global pre-reset balance',()=>{
 const first=local('2026-10-26T06:07:40Z'),later=local('2026-10-26T06:09:00Z',{id:first.id,beforeRemainingPercent:100,beforeFetchedAt:'2026-10-26T06:08:30Z'}),h=[official('2026-10-26T06:08:46Z')];
 assert.equal(rows(h,[first,later],opts)[0].beforeRemainingPercent,undefined);later.beforeRemainingPercent=75;later.beforeFetchedAt='2026-10-26T06:07:10Z';assert.equal(rows(h,[first,later],opts)[0].beforeRemainingPercent,75);
});
test('later exhausted refill has no arbitrary one-day card cutoff',()=>{
 const h=[official('2026-10-26T06:08:46Z')],first=local('2026-10-26T06:07:40Z',{beforeRemainingPercent:75}),later=local('2026-10-27T18:07:40Z',{beforeRemainingPercent:0});assert.equal(rows(h,[first,later],opts)[0].type,'personal_card');
});
test('a newly supplied later official completion reclassifies the later receipt as global',()=>{
 const first=local('2026-10-26T06:07:40Z',{beforeRemainingPercent:75}),later=local('2026-10-26T13:07:40Z',{beforeRemainingPercent:0}),h=[official('2026-10-26T06:08:46Z')];assert.equal(rows(h,[first,later],opts)[0].type,'personal_card');h.push(official('2026-10-26T13:08:46Z'));const result=rows(h,[first,later],opts);assert.equal(result.length,2);assert.ok(result.every(r=>r.type==='global'));
});
test('six-hour grouping uses bounded completion evidence and cannot chain two distinct events together',()=>{
 const input=['2026-10-26T00:00:00Z','2026-10-26T06:00:00Z','2026-10-26T12:00:00Z'].map(at=>official(at));
 const result=rows(input,[],opts);assert.equal(result.length,2);
 assert.deepEqual(result.map(row=>row.mergedCount).sort(),[1,2]);
 const first=result.find(row=>row.officialWindow.start==='2026-10-26T00:00:00.000Z');assert.equal(first.officialWindow.end,'2026-10-26T06:00:00.000Z');
});
test('a late linked announcement is preserved but does not expand the official receipt window',()=>{
 const anchor=official('2026-10-26T00:00:00Z',{id:'first'}),late=official('2026-10-26T12:00:00Z',{id:'later',scope:{plans:['unknown']},relatedRecordIds:['first']});
 const unrelated=local('2026-10-26T19:05:00Z',{beforeRemainingPercent:50});const result=rows([anchor,late],[unrelated],opts);
 assert.equal(result.length,2);const global=result.find(row=>row.type==='global');assert.equal(global.officialWindow.end,'2026-10-26T00:00:00.000Z');
 assert.ok(global.members.some(row=>row.id==='later'));assert.equal(result.find(row=>row.type==='local').at,unrelated.at);
});
test('a late related manual record beside a new local refill does not swallow the next event',()=>{
 const h=[
  official('2026-10-22T17:00:00Z',{id:'feed'}),
  official('2026-10-22T17:09:00Z',{id:'did:manual:2113162277688070445',relatedRecordIds:['2113162277688070445']}),
  official('2026-10-22T17:10:01Z',{id:'2113162277688070445'}),
  official('2026-10-23T04:46:19Z',{id:'2113492187770175603',scope:{plans:['unknown']},relatedRecordIds:['2113162277688070445']}),
  official('2026-10-23T17:41:26Z',{id:'did:manual:2113492187770175603',scope:{plans:['unknown']},relatedRecordIds:['2113492187770175603']}),
  official('2026-10-23T17:00:00Z',{id:'observation',type:'observation'})
 ];
 const receipt=local('2026-10-23T17:40:46Z',{identityUnverified:true,beforeRemainingPercent:41,beforeBasis:'snapshot',beforeFetchedAt:'2026-10-23T09:22:42Z'});
 const result=rows(h,[receipt],opts);assert.equal(result.length,2);
 const previous=result.find(row=>row.type==='global'),next=result.find(row=>row.type==='local');
 assert.equal(previous.officialWindow.start,'2026-10-22T17:00:00.000Z');assert.equal(previous.officialWindow.end,'2026-10-22T17:10:01.000Z');
 const late=previous.members.find(row=>row.id==='2113492187770175603');assert.equal(late.type,'observation');assert.equal(late.originalType,'global');assert.equal(late.evidenceOnly,true);assert.equal(h[3].type,'global');
 assert.equal(next.at,receipt.at);assert.equal(next.beforeRemainingPercent,41);assert.equal(next.beforeFetchedAt,receipt.beforeFetchedAt);
 assert.ok(next.members.some(row=>row.id==='observation'));assert.ok(next.members.some(row=>row.id==='did:manual:2113492187770175603'));
});
test('different account fingerprints and unverified records never share one local row or before balance',()=>{
 const publicReset=official('2026-10-26T06:08:46Z');
 const a=local('2026-10-26T06:07:40Z',{id:'receipt',resetsAt:'2026-11-02T06:07:40Z',accountFingerprint:'a'.repeat(64),beforeRemainingPercent:75});
 const b=local('2026-10-26T06:07:50Z',{id:'receipt',resetsAt:a.resetsAt,accountFingerprint:'b'.repeat(64),beforeRemainingPercent:20});
 const unknown=local('2026-10-26T06:08:00Z',{id:'receipt',resetsAt:a.resetsAt,identityUnverified:true,beforeRemainingPercent:41});
 const result=rows([publicReset],[a,b,unknown],opts);assert.equal(result.length,3);assert.equal(new Set(result.map(row=>row.officialGroupKey)).size,1);
 assert.deepEqual(result.map(row=>row.beforeRemainingPercent).sort((x,y)=>x-y),[20,41,75]);
 for(const row of result)assert.equal(row.members.filter(member=>member.type==='local').length,1);
 assert.equal(result.find(row=>row.identityUnverified).beforeRemainingPercent,41);
});
test('unverified prior account records do not infer use of a personal card',()=>{
 const a=local('2026-10-26T06:07:40Z',{identityUnverified:true}),b=local('2026-10-26T07:07:40Z',{identityUnverified:true,beforeRemainingPercent:0});
 assert.ok(rows([official('2026-10-26T06:08:46Z')],[a,b],opts).every(row=>row.type!=='personal_card'));
});
test('supporting observations preserve their own time but cannot add official votes or widen the window',()=>{
 const h=[official('2026-10-26T06:00:00Z',{id:'confirmed'}),official('2026-10-26T11:00:00Z',{id:'observation',type:'observation',sources:[{id:'observer',family:'other',at:'2026-10-26T11:00:00Z'}]})];
 const [event]=rows(h,[],opts);assert.equal(event.familyCount,1);assert.equal(event.officialWindow.end,'2026-10-26T06:00:00.000Z');
 assert.ok(event.sources.some(source=>source.id==='observer'&&source.at==='2026-10-26T11:00:00Z'&&source.evidenceOnly));
});
test('a source without its own timestamp never acquires the event timestamp',()=>{
 const at='2026-10-26T06:00:00Z',sourceAt='2026-10-26T06:00:30Z';
 const event=official(at,{sources:[{id:'no-time',family:'a'},{id:'recorded',family:'b',at:sourceAt}]});
 const [result]=rows([event],[],opts);
 assert.equal(result.at,at);assert.equal(result.sources.find(source=>source.id==='no-time').at,undefined);
 assert.equal(result.sources.find(source=>source.id==='recorded').at,sourceAt);
});
test('forecasts and evidence-only sources cannot independently create an official completion',()=>{
 const at='2026-10-26T06:00:00Z',forecast=official(at,{phase:'forecast'}),observed=official('2026-10-26T06:02:00Z',{sources:[{id:'observer',family:'observer',at,evidenceOnly:true}]});
 const only=rows([forecast,observed],[],opts);assert.equal(only.length,1);assert.equal(only[0].type,'observation');
 const receipt=local('2026-10-26T06:04:00Z');const combined=rows([forecast,observed],[receipt],opts);
 assert.equal(combined.length,1);assert.equal(combined[0].type,'local');assert.equal(combined[0].hasLocalReset,undefined);assert.equal(combined[0].familyCount,0);
});
test('official source count deduplicates shared upstream and excludes unverified sources',()=>{
 const at='2026-10-26T06:00:00Z',h=[official(at,{sources:['codex','did','next','tibo','today'].map(id=>({id,family:id,at}))})];
 assert.equal(rows(h,[],opts)[0].familyCount,3);
});
test('distant source timestamps remain evidence without widening the local matching window',()=>{
 const h=[official('2026-10-26T00:00:00Z',{sources:[{id:'feed',family:'feed',at:'2026-10-26T00:00:00Z'},{id:'second',family:'other',at:'2026-10-26T01:00:00Z'},{id:'late',family:'late',at:'2026-10-26T20:00:00Z'}]})];
 const later=local('2026-10-26T20:05:00Z'),result=rows(h,[later],opts),global=result.find(row=>row.type==='global');
 assert.equal(result.length,2);assert.equal(global.officialWindow.end,'2026-10-26T01:00:00.000Z');assert.ok(global.sources.some(source=>source.id==='late'&&source.at==='2026-10-26T20:00:00Z'));assert.equal(global.timeConflict,true);
});
test('a shared provider homepage is not an event identity and cannot merge different days',()=>{
 const one=official('2026-10-25T00:00:00Z',{id:'first',url:'https://example.com/',sources:[{id:'a',family:'a',at:'2026-10-25T00:00:00Z',url:'https://example.com/'}]});
 const two=official('2026-10-26T00:00:00Z',{id:'second',url:'https://example.com/',sources:[{id:'a',family:'a',at:'2026-10-26T00:00:00Z',url:'https://example.com/'}]});
 assert.equal(rows([one,two],[],opts).length,2);
});
test('a historical snapshot without its actual sampling time is not shown as a pre-refill reading',()=>{
 const receipt=local('2026-10-26T06:07:40Z',{beforeRemainingPercent:41,beforeBasis:'snapshot'});
 const [event]=rows([official('2026-10-26T06:08:46Z')],[receipt],opts);assert.equal(event.beforeRemainingPercent,undefined);assert.equal(event.beforeFetchedAt,undefined);
});
test('a confirmed plan upgrade wins over a generic zero-percent refill of the same verified account and cycle',()=>{
 const accountFingerprint='a'.repeat(64),resetsAt='2026-11-03T06:07:40Z';
 const first=local('2026-10-26T06:07:40Z',{accountFingerprint,beforeRemainingPercent:75});
 const generic=local('2026-10-27T06:07:40Z',{accountFingerprint,resetsAt,beforeRemainingPercent:0});
 const upgrade={...generic,id:'confirmed-upgrade',type:'plan_upgrade',beforeMultiplier:5,afterMultiplier:20};
 const result=rows([official('2026-10-26T06:08:46Z')],[first,generic,upgrade],opts);
 assert.equal(result.length,2);assert.equal(result[0].type,'plan_upgrade');assert.equal(result[0].beforeMultiplier,5);assert.equal(result[0].afterMultiplier,20);assert.ok(result.every(row=>row.type!=='personal_card'));
});
test('a plan upgrade never absorbs a refill from another or unverified account',()=>{
 const at='2026-10-26T06:07:40Z',resetsAt='2026-11-02T06:07:40Z';
 const upgrade=local(at,{type:'plan_upgrade',accountFingerprint:'a'.repeat(64),resetsAt,beforeMultiplier:5,afterMultiplier:20});
 const other=local(at,{accountFingerprint:'b'.repeat(64),resetsAt}),legacy=local(at,{identityUnverified:true,resetsAt});
 const result=rows([], [upgrade,other,legacy],opts);assert.equal(result.length,3);assert.equal(result.filter(row=>row.type==='plan_upgrade').length,1);
});
test('an explicitly unverified refill reason remains a separate local refill after zero percent',()=>{
 const fingerprint='a'.repeat(64),first=local('2026-10-26T06:07:40Z',{accountFingerprint:fingerprint,beforeRemainingPercent:75}),next=local('2026-10-26T07:07:40Z',{accountFingerprint:fingerprint,beforeRemainingPercent:0,refillReasonUnverified:true});
 const result=rows([official('2026-10-26T06:08:46Z')],[first,next],opts);assert.equal(result.length,2);
 assert.equal(result[0].type,'local');assert.equal(result[0].refillReasonUnverified,true);assert.equal(result[0].cardInferred,undefined);assert.equal(result[1].type,'global');
});
test('two distinct same-deadline receipts survive even within the same official window',()=>{
 const accountFingerprint='a'.repeat(64),resetsAt='2026-11-02T10:00:00Z';
 const first=local('2026-10-26T10:10:00Z',{accountFingerprint,resetsAt,beforeRemainingPercent:0,afterRemainingPercent:100,refillReasonUnverified:true});
 const second=local('2026-10-26T10:20:00Z',{accountFingerprint,resetsAt,beforeRemainingPercent:0,afterRemainingPercent:100,refillReasonUnverified:true});
 const result=rows([official('2026-10-26T10:00:00Z')],[first,second],opts);
 assert.equal(result.length,2);assert.equal(result[0].at,second.at);assert.equal(result[0].type,'local');assert.equal(result[0].refillReasonUnverified,true);
 assert.equal(result[1].at,first.at);assert.equal(result[1].type,'global');assert.equal(result[1].beforeRemainingPercent,0);
});
test('short-cycle receipts remain independent from official resets and cannot imply card use',()=>{
 const accountFingerprint='a'.repeat(64),at='2026-10-26T06:07:40Z';
 const short=local(at,{accountFingerprint,windowKey:'primary',durationMins:300,periodicWindow:true,beforeRemainingPercent:0});
 const long=local(at,{accountFingerprint,windowKey:'secondary',durationMins:10080,beforeRemainingPercent:41});
 const later=local('2026-10-26T06:08:40Z',{accountFingerprint,windowKey:'primary',durationMins:300,periodicWindow:true,beforeRemainingPercent:0});
 const result=rows([official(at)],[short,long,later],opts),periodic=result.filter(row=>row.periodicWindow);
 assert.equal(result.length,3);assert.equal(periodic.length,2);assert.ok(periodic.every(row=>row.type==='local'&&!row.hasLocalReset&&!row.cardInferred));
 assert.equal(result.find(row=>row.windowKey==='secondary').type,'global');
});
test('a short-cycle receipt cannot absorb a nearby unconfirmed public observation',()=>{
 const at='2026-10-26T06:07:40Z',short=local(at,{windowKey:'primary',durationMins:300,periodicWindow:true});
 const observation=official(at,{type:'observation'}),result=rows([observation],[short],opts);
 assert.equal(result.length,2);assert.ok(result.some(row=>row.type==='observation'));assert.ok(result.some(row=>row.periodicWindow&&row.type==='local'));
});
