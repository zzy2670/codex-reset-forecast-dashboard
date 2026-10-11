'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {normalize,changes,freshness,calibratedReset}=require('../app/core.cjs');
const {warning,forecastState}=require('../app/ui/pace-timing.js');
const {resetHistory}=require('../app/dashboard-model.cjs');
const {quotaChanges}=require('../app/codex-quota.cjs');
const stamp='2026-10-07T14:40:00Z',now=Date.parse(stamp);
const raw=name=>JSON.parse(fs.readFileSync(path.join(__dirname,'./fixtures',name+'.json'),'utf8'));
const schedule=(id,hour)=>({id,kind:'reset_scheduled',resetType:'global',announcedAt:stamp,text:'Reset at given time',scheduleState:'pending',schedulePrecision:'datetime',scheduleBasis:'explicit',scheduleWindow:{startAt:`2026-10-08T${hour}:00:00Z`,endAt:`2026-10-08T${hour}:00:00Z`},source:{url:`https://x.com/thsottiaux/status/${id}`}});
test('additional pending schedules notify creation, time corrections, and explicit cancellation',()=>{
 const r=raw('did');r.data.items.unshift(schedule('123456','12'));
 const before=normalize('did',r,stamp);r.data.items.unshift(schedule('234567','18'));
 const after=normalize('did',r,stamp);assert.equal(after.forecast.id,before.forecast.id);
 assert.equal(changes(before,after,now)[0].kind,'forecast');assert.equal(changes(before,after,now)[0].url,'https://x.com/thsottiaux/status/234567');
 r.data.items[0].scheduleWindow.endAt='2026-10-08T19:00:00Z';const corrected=normalize('did',r,stamp);assert.equal(changes(after,corrected,now)[0].kind,'time_changed');
 r.data.items[0].scheduleState='cancelled';const cancelled=normalize('did',r,stamp);assert.equal(changes(corrected,cancelled,now)[0].kind,'cancelled');
 assert.equal(changes(cancelled,cancelled,now).length,0);
});
test('a timed automatic reset is not hidden behind a newer untimed or banked schedule',()=>{
 const r=raw('did');r.data.items.unshift({...schedule('111111','13'),resetType:'banked'}, {...schedule('222222','14'),scheduleWindow:{}},schedule('333333','15'));
 const s=normalize('did',r,stamp);assert.equal(s.forecast.id,'333333');assert.equal(s.additionalForecasts.length,2);
});
test('a malformed future window cannot displace a valid upcoming automatic reset',()=>{
 const r=raw('did');const bad=schedule('111111','12');bad.scheduleWindow.startAt='2026-10-10T12:00:00Z';r.data.items.unshift(bad,schedule('222222','14'));
 assert.equal(normalize('did',r,stamp).forecast.id,'222222');
});
test('a reset limited to multiple named plans is still not a global reset',()=>{
 const r=raw('did');r.data.items.unshift({id:'123456',kind:'reset_completed',resetType:'global',scope:{plans:['plus','pro']},announcedAt:stamp,source:{url:'https://x.com/thsottiaux/status/123456'}});
 const s=normalize('did',r,stamp);assert.notEqual(s.lastReset.id,'123456');
 s.lastReset={...s.lastReset,scope:{plans:['plus','pro']}};assert.equal(calibratedReset([s],now).state,'unavailable');
});
test('scope corrections and teaser-to-announcement changes are material, stable probability changes are not',()=>{
 const r=raw('did');r.data.items.unshift(schedule('123456','12'));const a=normalize('did',r,stamp);
 r.data.items[0].scope={plans:['pro']};const b=normalize('did',r,stamp);assert.equal(changes(a,b,now)[0].kind,'time_changed');
 const hint=structuredClone(b);hint.forecast.timingKind='hint';assert.equal(changes(a,hint,now).length,0);assert.equal(changes(hint,b,now)[0].kind,'time_changed');
 assert.equal(changes(null,b,now)[0].kind,'forecast');
});
test('a source teaser remains an observation window and cannot create acceleration urgency',()=>{
 const r=raw('codex-reset');r.official_signal=null;r.teased_window={id:'hint',at:stamp,window:{start:'2026-10-08T12:00:00Z',end:'2026-10-08T14:00:00Z'},text:'Maybe tomorrow'};
 const s=normalize('codex',r,stamp);assert.equal(s.forecast.state,'scheduled');assert.equal(s.forecast.timingKind,'hint');assert.equal(warning([s],null,null,3,now).active,false);
});
test('paused source data expires locally even with status ok, and future timestamps fail freshness',()=>{
 const r=raw('did');r.data.items.unshift(schedule('123456','12'));const s=normalize('did',r,stamp);
 assert.equal(warning([s],null,null,3,now).active,true);
 assert.equal(warning([s],null,null,3,now+s.maxAge+1).active,false);assert.equal(freshness(s,now+s.maxAge+1),false);
 s.updatedAt=new Date(now+300001).toISOString();assert.equal(freshness(s,now),false);
});
test('past start-only schedules expire and reversed windows stay visibly invalid',()=>{
 const r=raw('did');r.data.items.unshift({...schedule('123456','12'),scheduleWindow:{startAt:'2026-10-06T12:00:00Z'}});
 const expired=normalize('did',r,stamp);assert.equal(expired.forecast.state,'none');assert.equal(expired.archivedForecasts[0].state,'elapsed');
 r.data.items[0].scheduleWindow={startAt:'2026-10-09T12:00:00Z',endAt:'2026-10-08T12:00:00Z'};
 const s=normalize('did',r,stamp);assert.equal(s.forecast.state,'invalid');assert.equal(warning([s],null,null,3,now).active,false);
 assert.equal(forecastState({state:'scheduled',end:stamp},now),'elapsed');
});
test('history applies later time, scope and effective-time corrections instead of retaining stale rows',()=>{
 const event={id:'123456',at:new Date(now-100000).toISOString(),url:'https://x.com/thsottiaux/status/123456',type:'global',timeBasis:'announcement'};
 const s={id:'did',name:'Did',family:'did',fetchedAt:stamp,historyEvents:[event]};const previous=resetHistory([s],[],now);
 s.historyEvents=[{...event,at:new Date(now-50000).toISOString(),scope:{plans:['pro']},timeBasis:'effective'}];s.fetchedAt=new Date(now+1000).toISOString();
 const rows=resetHistory([s],previous,now);assert.equal(rows.length,1);assert.equal(rows[0].at,s.historyEvents[0].at);assert.deepEqual(rows[0].scope,{plans:['pro']});assert.equal(rows[0].timeBasis,'effective');
 s.historyEvents[0].at='2026-08-31T15:59:59Z';assert.equal(resetHistory([s],rows,now).length,0);
});
test('no-URL history reclassification updates the same source event without duplicating it',()=>{
 const event={id:'no-url',at:new Date(now-1000).toISOString(),type:'global'};
 const s={id:'did',name:'Did',family:'did',fetchedAt:stamp,historyEvents:[event]};const rows=resetHistory([s],[],now);
 s.historyEvents[0]={...event,type:'banked'};const corrected=resetHistory([s],rows,now);assert.equal(corrected.length,1);assert.equal(corrected[0].type,'banked');
});
test('fresh real quota replenishment and denial notify, normal consumption and stale data do not',()=>{
 const q={state:'ok',source:'local-codex',fetchedAt:stamp,ordinaryUsageAllowed:true,limits:[{id:'codex',name:'Codex',planType:'pro',primary:{durationMins:10080,usedPercent:40,resetsAt:new Date(now+86400000).toISOString()}}]};
 const b=structuredClone(q);b.limits[0].primary.usedPercent=50;assert.equal(quotaChanges(q,b,{},now).length,0);
 b.limits[0].primary.usedPercent=0;b.limits[0].primary.resetsAt=new Date(now+7*86400000).toISOString();assert.equal(quotaChanges(q,b,{},now)[0].kind,'quota_reset');
 b.ordinaryUsageAllowed=false;assert.ok(quotaChanges(q,b,{},now).some(e=>e.kind==='quota_denied'));
 q.limits[0].primary.resetsAt=new Date(now-1000).toISOString();assert.equal(quotaChanges(q,b,{},now)[0].kind,'quota_reset');
 q.state='error';assert.equal(quotaChanges(q,b,{},now).length,0);
});
