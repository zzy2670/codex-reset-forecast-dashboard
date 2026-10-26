'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{EventEmitter}=require('node:events');
const Policy=require('../app/notification-policy.cjs'),{quotaView,quotaChanges}=require('../app/codex-quota.cjs'),I18n=require('../app/ui/i18n.js');
const start=Date.parse('2026-10-15T06:13:00Z'),iso=t=>new Date(t).toISOString();
const sample=(now,used=2,end=start+7*86400000)=>({state:'ok',source:'local-codex',fetchedAt:iso(now),limits:[{id:'codex',name:'Codex',planType:'pro',secondary:{usedPercent:used,durationMins:10080,resetsAt:iso(end)}}]});
function runtime(saved=null){
 let now=start,writes=0,opened=0,next=sample(now),persisted;
 const state=saved||{settings:{notify:true,sound:false,language:'zh-CN',quotaWindow:'secondary',quotaLimitId:'codex'},quota:sample(now-30000,90,start+86400000),events:[],seen:[],notificationGroups:[]};
 const notifications=[],balloons=[],activeNotifications=new Map();
 class Native extends EventEmitter{constructor(options){super();this.options=options;notifications.push(this);}show(){this.emit('show');}close(){this.closed=true;this.emit('close',{reason:'dismissed'});}}
 const source=fs.readFileSync(path.join(__dirname,'../app/main.cjs'),'utf8');
 const sandbox={rememberLocalQuotaSnapshot:(s,q)=>require('../app/local-quota-history.cjs').rememberLocalQuotaSnapshot(s,q,now),recoverLocalQuotaHistory:s=>require('../app/local-quota-history.cjs').recoverLocalQuotaHistory(s,now),rememberLocalQuotaReset:(s,e)=>require('../app/local-quota-history.cjs').rememberLocalQuotaReset(s,e,now),state,Date:class extends Date{constructor(...a){super(...(a.length?a:[now]));}static now(){return now;}},path,__dirname:'',URLSearchParams,Notification:Native,activeNotifications,tr:t=>I18n.text(t,state.settings.language),...Policy,
 isQuiet:until=>Policy.isQuiet(until,now),shouldNotify:(g,e,u)=>Policy.shouldNotify(g,e,u,now),acknowledgeReset:(s,t,q,clickedAt=now)=>Policy.acknowledgeReset(s,t,q,clickedAt),recoverLocalReset:(s,q)=>Policy.recoverLocalReset(s,q,now),
 quotaView:(q,s)=>quotaView(q,s,now),quotaChanges:(a,b,s)=>quotaChanges(a,b,s,now),safeWrite:()=>{writes++;persisted=JSON.parse(JSON.stringify(state));},publish:()=>{},showWindow:()=>opened++,smoke:false,quotaRunning:false,
 quotaFlight:null,localQuota:{read:async()=>next},tray:{displayBalloon:v=>balloons.push(v)}};
 vm.createContext(sandbox);
 vm.runInContext(source.slice(source.indexOf('function addEvent('),source.indexOf('\nasync function fetchJson('))+source.slice(source.indexOf('async function refreshQuota('),source.indexOf('\nfunction trayMenu(')),sandbox);
 const forecast=(id,hours=12)=>sandbox.addEvent({key:id,kind:'forecast',resetType:'global',timingKind:'announcement',start:iso(now+hours*3600000),end:iso(now+hours*3600000),title:'发现新的重置预告',body:'已给出时间，点击查看。',sourceId:id});
 const receipt=n=>{const raw=n.options.toastXml.match(/<action [^>]*arguments="([^"]+)"/)[1].replaceAll('&amp;','&'),p=new URLSearchParams(raw);return sandbox.handleNotificationActivation({type:p.get('type'),actionIndex:Number(p.get('action')),arguments:raw});};
 return {state,notifications,balloons,sandbox,forecast,receipt,activeNotifications,advance:ms=>now+=ms,get now(){return now;},get opened(){return opened;},get persisted(){return persisted;},get writes(){return writes;},setNext:q=>next=q};
}
test('real quota-refresh path emits local confirmation; only routed receipt starts six hours',async()=>{
 const r=runtime();await r.sandbox.refreshQuota();assert.equal(r.notifications.length,1);assert.equal(r.state.localQuotaHistory.length,1);assert.equal(r.state.localQuotaHistory[0].beforeRemainingPercent,10);assert.equal(r.state.localQuotaHistory[0].afterRemainingPercent,98);assert.equal(r.state.notificationGroups[0].type,'local');
 const n=r.notifications[0];assert.match(n.options.body,/本机确认时间/);assert.doesNotMatch(n.options.body,/适用范围：全体/);
 n.emit('close',{reason:'dismissed'});assert.equal(r.state.resetQuietUntil,undefined);
 r.sandbox.handleNotificationActivation({type:'click',arguments:`type=click&tag=${n.options.id}`});assert.equal(r.opened,1);assert.equal(r.state.resetQuietUntil,undefined);
 r.advance(60000);r.receipt(n);assert.equal(Date.parse(r.state.resetQuietUntil),r.now+Policy.QUIET_MS);assert.equal(r.activeNotifications.size,0);assert.equal(r.persisted.resetQuietUntil,r.state.resetQuietUntil);
 const end=r.state.resetQuietUntil;r.advance(10000);r.receipt(n);assert.equal(r.state.resetQuietUntil,end);
});
test('source-only receipts, tests, unknown tags and other actions cannot start local-reset quiet',()=>{
 const r=runtime();r.forecast('source');r.receipt(r.notifications[0]);assert.equal(r.state.resetQuietUntil,undefined);
 r.sandbox.handleNotificationActivation({type:'action',actionIndex:0,arguments:'type=action&action=0&tag=unknown'});assert.equal(r.state.resetQuietUntil,undefined);
 r.sandbox.handleNotificationActivation({type:'action',actionIndex:1,arguments:`tag=${r.notifications[0].options.id}`});assert.equal(r.state.resetQuietUntil,undefined);
});
test('quiet records new messages, suppresses fallback and does not replay backlog at expiry',async()=>{
 const r=runtime();await r.sandbox.refreshQuota();const local=r.notifications[0];r.forecast('before-ack');const delayed=r.notifications[1];r.receipt(local);
 assert.equal(delayed.closed,true);delayed.emit('failed');assert.equal(r.balloons.length,0);
 r.forecast('quiet-news',16);assert.equal(r.notifications.length,2);const group=r.state.notificationGroups.at(-1);assert.ok(group.suppressedAt);assert.notEqual(group.delivered,true);assert.ok(r.state.events.some(e=>e.sourceId==='quiet-news'));
 const until=Date.parse(r.state.resetQuietUntil);r.advance(Policy.QUIET_MS-1);assert.equal(Policy.isQuiet(r.state.resetQuietUntil,r.now),true);
 r.sandbox.notifyUser('No popup','Quiet');assert.equal(r.notifications.length,2);r.advance(1);assert.equal(r.now,until);assert.equal(Policy.isQuiet(r.state.resetQuietUntil,r.now),false);
 r.sandbox.addEvent({key:'repeat-suppressed',kind:'forecast',resetType:'global',end:group.evidence[0].end,title:'Repeat',body:'Repeat',sourceId:'repeat'});assert.equal(r.notifications.length,2);
 r.setNext(sample(r.now));r.forecast('new-after-quiet',22);await r.sandbox.quotaFlight;await Promise.resolve();assert.equal(r.notifications.length,3);
});
test('persisted notification activation works after restart and repeated receipts do not extend quiet',async()=>{
 const a=runtime();await a.sandbox.refreshQuota();const n=a.notifications[0],b=runtime(JSON.parse(JSON.stringify(a.state)));b.receipt(n);assert.ok(b.state.resetQuietUntil);const quiet=b.state.resetQuietUntil;
 const c=runtime(b.persisted);c.advance(300000);c.receipt(n);assert.equal(c.state.resetQuietUntil,quiet);assert.equal(c.notifications.length,0);
});
test('recovery uses exact legacy local-event key and preserves received reset state',()=>{
 const q=quotaView(sample(start),{quotaWindow:'secondary'},start),key=`quota-reset:${q.bucketId}:${q.key}:${q.resetsAt}`;
 const state={events:[{kind:'quota_reset',key,at:iso(start-1000),sourceId:null}]};Policy.recoverLocalReset(state,q,start);assert.equal(state.localReset.key,key);state.localReset.acknowledgedAt=iso(start);Policy.recoverLocalReset(state,q,start);assert.equal(state.localReset.acknowledgedAt,iso(start));
 const wrong={events:[{kind:'confirmed',key,at:iso(start),sourceId:null}]};Policy.recoverLocalReset(wrong,{...q,fetchedAt:null,stale:true},start);assert.equal(wrong.localReset,undefined);
});
test('different bucket, window, cycle and stale local quota reject starting new quiet',async()=>{
 for(const patch of [{bucketId:'other'},{key:'primary'},{resetsAt:iso(start+9*86400000)},{stale:true}]){
  const r=runtime();await r.sandbox.refreshQuota();const q={...quotaView(r.state.quota,r.state.settings,start),...patch};const result=Policy.acknowledgeReset(r.state,r.notifications[0].options.id,q,start);assert.equal(result.quietStarted,false);assert.equal(r.state.resetQuietUntil,undefined);
 }
});
test('muted, verification and stale samples do not send; English receipt is fully translated',async()=>{
 const muted=runtime();muted.state.settings.notify=false;await muted.sandbox.refreshQuota();assert.equal(muted.notifications.length,0);
 const verify=runtime();verify.sandbox.smoke=true;await verify.sandbox.refreshQuota();assert.equal(verify.notifications.length,0);
 const stale=runtime();stale.state.quota.fetchedAt=iso(start-130000);await stale.sandbox.refreshQuota();assert.equal(stale.notifications.length,0);assert.equal(stale.state.localReset.kind,'observed-cycle');assert.equal(stale.state.events.length,0);
 const en=runtime();en.state.settings.language='en';await en.sandbox.refreshQuota();assert.doesNotMatch(en.notifications[0].options.body,/[\u4e00-\u9fff]/);assert.match(en.notifications[0].options.toastXml,/content="Acknowledge"/);
});
test('switching local quota A to B and back cannot forget its already acknowledged reset',async()=>{
 const r=runtime();await r.sandbox.refreshQuota();r.forecast('second-receipt',20);const second=r.notifications[1];r.receipt(r.notifications[0]);const until=r.state.resetQuietUntil;
 const q=quotaView(r.state.quota,r.state.settings,r.now),other={...q,bucketId:'other',resetsAt:iso(start+8*86400000)};
 r.state.events.push({kind:'quota_reset',key:`quota-reset:${other.bucketId}:${other.key}:${other.resetsAt}`,at:iso(start),sourceId:null});
 Policy.recoverLocalReset(r.state,other,r.now);Policy.recoverLocalReset(r.state,q,r.now);assert.ok(r.state.localReset.acknowledgedAt);
 r.advance(3000);r.receipt(second);assert.equal(r.state.resetQuietUntil,until);
});
test('a receipt for a notice predating the local reset cannot acknowledge the new reset',async()=>{
 const r=runtime();r.forecast('prior-reset-notice');const prior=r.notifications[0];await r.sandbox.refreshQuota();r.receipt(prior);assert.equal(r.state.resetQuietUntil,undefined);
 r.receipt(r.notifications[1]);assert.equal(Date.parse(r.state.resetQuietUntil),r.now+Policy.QUIET_MS);
});
test('cold activation refreshes stale quota before consuming receipt and times quiet from the click',async()=>{
 const a=runtime();await a.sandbox.refreshQuota();const b=runtime(JSON.parse(JSON.stringify(a.state)));b.advance(180000);const clickedAt=b.now;
 b.sandbox.localQuota.read=async()=>{b.advance(30000);return sample(b.now);};await b.receipt(a.notifications[0]);
 assert.equal(Date.parse(b.state.resetQuietUntil),clickedAt+Policy.QUIET_MS);assert.equal(Date.parse(b.state.localReset.acknowledgedAt),clickedAt);
 for(const failure of [false,true]){
  const c=runtime(JSON.parse(JSON.stringify(a.state)));c.advance(180000);
  c.sandbox.localQuota.read=async()=>{if(failure)throw new Error('offline');return sample(c.now,2,start+8*86400000);};
  await c.receipt(a.notifications[0]);assert.equal(c.state.resetQuietUntil,undefined);if(failure)assert.equal(c.state.notificationGroups[0].acknowledgedAt,undefined);
 }
});
test('fresh current-cycle proof restores after an upgrade without inventing a reset notification',async()=>{
 const r=runtime();r.state.quota=sample(r.now);await r.sandbox.refreshQuota();assert.equal(r.state.localReset.kind,'observed-cycle');assert.equal(r.notifications.length,0);assert.equal(r.state.events.length,0);
 r.forecast('after-upgrade-notice');await r.receipt(r.notifications[0]);assert.equal(Date.parse(r.state.resetQuietUntil),r.now+Policy.QUIET_MS);
});
test('a source arriving before the cold quota read waits to bind the real current cycle',async()=>{
 const r=runtime();r.state.quota.fetchedAt=iso(start-180000);r.forecast('first-boot-source');await r.sandbox.quotaFlight;await Promise.resolve();
 assert.equal(r.notifications.length,1);assert.equal(r.state.localReset.kind,'observed-cycle');assert.equal(r.state.notificationGroups[0].localResetKeyAtDelivery,r.state.localReset.key);
 await r.receipt(r.notifications[0]);assert.equal(Date.parse(r.state.resetQuietUntil),r.now+Policy.QUIET_MS);
});
test('turning notifications off during quota refresh cancels queued delivery without consuming it',async()=>{
 const r=runtime();r.state.quota.fetchedAt=iso(start-180000);let finish;r.sandbox.localQuota.read=()=>new Promise(resolve=>finish=resolve);
 r.forecast('queued');r.state.settings.notify=false;finish(sample(r.now));await r.sandbox.quotaFlight;await Promise.resolve();
 assert.equal(r.notifications.length,0);assert.equal(r.state.notificationGroups[0].pending,false);assert.notEqual(r.state.notificationGroups[0].delivered,true);
 r.state.settings.notify=true;r.forecast('unmuted-related-source');assert.equal(r.notifications.length,1);
});
