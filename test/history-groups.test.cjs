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
test('the multi-source completion interval accepts a local receipt up to three hours before and after',()=>{
 const h=[official('2026-10-26T06:00:00Z'),official('2026-10-26T07:00:00Z')];
 for(const at of ['2026-10-26T03:00:00Z','2026-10-26T10:00:00Z']){const result=rows(h,[local(at)],opts);assert.equal(result.length,1);assert.equal(result[0].at,at);assert.equal(result[0].hasLocalReset,true);}
 assert.equal(rows(h,[local('2026-10-26T10:00:00.001Z')],opts).length,2);
});
test('nearby official/local records merge across midnight',()=>{
 const result=rows([official('2026-10-25T15:59:59Z')],[local('2026-10-25T16:00:00Z')],opts);assert.equal(result.length,1);assert.equal(result[0].hasLocalReset,true);
});
test('same-day official resets outside the time range are not blindly merged',()=>{
 const result=rows([official('2026-10-26T00:00:00Z'),official('2026-10-26T12:00:00Z')],[],opts);assert.equal(result.length,2);
});
test('observations cannot establish a global reset for a local receipt',()=>{
 const result=rows([official('2026-10-26T06:00:00Z',{type:'observation'})],[local('2026-10-26T06:07:40Z')],opts);assert.equal(result.length,2);assert.equal(result.find(r=>r.type==='local').hasLocalReset,undefined);
});
test('the first depleted local receipt in the official range is still a global reset',()=>{
 const result=rows([official('2026-10-26T06:08:46Z')],[local('2026-10-26T06:07:40Z',{beforeRemainingPercent:0})],opts);assert.equal(result[0].type,'global');assert.equal(result[0].beforeRemainingPercent,0);
});
test('a second depleted refill after global receipt is a separate personal card',()=>{
 const h=[official('2026-10-26T06:08:46Z')],first=local('2026-10-26T06:07:40Z',{beforeRemainingPercent:75});
 for(const at of ['2026-10-26T07:07:40Z','2026-10-26T12:07:40Z']){const result=rows(h,[first,local(at,{beforeRemainingPercent:0})],opts);assert.equal(result.length,2);assert.equal(result[0].type,'personal_card');assert.equal(result[1].type,'global');assert.equal(result[1].beforeRemainingPercent,75);}
});
test('a duplicate receipt for the same quota cycle is not a card',()=>{
 const first=local('2026-10-26T06:07:40Z',{beforeRemainingPercent:75,resetsAt:'2026-11-02T06:07:40Z'}),duplicate=local('2026-10-26T06:08:00Z',{beforeRemainingPercent:0,resetsAt:first.resetsAt});
 const result=rows([official('2026-10-26T06:08:46Z')],[first,duplicate],opts);assert.equal(result.length,1);assert.equal(result[0].type,'global');assert.equal(result[0].beforeRemainingPercent,75);
});
test('new official window keeps the next depleted receipt global',()=>{
 const h=[official('2026-10-26T06:08:46Z'),official('2026-10-27T06:08:46Z')],l=[local('2026-10-26T06:07:40Z',{beforeRemainingPercent:75}),local('2026-10-27T06:07:40Z',{beforeRemainingPercent:0})];
 assert.ok(rows(h,l,opts).every(row=>row.type==='global'));
});
test('main window and genuine earlier snapshot retain 41% and sample time',()=>{
 const s=local('2026-10-26T06:00:00Z',{windowKey:'secondary',beforeRemainingPercent:90}),p=local('2026-10-26T06:07:40Z',{beforeRemainingPercent:41,beforeBasis:'snapshot',beforeFetchedAt:'2026-10-25T09:22:42Z'});
 const result=rows([official('2026-10-26T06:08:46Z')],[s,p],opts);assert.equal(result[0].at,p.at);assert.equal(result[0].beforeRemainingPercent,41);assert.equal(result[0].beforeBasis,'snapshot');assert.equal(result[0].beforeFetchedAt,p.beforeFetchedAt);
});
test('public card issuance, repairs, commentary and limited plans remain their own records',()=>{
 const h=['banked','repair','commentary'].map(type=>official('2026-10-26T06:08:46Z',{id:type,type}));h.push(official('2026-10-26T06:10:00Z',{scope:{plans:['pro500']}}));const result=rows(h,[local('2026-10-26T06:07:40Z')],opts);assert.equal(result.length,5);assert.equal(result.filter(r=>r.type==='personal_card').length,0);
});
test('unknown/invalid/future evidence does not infer a personal card or global reset',()=>{
 const result=rows([official('invalid'),official('2026-10-29T00:00:00Z')],[local('2026-10-26T06:07:40Z'),local('2026-10-26T10:07:40Z',{beforeRemainingPercent:0})],opts);assert.equal(result.length,2);assert.ok(result.every(r=>r.type==='local'));
});
test('a later sample cannot become the global pre-reset balance',()=>{
 const first=local('2026-10-26T06:07:40Z'),later=local('2026-10-26T06:09:00Z',{beforeRemainingPercent:100,beforeFetchedAt:'2026-10-26T06:08:30Z'}),h=[official('2026-10-26T06:08:46Z')];
 assert.equal(rows(h,[first,later],opts)[0].beforeRemainingPercent,undefined);later.beforeRemainingPercent=75;later.beforeFetchedAt='2026-10-26T06:07:10Z';assert.equal(rows(h,[first,later],opts)[0].beforeRemainingPercent,75);
});
test('later exhausted refill has no arbitrary one-day card cutoff',()=>{
 const h=[official('2026-10-26T06:08:46Z')],first=local('2026-10-26T06:07:40Z',{beforeRemainingPercent:75}),later=local('2026-10-27T18:07:40Z',{beforeRemainingPercent:0});assert.equal(rows(h,[first,later],opts)[0].type,'personal_card');
});
test('a newly supplied later official completion reclassifies the later receipt as global',()=>{
 const first=local('2026-10-26T06:07:40Z',{beforeRemainingPercent:75}),later=local('2026-10-26T12:07:40Z',{beforeRemainingPercent:0}),h=[official('2026-10-26T06:08:46Z')];assert.equal(rows(h,[first,later],opts)[0].type,'personal_card');h.push(official('2026-10-26T12:08:46Z'));const result=rows(h,[first,later],opts);assert.equal(result.length,2);assert.ok(result.every(r=>r.type==='global'));
});
