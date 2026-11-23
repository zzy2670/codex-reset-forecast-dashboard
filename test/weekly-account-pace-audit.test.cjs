'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../app/ui/renderer.js'),'utf8');
const sandbox={weeklyPaceCache:new WeakMap(),Date};vm.createContext(sandbox);
vm.runInContext(source.slice(source.indexOf('function weeklyResetSchedule('),source.indexOf('function renderWeeklyAccounts(')),sandbox);
const week=7*24*60*60*1000,end=Date.parse('2026-11-21T12:00:00Z'),iso=ms=>new Date(ms).toISOString();
const row=overrides=>({isCurrent:true,isLive:true,isChecking:false,isStale:false,resetsAt:iso(end),fetchedAt:iso(end-week/2),...overrides});
test('seven-day mark measures time on the complete track, independently of actual consumption',()=>{
 const marker={};
 assert.equal(sandbox.weeklyPace(row({remainingPercent:75}),end-week,marker),0);
 assert.equal(sandbox.weeklyPace(row({remainingPercent:75}),end-week/2,marker),50);
 assert.equal(sandbox.weeklyPace(row({remainingPercent:0}),end-week/2,marker),50);
 assert.equal(sandbox.weeklyPace(row({remainingPercent:100}),end-week/2,marker),50);
});
test('current due deadline remains at the right end; a new deadline begins a new cycle',()=>{
 const marker={};
 assert.equal(sandbox.weeklyPace(row(),end-1,marker)<100,true);
 assert.equal(sandbox.weeklyPace(row({isStale:true,isLive:false}),end,marker),100);
 assert.equal(sandbox.weeklyPace(row({isStale:true,isLive:false}),end+3600000,marker),100);
 assert.equal(sandbox.weeklyPace(row({resetsAt:iso(end+week),fetchedAt:iso(end)}),end,marker),0);
});
test('other accounts and stale current accounts advance by the current time',()=>{
 const marker={};
 assert.equal(sandbox.weeklyPace(row({isCurrent:false,isLive:false}),end-week/4,marker),75);
 assert.equal(sandbox.weeklyPace(row({isCurrent:false,isLive:false}),end+week,marker),0);
 assert.equal(sandbox.weeklyPace(row({isStale:true,isLive:false}),end-week/4,marker),75);
});
test('an unavailable reset does not fabricate a mark, while an absent sample time does not freeze time',()=>{
 assert.equal(sandbox.weeklyPace(row({resetsAt:null}),end,new Object()),null);
 assert.equal(sandbox.weeklyPace(row({isCurrent:false,isLive:false,fetchedAt:null}),end,new Object()),0);
});

test('inactive cycle rolls over repeatedly without changing the recorded snapshot',()=>{
 const account=Object.freeze(row({isCurrent:false,remainingPercent:0}));
 assert.equal(sandbox.weeklyPace(account,end),0);
 assert.equal(sandbox.weeklyPace(account,end+3*week+week/2),50);
 assert.equal(sandbox.weeklyCountdown(account,end),'距模拟重置 7 天 0 小时');
 assert.equal(sandbox.weeklyCountdown(account,end+week/2),'距模拟重置 3 天 12 小时');
 assert.equal(account.resetsAt,iso(end));
 assert.equal(account.remainingPercent,0);
});
