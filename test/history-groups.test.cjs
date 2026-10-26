'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{rows}=require('../app/ui/history-groups.js');
const now=Date.parse('2026-10-27T00:00:00Z'),opts={now,zone:'Asia/Shanghai'};
const local=(at,extra={})=>({id:'local-'+at,type:'local',at,bucketId:'codex',windowKey:'primary',sources:[],...extra});
const official=(at,extra={})=>({id:'public-'+at,type:'global',at,sources:[{id:'feed',family:'family',url:'https://example.com/'+at,at}],...extra});
test('nearby completion records collapse into the local clock and preserve every source',()=>{
 const l=local('2026-10-26T06:07:40Z',{beforeRemainingPercent:75,beforeFetchedAt:'2026-10-26T06:07:10Z',afterRemainingPercent:100});
 const h=[official('2026-10-26T06:08:46Z'),official('2026-10-26T06:10:00Z')],before=JSON.stringify([h,l]);
 const result=rows(h,[l],opts);assert.equal(result.length,1);assert.equal(result[0].at,l.at);assert.equal(result[0].beforeRemainingPercent,75);assert.equal(result[0].members.length,3);assert.equal(result[0].sources.length,2);assert.equal(JSON.stringify([h,l]),before);
});
test('multiple same-day local samples are one refill and retain the earliest known before-value',()=>{
 const a=local('2026-10-26T06:07:40Z',{beforeRemainingPercent:0,beforeFetchedAt:'2026-10-26T06:07:10Z'}),b=local('2026-10-26T06:08:00Z',{beforeRemainingPercent:100,afterRemainingPercent:99});
 const result=rows([], [b,a],opts);assert.equal(result.length,1);assert.equal(result[0].at,a.at);assert.equal(result[0].beforeRemainingPercent,0);assert.equal(result[0].afterRemainingPercent,99);
});
test('main local window sets the clock even when a secondary report arrives first',()=>{
 const s=local('2026-10-26T06:00:00Z',{windowKey:'secondary',beforeRemainingPercent:90}),p=local('2026-10-26T06:07:40Z',{beforeRemainingPercent:41,beforeBasis:'snapshot',beforeFetchedAt:'2026-10-25T09:22:42Z'});
 const result=rows([], [s,p],opts);assert.equal(result[0].at,p.at);assert.equal(result[0].beforeRemainingPercent,41);assert.equal(result[0].beforeBasis,'snapshot');assert.equal(result[0].beforeFetchedAt,p.beforeFetchedAt);
});
test('different calendar days never merge, including adjacent midnight records',()=>{
 const result=rows([official('2026-10-25T15:59:59Z')],[local('2026-10-25T16:00:00Z')],opts);assert.equal(result.length,2);
});
test('public completions and observations merge by day even without a local receipt',()=>{
 const result=rows([official('2026-10-26T06:08:46Z'),official('2026-10-26T06:10:00Z'),official('2026-10-26T06:01:00Z',{type:'observation'})],[],opts);assert.equal(result.length,1);assert.equal(result[0].at,'2026-10-26T06:08:46Z');assert.equal(result[0].members.length,3);
});
test('cards, repairs, commentary and limited plans remain their own records',()=>{
 const h=['banked','repair','commentary'].map(type=>official('2026-10-26T06:08:46Z',{id:type,type}));h.push(official('2026-10-26T06:10:00Z',{scope:{plans:['pro500']}}));assert.equal(rows(h,[local('2026-10-26T06:07:40Z')],opts).length,5);
});
test('unknown balances stay unknown; future and invalid records are excluded',()=>{
 const result=rows([official('invalid'),official('2026-10-28T00:00:00Z')],[local('2026-10-26T06:07:40Z')],opts);assert.equal(result.length,1);assert.equal(result[0].beforeRemainingPercent,undefined);
});
test('a later post-reset sample cannot become the merged pre-reset balance',()=>{
 const first=local('2026-10-26T06:07:40Z'),later=local('2026-10-26T06:09:00Z',{beforeRemainingPercent:100,beforeFetchedAt:'2026-10-26T06:08:30Z'});
 const result=rows([], [first,later],opts);assert.equal(result[0].beforeRemainingPercent,undefined);
 later.beforeRemainingPercent=75;later.beforeFetchedAt='2026-10-26T06:07:10Z';assert.equal(rows([], [first,later],opts)[0].beforeRemainingPercent,75);
});
