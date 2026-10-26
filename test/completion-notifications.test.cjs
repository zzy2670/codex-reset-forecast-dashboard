'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {SOURCES,normalize,changes,calibratedReset}=require('../app/core.cjs');
const {mergeMessage,shouldNotify,isQuiet}=require('../app/notification-policy.cjs');
const I18n=require('../app/ui/i18n.js');
const {projectAfterReset}=require('../app/ui/pace-timing.js');
const now=Date.parse('2026-10-11T06:00:00Z'),iso=t=>new Date(t).toISOString();
const record=(id,plans=['pro'],type='regular',at=now-60000)=>({id,kind:'reset_completed',effectiveAt:iso(at),announcedAt:iso(at),resetType:type,scope:{plans},source:{url:`https://x.com/example/status/${id}`},text:'Reset completed'});
const did=(records)=>({ok:true,meta:{generatedAt:iso(now)},data:{items:records}});
function mainSandbox(old,raw,plan='pro',baseline=true){
 const main=fs.readFileSync(path.join(__dirname,'../app/main.cjs'),'utf8');
 const state={sources:[old],seen:[],events:[],settings:{notify:true},baseline,confirmedId:null,paused:false},popups=[];
 const sandbox={rememberLocalQuotaReset:(s,e)=>require('../app/local-quota-history.cjs').rememberLocalQuotaReset(s,e,now),buildFailure:require('../app/source-retry.cjs').buildFailure,state,Date:class extends Date{constructor(...a){super(...(a.length?a:[now]));}static now(){return now;}},SOURCES:SOURCES.filter(s=>s.id==='did'),normalize,changes:(o,n)=>changes(o,n,now),calibratedReset:s=>calibratedReset(s,now),mergeMessage,shouldNotify,isQuiet,quotaView:()=>({planType:plan}),safeWrite:()=>{},publish:()=>{},smoke:false,running:false,snapshot:()=>state,checkedThisRun:new Set(),resetHistory:()=>[],fetchJson:async()=>raw,notifyUser:(title,body,key)=>{popups.push({title,body,key});const g=state.notificationGroups.find(g=>g.id===key);g.delivered=true;g.pending=false;}};
 sandbox.projectAfterReset=(s,q,r)=>projectAfterReset(s,q,r,now);
 sandbox.applyOfficialCalendarReset=(s,c)=>require('../app/calendar-reset.cjs').applyOfficialCalendarReset(s,c,now);
 vm.createContext(sandbox);
 vm.runInContext(main.slice(main.indexOf('function addEvent('),main.indexOf('\nasync function notifyUser('))+main.slice(main.indexOf('async function refresh('),main.indexOf('\nasync function refreshQuota(')),sandbox);
 return {sandbox,state,popups};
}
test('production polling generates one applicable completion notification from scoped Did history',async()=>{
 const a=record('1000000000000000001',['pro'],'regular',now-3600000),b=record('1000000000000000002');
 const old=normalize('did',did([a]),iso(now));old.nextCheckAt=null;
 const {sandbox,popups,state}=mainSandbox(old,did([b,a]));await sandbox.refresh();
 assert.equal(popups.length,1);assert.equal(state.events[0].kind,'confirmed');assert.deepEqual(Array.from(state.events[0].scope.plans),['pro']);
 assert.equal(calibratedReset(state.sources,now).state,'unavailable');
 assert.doesNotMatch(I18n.text(popups[0].title+' '+popups[0].body,'en'),/[\u4e00-\u9fff]/);
 state.sources[0].nextCheckAt=null;await sandbox.refresh();assert.equal(popups.length,1);
});
test('completion polling excludes other plans, credits, old times and first-start baseline',async()=>{
 for(const [records,plan,baseline] of [[ [record('1',['plus'])],'pro',true],[[record('2')],null,true],[[record('3',['pro'],'banked')],'pro',true],[[record('4',['pro'],'regular',now-86400001)],'pro',true],[[record('5',['pro'],'regular',now+61000)],'pro',true],[[record('6')],'pro',false]]){
  const old=normalize('did',did([]),iso(now));old.nextCheckAt=null;const {sandbox,popups}=mainSandbox(old,did(records),plan,baseline);await sandbox.refresh();assert.equal(popups.length,0);
 }
});
test('one completion duplicated in lastReset/history and later calibrated consensus is grouped once',()=>{
 const old={...SOURCES[0],status:'ok',updatedAt:iso(now),fetchedAt:iso(now),forecast:{state:'none'}};
 const completion={id:'1000000000000000007',at:iso(now-60000),type:'global',url:'https://x.com/example/status/1000000000000000007'};
 const events=changes(old,{...old,lastReset:completion,historyEvents:[completion]},now);assert.equal(events.length,1);
 const groups=[],first=mergeMessage(groups,events[0],now,'pro');first.group.delivered=true;
 const second=mergeMessage(groups,{...events[0],key:'confirmed:consensus',sourceId:null,title:'Cross-checked'},now,'pro');assert.equal(groups.length,1);assert.equal(shouldNotify(second.group,true),false);
});
test('NextReset, TIBO and Today retain completion scope in normalization',()=>{
 for(const id of ['next','tibo','today']){
  const raw=JSON.parse(fs.readFileSync(path.join(__dirname,`fixtures/${id==='next'?'nextreset':id}.json`),'utf8'));
  const last=id==='next'?raw.history.last:raw.data.latest_reset;last.scope={plans:['pro']};
  const s=normalize(id,raw);assert.deepEqual(s.lastReset.scope,{plans:['pro']});
 }
});
test('a Did completion without an explicit reset type remains unknown and cannot notify',async()=>{
 const r=record('1000000000000000008');delete r.resetType;
 const source=normalize('did',did([r]),iso(now));assert.equal(source.historyEvents[0].type,'unknown');
 const old=normalize('did',did([]),iso(now));old.nextCheckAt=null;
 assert.deepEqual(changes(old,source,now),[]);
 const {sandbox,popups}=mainSandbox(old,did([r]));await sandbox.refresh();assert.equal(popups.length,0);
});
test('production polling cannot notify an old forecast already fulfilled by the local quota cycle',async()=>{
 const raw=did([{id:'1000000000000000009',kind:'reset_scheduled',resetType:'global',scheduleBasis:'explicit',announcedAt:iso(now-2*3600000),scheduleWindow:{startAt:iso(now+1800000),endAt:iso(now+1800000)},source:{url:'https://x.com/example/status/1000000000000000009'}}]);
 const old=normalize('did',did([]),iso(now));old.nextCheckAt=null;const {sandbox,popups,state}=mainSandbox(old,raw);
 const resetsAt=iso(now+7*86400000-1800000);
 sandbox.quotaView=()=>({source:'local-codex',state:'ok',bucketId:'codex',key:'secondary',planType:'pro',durationMins:10080,resetsAt,usedPercent:2,fetchedAt:iso(now)});
 state.localReset={kind:'quota-reset',bucketId:'codex',windowKey:'secondary',resetsAt,observedAt:iso(now-1799000)};
 await sandbox.refresh();assert.equal(popups.length,0);assert.equal(state.events.length,0);assert.equal(state.sources[0].forecast.state,'scheduled');
});

