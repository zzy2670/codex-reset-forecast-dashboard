'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {interval,mergeMessage,toastXml,shouldNotify,notificationId,isQuiet,acknowledgeReset,QUIET_MS}=require('../app/notification-policy.cjs');
const now=Date.parse('2026-10-08T00:00:00Z'),t=now+3600000,iso=ms=>new Date(ms).toISOString();
const event=(id,at=t,end=at)=>({key:id,transition:{entity:'forecast:'+id},kind:'forecast',resetType:'global',timingKind:'announcement',title:'新重置预告',body:'信源给出排期',start:iso(at),end:iso(end),sourceId:id,url:'https://x.com/thsottiaux/status/123456'});
test('only reset messages with valid applicable concrete times qualify for notification',()=>{
 assert.ok(interval(event('a'),now,'pro'));
 for(const patch of [{kind:'quota_reset'},{kind:'quota_denied'},{kind:'removed'},{start:null,end:null},{start:iso(t+1),end:iso(t)},{start:iso(now-1),end:iso(now-1)},{resetType:'unknown'},{resetType:'banked'},{timingKind:'hint'},{timingKind:'inferred'},{timingKind:'model'},{scope:{plans:['plus']}}])assert.equal(interval({...event('a'),...patch},now,'pro'),null);
 assert.ok(interval({...event('c',now-1000),kind:'confirmed'},now));
 assert.equal(interval({...event('c',now-86400001),kind:'confirmed'},now),null);
});
test('different posts and sources with near times or overlapping windows merge once',()=>{
 const groups=[];assert.equal(mergeMessage(groups,event('a'),now).first,true);
 const merged=mergeMessage(groups,event('b',t+15*60000),now);assert.equal(merged.first,false);assert.equal(groups.length,1);assert.deepEqual(merged.event.sources,['a','b']);assert.ok(merged.event.body.includes('北京时间'));assert.ok(merged.event.body.includes('09:15'));
 assert.equal(mergeMessage(groups,event('c',t+16*60000),now).first,true);
 const wide=[];mergeMessage(wide,event('a',t,t+3600000),now);assert.equal(mergeMessage(wide,event('b',t+1800000,t+5400000),now).first,false);
});
test('same-post major correction and cumulative microchanges exceed the original anchor',()=>{
 const groups=[];mergeMessage(groups,event('a'),now);
 assert.equal(mergeMessage(groups,event('a',t+10*60000),now).first,false);
 assert.equal(mergeMessage(groups,event('a',t+20*60000),now).first,true);
 assert.equal(mergeMessage(groups,event('a'),now).first,false);
 const wide=[];mergeMessage(wide,event('a',t,t+3*3600000),now);assert.equal(mergeMessage(wide,event('a',t+3600000,t+4*3600000),now).first,true);
});
test('dedup survives restart and receipt; cancellation and completion remain distinct changes',()=>{
 let groups=[];mergeMessage(groups,event('a'),now);groups=JSON.parse(JSON.stringify(groups));
 assert.equal(mergeMessage(groups,event('b'),now).first,false);
 assert.equal(mergeMessage(groups,{...event('cancel'),kind:'cancelled'},now).first,true);
 assert.equal(mergeMessage(groups,{...event('cancel2'),kind:'cancelled'},now).first,false);
 assert.equal(mergeMessage(groups,{...event('done',now-100),kind:'confirmed'},now).first,true);
});
test('Windows XML has one routed receipt action and escapes untrusted text',()=>{
 const xml=toastXml('Reset & <title>','text "quote" <img>', 'safeid');assert.ok(xml.includes('scenario="reminder"'));assert.ok(xml.includes('content="确认收到"'));assert.ok(xml.includes('activationType="foreground" arguments="type=action&amp;action=0&amp;tag=safeid"'));assert.equal((xml.match(/<action /g)||[]).length,1);assert.ok(xml.includes('&amp;'));assert.ok(xml.includes('&lt;img&gt;'));assert.equal(xml.includes('<img>'),false);
});
test('scope matching excludes unknown accounts and disjoint plans while preserving merged evidence',()=>{
 const pro={...event('pro'),scope:{plans:['PRO']}};assert.equal(interval(pro,now,null),null);
 const groups=[];mergeMessage(groups,pro,now,'pro');
 const plus={...event('plus'),scope:{plans:['plus']}};assert.equal(mergeMessage(groups,plus,now,'plus').first,true);
 const merged=mergeMessage(groups,{...event('all'),resetType:'regular',scope:{plans:['all']}},now,'pro');assert.equal(merged.first,false);assert.ok(merged.event.body.includes('PRO'));assert.ok(merged.event.body.includes('全体'));assert.ok(merged.event.evidence.some(p=>p.scope.includes('pro')));
});
test('recorded while muted is not falsely marked delivered; delivery pending and receipt dedup',()=>{
 const groups=[],a=mergeMessage(groups,event('a'),now);assert.equal(shouldNotify(a.group,false),false);
 const b=mergeMessage(groups,event('b'),now);assert.equal(b.first,false);assert.equal(shouldNotify(b.group,true),true);
 b.group.pending=true;assert.equal(shouldNotify(b.group,true),false);b.group.pending=false;b.group.delivered=true;assert.equal(shouldNotify(b.group,true),false);
 assert.equal(shouldNotify(JSON.parse(JSON.stringify(b.group)),true),false);
});
test('notification timestamps default to Beijing and honor the selected IANA zone across dates',()=>{
 const e=event('a'),original=JSON.stringify(e);
 const beijing=mergeMessage([],e,now,'pro');assert.match(beijing.event.body,/10\/8 09:00（北京时间）/);
 const la=mergeMessage([],e,now,'pro','America/Los_Angeles');assert.match(la.event.body,/10\/7 18:00（America\/Los_Angeles）/);assert(!la.event.body.includes('北京时间'));
 const utc=mergeMessage([],e,now,'pro','UTC');assert.match(utc.event.body,/10\/8 01:00（UTC）/);
 const tokyo=mergeMessage([],e,now,'pro','Asia/Tokyo');assert.match(tokyo.event.body,/10\/8 10:00（Asia\/Tokyo）/);
 assert.equal(la.event.start,e.start);assert.equal(la.event.end,e.end);assert.equal(JSON.stringify(e),original);
});
test('notification ranges follow daylight-saving changes without changing absolute bounds',()=>{
 const current=Date.parse('2026-03-08T08:00:00Z'),start=Date.parse('2026-03-08T09:30:00Z'),end=Date.parse('2026-03-08T10:30:00Z');
 const merged=mergeMessage([],event('spring',start,end),current,'pro','America/Los_Angeles');
 assert.match(merged.event.body,/3\/8 01:30 至 3\/8 03:30/);
 assert.equal(merged.group.start,start);assert.equal(merged.group.end,end);
 const cancelled=mergeMessage([],{...event('cancelled',start,end),kind:'cancelled'},current,'pro','America/Los_Angeles');assert.match(cancelled.event.body,/原排期：3\/8 01:30 至 3\/8 03:30（America\/Los_Angeles）/);
});
test('changing only the display zone keeps notification grouping, receipt identity and quiet deadlines',()=>{
 const groups=[],first=mergeMessage(groups,event('a'),now,'pro','Asia/Shanghai'),key=first.group.id,tag=notificationId(key);
 first.group.delivered=true;
 const merged=mergeMessage(groups,event('b'),now,'pro','America/Los_Angeles');
 assert.equal(merged.first,false);assert.equal(groups.length,1);assert.equal(merged.group.id,key);assert.equal(notificationId(merged.group.id),tag);assert.equal(shouldNotify(merged.group,true),false);
 const quota={bucketId:'codex',key:'secondary',resetsAt:iso(now+7*86400000),stale:false};
 const resetKey=`quota-reset:${quota.bucketId}:${quota.key}:${quota.resetsAt}`;
 const local=mergeMessage([],{key:resetKey,kind:'quota_reset',bucketId:quota.bucketId,windowKey:quota.key,resetsAt:quota.resetsAt,at:iso(now),body:'额度已补充'},now,'pro','America/Los_Angeles');
 assert.match(local.event.body,/本机确认时间：10\/7 17:00（America\/Los_Angeles）/);
 local.group.delivered=true;const state={notificationGroups:[local.group],localReset:{key:resetKey,bucketId:quota.bucketId,windowKey:quota.key,resetsAt:quota.resetsAt}};
 assert.deepEqual(acknowledgeReset(state,notificationId(local.group.id),quota,now),{received:true,quietStarted:true});assert.equal(state.resetQuietUntil,iso(now+QUIET_MS));assert.equal(isQuiet(state.resetQuietUntil,now+QUIET_MS-1),true);assert.equal(isQuiet(state.resetQuietUntil,now+QUIET_MS),false);
});
test('invalid display zones safely use the Beijing default',()=>{
 for(const zone of ['not/a-zone','',null,123])assert.match(mergeMessage([],event('a'),now,'pro',zone).event.body,/10\/8 09:00（北京时间）/);
});
