'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sanitize,quotaView}=require('../app/codex-quota.cjs');
const now=Date.parse('2026-10-08T00:00:00Z');
const snapshot=()=>sanitize({accountId:'do-not-store-account-id',rateLimits:{limitId:'codex',planType:'pro',primary:{usedPercent:3,windowDurationMins:10080,resetsAt:now/1000+4*86400},secondary:null},ordinaryUsageAllowed:true,rateLimitResetCredits:{availableCount:2}});
test('local quota preserves real percentages, windows and reset times without account metadata',()=>{
 const q=snapshot();assert.equal(q.source,'local-codex');assert.equal(q.limits[0].primary.usedPercent,3);assert.equal(q.resetCredits,2);assert.equal('accountId' in q,false);
 const v=quotaView({...q,fetchedAt:new Date(now).toISOString()},{},now);assert.equal(v.remainingPercent,97);assert.equal(v.key,'primary');assert.ok(Math.abs(v.theoretical-3/7)<1e-8);assert.equal(v.stale,false);
});
test('primary can be weekly; never invent a five-hour window or a money balance',()=>{
 const v=quotaView(snapshot(),{},now);assert.equal(v.durationMins,10080);assert.equal(v.secondary,null);assert.equal(v.total,undefined);
});
test('stale reads and expired windows cannot imply a fresh or replenished quota',()=>{
 const q=snapshot();q.state='error';assert.equal(quotaView(q,{},now).stale,true);
 q.state='ok';q.fetchedAt=new Date(now).toISOString();q.limits[0].primary.resetsAt=new Date(now-1).toISOString();const v=quotaView(q,{},now);assert.equal(v.stale,true);assert.equal(v.remainingPercent,97);
});
test('multiple quota buckets and selected windows stay distinct',()=>{
 const q=sanitize({rateLimitsByLimitId:{codex:{limitId:'codex',primary:{usedPercent:30,windowDurationMins:300,resetsAt:now/1000+1000},secondary:{usedPercent:40,windowDurationMins:10080,resetsAt:now/1000+2000}},other:{limitId:'other',primary:{usedPercent:50,windowDurationMins:300,resetsAt:now/1000+1000}}}});
 assert.equal(quotaView(q,{},now).remainingPercent,60);assert.equal(quotaView(q,{quotaWindow:'primary'},now).remainingPercent,70);assert.equal(quotaView(q,{quotaLimitId:'other'},now).remainingPercent,50);
});
test('backend permission stays authoritative and missing data is unknown',()=>{
 const q=snapshot();q.ordinaryUsageAllowed=false;assert.equal(quotaView(q,{},now).ordinaryUsageAllowed,false);assert.throws(()=>sanitize({rateLimits:{}}));assert.equal(quotaView({source:'sub2api',used:1,total:750}),null);
});
