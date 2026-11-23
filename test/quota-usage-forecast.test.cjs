'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {rememberUsage,forecastUsage}=require('../app/quota-usage-forecast.cjs');
const minute=60000,now=Date.parse('2026-11-23T04:30:00Z'),owner='a'.repeat(64),iso=ms=>new Date(ms).toISOString();
const window={accountFingerprint:owner,bucketId:'codex',key:'secondary',resetsAt:iso(now+60*minute),fetchedAt:iso(now),usedPercent:60};
function fixture(){
 const state={};
 rememberUsage(state,[[20,50],[10,55],[0,60]].map(([ago,used])=>({accountFingerprint:owner,bucketId:'codex',windowKey:'secondary',resetsAt:window.resetsAt,fetchedAt:iso(now-ago*minute),remainingPercent:100-used})),now);
 return state;
}
test('projects from two measured gains and preserves each reading',()=>{
 const state=fixture();
 assert.equal(state.recentQuotaUsage.length,3);
 assert.equal(forecastUsage(state,window,now).percent,90);
 assert.equal(forecastUsage(state,window,now).emptyAt,null);
 assert.equal(forecastUsage(state,{...window,usedPercent:80},now).emptyAt,iso(now+40*minute/3));
});
test('different owner, deadline, refill or stale reading cannot borrow a trend',()=>{
 const state=fixture();
 for(const changes of [{accountFingerprint:'b'.repeat(64)},{resetsAt:iso(now+minute)},{usedPercent:40}])assert.equal(forecastUsage(state,{...window,...changes},now),null);
 assert.equal(forecastUsage(state,window,now+3*minute),null);

});
