'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {weeklyReading,rememberWeeklyAccountSnapshot,weeklyAccountRows}=require('../app/weekly-account-snapshots.cjs');
const now=Date.parse('2026-11-14T10:00:00Z'),iso=x=>new Date(x).toISOString();
const a='a'.repeat(64),b='b'.repeat(64),ha='c'.repeat(64),hb='d'.repeat(64);
const quota=(owner,used=25,time=now,changes={})=>({state:'ok',source:'local-codex',accountFingerprint:owner,fetchedAt:iso(time),limits:[{id:'codex',name:'Codex',planType:'pro',primary:{durationMins:300,usedPercent:95,resetsAt:iso(time+3600000)},secondary:{durationMins:10080,usedPercent:used,resetsAt:iso(time+7*86400000)}}],...changes});
const state=()=>({accountIdentityHints:{[a]:ha,[b]:hb},ambiguousAccountOwners:{}});
test('two distinct accounts retain anonymous independent latest weekly snapshots across switch and restart',()=>{
 const s=state(),qa=quota(a,20),qb=quota(b,70,now+1000);assert(rememberWeeklyAccountSnapshot(s,qa,ha,[],now));assert(rememberWeeklyAccountSnapshot(s,qb,hb,[],now+1000));
 const restored=JSON.parse(JSON.stringify(s)),rows=weeklyAccountRows(restored,qb,{verified:true,hint:hb,now:now+1000});
 assert.deepEqual(rows.map(r=>[r.id,r.label,r.remainingPercent,r.isCurrent]),[['account-1','账号 1',80,false],['account-2','账号 2',30,true]]);
 assert.equal(rows[0].fetchedAt,qa.fetchedAt);assert.equal(rows[0].resetsAt,qa.limits[0].secondary.resetsAt);assert.equal(rows[1].planType,'pro');assert.equal(rows[1].isLive,true);
 for(const secret of [a,b,ha,hb])assert(!JSON.stringify(rows).includes(secret));
 const qa2=quota(a,45,now+2000);rememberWeeklyAccountSnapshot(restored,qa2,ha,[],now+2000);
 const again=weeklyAccountRows(restored,qa2,{verified:true,hint:ha,now:now+2000});assert.equal(again[0].id,'account-1');assert.equal(again[0].remainingPercent,55);assert.equal(again[1].remainingPercent,30);assert.equal(again[1].fetchedAt,qb.fetchedAt);
});
test('only verified ID and contemporaneous nonambiguous account hint create or highlight an account',()=>{
 const s=state(),q=quota(a);for(const hint of [null,hb])assert.equal(rememberWeeklyAccountSnapshot(s,q,hint,[],now),false);
 assert.equal(rememberWeeklyAccountSnapshot(s,{...q,accountFingerprint:null},ha,[],now),false);assert.equal(rememberWeeklyAccountSnapshot(s,q,ha,[],now),true);
 for(const options of [{verified:false,hint:ha},{verified:true,hint:null},{verified:true,hint:hb}])assert.equal(weeklyAccountRows(s,q,{...options,now})[0].isCurrent,false);
 s.ambiguousAccountOwners[a]=true;assert.equal(rememberWeeklyAccountSnapshot(s,quota(a,10,now+1000),ha,[],now+1000),false);assert.equal(weeklyAccountRows(s,q,{verified:true,hint:ha,now})[0].isCurrent,false);
});
test('legacy samples without a contemporaneous account hint are never attributed to a new account',()=>{
 const s=state();s.localQuotaSamples=[{accountFingerprint:a,remainingPercent:99,durationMins:10080,fetchedAt:iso(now),resetsAt:iso(now+86400000),provenance:{kind:'local-poll'}}];
 assert.deepEqual(weeklyAccountRows(s,quota(a),{verified:true,hint:ha,now}),[]);assert.equal(s.localQuotaSamples.length,1);
});
test('selects the real seven-day Codex window regardless of user selection or window order',()=>{
 const q=quota(a,0);assert.equal(weeklyReading(q).weekly.remainingPercent,100);
 const reverse=quota(a,0,now,{limits:[{id:'codex',planType:'plus',primary:{durationMins:10080,usedPercent:100,resetsAt:iso(now+86400000)},secondary:{durationMins:300,usedPercent:5,resetsAt:iso(now+3600000)}}]});
 assert.equal(weeklyReading(reverse).weekly.remainingPercent,0);assert.equal(weeklyReading(reverse).planType,'plus');
 const noWeek=quota(a,0,now,{limits:[{id:'codex',planType:'pro',primary:{durationMins:300,usedPercent:5,resetsAt:iso(now+3600000)}},{id:'other',name:'Other',secondary:{durationMins:10080,usedPercent:40,resetsAt:iso(now+86400000)}}]});
 assert.equal(weeklyReading(noWeek).weekly,null);const s=state();rememberWeeklyAccountSnapshot(s,noWeek,ha,[],now);const row=weeklyAccountRows(s,noWeek,{verified:true,hint:ha,now})[0];assert.equal(row.remainingPercent,null);assert.equal(row.resetsAt,null);assert.equal(row.isCurrent,true);
 assert.equal(weeklyReading(quota(a,0,now,{limits:[{id:'codex',primary:{durationMins:8640,usedPercent:3,resetsAt:iso(now+86400000)}}]})).weekly,null);
});
test('weekly remaining can be available even when deadline is unknown',()=>{
 const q=quota(a,50);q.limits[0].secondary.resetsAt=null;const s=state();assert(rememberWeeklyAccountSnapshot(s,q,ha,[],now));
 const row=weeklyAccountRows(s,q,{verified:true,hint:ha,now})[0];assert.equal(row.remainingPercent,50);assert.equal(row.resetsAt,null);assert.equal(row.isLive,true);
});
test('partial new reads do not erase the last known weekly observation or assign its old plan to a new sample',()=>{
 const s=state(),q=quota(a,30);rememberWeeklyAccountSnapshot(s,q,ha,[],now);
 const partial=quota(a,0,now+1000,{limits:[{id:'codex',planType:'plus',primary:{durationMins:300,usedPercent:20,resetsAt:iso(now+3600000)}}]});rememberWeeklyAccountSnapshot(s,partial,ha,[],now+1000);
 let row=weeklyAccountRows(s,partial,{verified:true,hint:ha,now:now+1000})[0];assert.equal(row.planType,'pro');assert.equal(row.remainingPercent,70);assert.equal(row.fetchedAt,q.fetchedAt);assert.equal(row.isStale,true);assert.equal(row.isLive,false);
 row=weeklyAccountRows(s,null,{verified:false,now:now+2000})[0];assert.equal(row.planType,'pro');assert.equal(row.remainingPercent,70);assert.equal(row.fetchedAt,q.fetchedAt);
 const noPlan=quota(a,35,now+3000);noPlan.limits[0].planType=null;rememberWeeklyAccountSnapshot(s,noPlan,ha,[],now+3000);
 assert.equal(weeklyAccountRows(s,noPlan,{verified:true,hint:ha,now:now+3000})[0].planType,null);
 assert.equal(weeklyAccountRows(s,null,{verified:false,now:now+3000})[0].planType,null);
});
test('paused, stale, expired, failed or checking reads do not advance the stored countdown',()=>{
 const s=state(),q=quota(a,25);rememberWeeklyAccountSnapshot(s,q,ha,[],now);
 for(const [statePatch,quotaPatch,opts] of [[{paused:true},{},{}],[{}, {state:'error'},{}],[{}, {},{now:now+121000}],[{}, {},{checking:true}]]){
  const row=weeklyAccountRows({...s,...statePatch},{...q,...quotaPatch},{verified:true,hint:ha,now,...opts})[0];assert.equal(row.isLive,false);assert.equal(row.fetchedAt,q.fetchedAt);
 }
 const expired=quota(a,30,now,{limits:[{id:'codex',planType:'pro',secondary:{durationMins:10080,usedPercent:30,resetsAt:iso(now-1)}}]});
 const row=weeklyAccountRows(s,expired,{verified:true,hint:ha,now})[0];assert.equal(row.isStale,true);assert.equal(row.isLive,false);
});
test('verified current alias keeps its original ordinal without merging unrelated hints',()=>{
 const old='e'.repeat(64),s=state(),previous=quota(old,30);s.accountIdentityHints[old]=ha;rememberWeeklyAccountSnapshot(s,previous,ha,[],now);
 delete s.accountIdentityHints[old];const current=quota(a,10,now+1000);rememberWeeklyAccountSnapshot(s,current,ha,[old],now+1000);
 const rows=weeklyAccountRows(s,current,{verified:true,hint:ha,aliases:[old],now:now+1000});assert.equal(rows.length,1);assert.equal(rows[0].id,'account-1');assert.equal(rows[0].remainingPercent,90);
});
test('the actual main-process snapshot exposes only anonymous weekly rows and no other account identity',()=>{
 const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
 const source=fs.readFileSync(path.join(__dirname,'../app/main.cjs'),'utf8'),s=state(),qa=quota(a),qb=quota(b,70,now+1000);
 rememberWeeklyAccountSnapshot(s,qa,ha,[],now);rememberWeeklyAccountSnapshot(s,qb,hb,[],now+1000);
 Object.assign(s,{sources:[],settings:{hypotheticalDays:3},quota:qa,events:[]});
 const sb={Date,state:s,SOURCES:[],connection:{checking:false},accountVerified:true,verification:false,activeAccountAliases:[],activeAccountHint:ha,weeklyAccountRows,quotaView:q=>q,projectAfterReset:x=>x,calibratedReset:()=>({}),resetHistory:()=>[],historyStart:()=>0,localQuotaHistoryRows:()=>[],hypotheticalPace:()=>({}),smoke:false,deploymentCheck:false,running:false,app:{getVersion:()=> 'fixture'},Notification:{isSupported:()=>false}};
 vm.createContext(sb);vm.runInContext(source.slice(source.indexOf('function snapshot()'),source.indexOf('\nfunction publish()')),sb);
 const result=sb.snapshot(),json=JSON.stringify(result);assert.equal(result.weeklyAccountSnapshots,undefined);assert.equal(result.weeklyAccounts.length,2);assert.equal(result.weeklyAccounts[0].isCurrent,true);assert.equal(result.weeklyAccounts[1].isCurrent,false);
 for(const secret of [b,ha,hb])assert(!json.includes(secret));for(const secret of [a,b,ha,hb])assert(!JSON.stringify(result.weeklyAccounts).includes(secret));
});
