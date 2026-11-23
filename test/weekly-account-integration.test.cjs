'use strict';

const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {rememberWeeklyAccountSnapshot,weeklyAccountRows}=require('../app/weekly-account-snapshots.cjs');
const main=fs.readFileSync(path.join(__dirname,'../app/main.cjs'),'utf8');
const ownerA='a'.repeat(64),ownerB='b'.repeat(64),hintA='c'.repeat(64),hintB='d'.repeat(64);
const base=Date.now(),iso=ms=>new Date(ms).toISOString();
function quota(owner,hint,used,at=base){
 const value={state:'ok',source:'local-codex',accountFingerprint:owner,fetchedAt:iso(at),limits:[{id:'codex',planType:owner===ownerA?'pro':'plus',secondary:{durationMins:10080,usedPercent:used,resetsAt:iso(at+7*86400000)}}]};
 Object.defineProperty(value,'_accountHint',{value:hint});
 Object.defineProperty(value,'_accountAliases',{value:[]});
 return value;
}
function productionRefresh(state,reader){
 const sandbox={state,localQuota:{read:reader},smoke:false,quitting:false,quotaLoginInProgress:false,quotaRunning:false,quotaFlight:null,quotaAccountRevision:0,accountVerified:false,activeAccountAliases:[],activeAccountHint:null,connection:{},Date,rememberWeeklyAccountSnapshot,rememberLocalQuotaSnapshot:()=>{},recoverLocalQuotaHistory:()=>{},recoverLocalReset:()=>{},quotaView:()=>null,quotaChanges:()=>[],safeWrite:()=>{},publish:()=>{},queueAccountRefresh:()=>{}};
 vm.createContext(sandbox);
 vm.runInContext(main.slice(main.indexOf('async function refreshQuota('),main.indexOf('\nfunction trayMenu(')),sandbox);
 vm.runInContext(main.slice(main.indexOf('function invalidateQuotaForAccountUpdate('),main.indexOf('\nfunction queueAccountRefresh(')),sandbox);
 return sandbox;
}
function rows(s,now=base){return weeklyAccountRows(s.state,s.state.quota,{verified:s.accountVerified,hint:s.activeAccountHint,aliases:s.activeAccountAliases,now});}

test('production refresh keeps separate account snapshots through A→B→restart→A',async()=>{
 let response=quota(ownerA,hintA,20),s=productionRefresh({settings:{},events:[]},async()=>response);
 await s.refreshQuota();
 response=quota(ownerB,hintB,70,base+100);await s.refreshQuota();
 const saved=JSON.parse(JSON.stringify(s.state)),frozenB=JSON.stringify(saved.weeklyAccountSnapshots[1]);
 response=quota(ownerA,hintA,45,base+200);s=productionRefresh(saved,async()=>response);
 await s.refreshQuota();
 const result=rows(s,base+200);
 assert.deepEqual(result.map(x=>[x.label,x.planType,x.remainingPercent,x.isCurrent]),[['账号 1','pro',55,true],['账号 2','plus',30,false]]);
 assert.equal(JSON.stringify(s.state.weeklyAccountSnapshots[1]),frozenB,'B remains unchanged after returning to A');
 for(const secret of [ownerA,ownerB,hintA,hintB])assert.equal(JSON.stringify(result).includes(secret),false,'weekly projection is anonymous');
});

test('an old response finishing after an account update cannot create a snapshot',async()=>{
 let release,reader=async()=>quota(ownerA,hintA,20),s=productionRefresh({settings:{},events:[]},()=>reader());
 await s.refreshQuota();
 const original=JSON.stringify(s.state.weeklyAccountSnapshots);
 reader=()=>new Promise(resolve=>{release=resolve;});
 const pending=s.refreshQuota();s.invalidateQuotaForAccountUpdate(false);
 release(quota(ownerB,hintB,70,base+100));await pending;
 assert.equal(JSON.stringify(s.state.weeklyAccountSnapshots),original);
 assert.equal(s.state.quota,null);
 reader=async()=>quota(ownerB,hintB,70,base+200);await s.refreshQuota();
 const result=rows(s,base+200);assert.equal(result.length,2);assert.equal(result[0].remainingPercent,80);assert.equal(result[0].isCurrent,false);assert.equal(result[1].remainingPercent,30);assert.equal(result[1].isCurrent,true);
});

test('a shared workspace with a different account hint never takes over the saved row',async()=>{
 let response=quota(ownerA,hintA,20),s=productionRefresh({settings:{},events:[]},async()=>response);
 await s.refreshQuota();const original=JSON.stringify(s.state.weeklyAccountSnapshots);
 response=quota(ownerA,hintB,90,base+100);await s.refreshQuota();
 assert.equal(s.state.ambiguousAccountOwners[ownerA],true);
 assert.equal(s.state.quota.identityUnverified,true);
 assert.equal(JSON.stringify(s.state.weeklyAccountSnapshots),original);
 assert.equal(rows(s,base+100).filter(x=>x.isCurrent).length,0);
});

test('different workspaces with the same account hint remain distinct snapshots',async()=>{
 let response=quota(ownerA,hintA,20),s=productionRefresh({settings:{},events:[]},async()=>response);
 await s.refreshQuota();response=quota(ownerB,hintA,70,base+100);await s.refreshQuota();
 const result=rows(s,base+100);
 assert.equal(result.length,2);assert.equal(result[0].remainingPercent,80);assert.equal(result[0].isCurrent,false);
 assert.equal(result[1].remainingPercent,30);assert.equal(result[1].isCurrent,true);
});

test('a failed quota read preserves the previous account snapshot as stale',async()=>{
 let fail=false,s=productionRefresh({settings:{},events:[]},async()=>{if(fail)throw new Error('temporary failure');return quota(ownerA,hintA,20)});
 await s.refreshQuota();const original=JSON.stringify(s.state.weeklyAccountSnapshots);
 fail=true;await s.refreshQuota();const result=rows(s);
 assert.equal(JSON.stringify(s.state.weeklyAccountSnapshots),original);
 assert.equal(result.length,1);assert.equal(result[0].remainingPercent,80);assert.equal(result[0].isStale,true);assert.equal(result[0].isLive,false);
});
