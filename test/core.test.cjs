'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {SOURCES,normalize,calibratedReset,changes,quotaMath,freshness}=require('../app/core.cjs');
const fixtures=Object.fromEntries(Object.entries({codex:'codex-reset',did:'did',next:'nextreset',tibo:'tibo',today:'today'}).map(([id,file])=>[id,JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures',file+'.json'),'utf8'))]));
const time='2026-10-07T14:40:00Z', now=Date.parse(time);
const all=()=>SOURCES.map(s=>normalize(s.id,structuredClone(fixtures[s.id]),time));

test('five public-schema fixtures normalize without manufacturing a next ETA',()=>{
 const sources=all();assert.equal(sources.length,5);
 for(const s of sources){assert.equal(s.forecast.state,'none',s.name);assert.equal(s.lastReset.at,'2026-10-07T03:35:09.000Z');}
});
test('independent collection families corroborate the same source post',()=>{
 const c=calibratedReset(all(),now);assert.equal(c.state,'confirmed');assert.equal(c.familyCount,3);assert.equal(c.sources.length,5);
});
test('two websites with the same upstream do not make two independent votes',()=>{
 const c=calibratedReset(all().filter(s=>['next','tibo'].includes(s.id)),now);assert.equal(c.state,'pending');assert.equal(c.familyCount,1);
});
test('out-of-date data and failed refreshes cannot verify a reset',()=>{
 const sources=all();sources.forEach(s=>s.status='error');assert.equal(calibratedReset(sources,now).state,'unavailable');
 assert.equal(freshness(all()[0],now+3600000),false);
});
test('a newer single-source result stays pending instead of inheriting old consensus',()=>{
 const sources=all(); sources[0].lastReset={...sources[0].lastReset,id:'999999',url:'https://x.com/thsottiaux/status/999999',at:'2026-10-07T14:00:00Z'};
 const c=calibratedReset(sources,now);assert.equal(c.state,'pending');assert.equal(c.id,'999999');
});
test('conflicting times for the same event are visible',()=>{
 const sources=all();sources[0].lastReset.at='2026-10-07T04:35:09Z';assert.equal(calibratedReset(sources,now).state,'conflict');
});
test('banked reset and future-dated completion cannot move global reset time',()=>{
 const sources=all();sources[0].lastReset.type='banked';sources[0].lastReset.at='2026-10-07T14:00:00Z';
 sources[1].lastReset.at='2026-10-09T14:00:00Z';const c=calibratedReset(sources,now);assert.equal(c.at,'2026-10-07T03:35:09.000Z');
});
test('explicit date windows survive normalization while old fulfilled schedules do not',()=>{
 const raw=structuredClone(fixtures.did);
 raw.data.items.unshift({id:'future',kind:'reset_scheduled',resetType:'global',announcedAt:time,text:'Tomorrow at 10am PST',scheduleState:'pending',schedulePrecision:'datetime',scheduleBasis:'explicit',scheduleWindow:{startAt:'2026-10-08T18:00:00Z',endAt:'2026-10-08T18:00:00Z'},source:{url:'https://x.com/thsottiaux/status/123456'}});
 const s=normalize('did',raw,time);assert.equal(s.forecast.state,'scheduled');assert.equal(s.forecast.end,'2026-10-08T18:00:00.000Z');assert.equal(s.forecast.precision,'point');
 raw.data.items[0].scheduleState='fulfilled';assert.equal(normalize('did',raw,time).forecast.state,'none');
});
test('no timing in a promise remains untimed; no invented 24h deadline',()=>{
 const raw=structuredClone(fixtures.tibo);raw.data.scheduled_reset={id:'new',text:'More resets soon',reset_type:'regular',announced_at:time,source:{url:'https://x.com/thsottiaux/status/123456'}};
 const f=normalize('tibo',raw,time).forecast;assert.equal(f.state,'untimed');assert.equal(f.end,null);
});
test('probability-window expiry cannot become an ETA',()=>{
 const raw=structuredClone(fixtures.today);raw.data.next_reset_estimate.forecast_window_ends_at='2026-10-09T14:00:00Z';raw.data.next_reset_estimate.expected_by=null;
 assert.equal(normalize('today',raw,time).forecast.state,'none');
 raw.data.next_reset_estimate.expected_by='2026-10-08T14:00:00Z';assert.equal(normalize('today',raw,time).forecast.end,'2026-10-08T14:00:00.000Z');
});
test('NextReset uses real camel-case schedule fields and excludes hints',()=>{
 const raw=structuredClone(fixtures.next);raw.state='announced';raw.social={classification:'promise',expectedBy:'2026-10-08T14:00:00Z',source:'https://x.com/thsottiaux/status/123456'};
 assert.equal(normalize('next',raw,time).forecast.end,'2026-10-08T14:00:00.000Z');
 raw.social.windowStart='2026-10-08T00:00:00Z';raw.social.windowEnd='2026-10-10T00:00:00Z';
 assert.equal(normalize('next',raw,time).forecast.precision,'window');
 raw.state='forecast';raw.social.classification='hint';assert.equal(normalize('next',raw,time).forecast.state,'none');
 raw.state='announced';raw.social.classification='credit';assert.equal(normalize('next',raw,time).forecast.state,'none');
 raw.social.classification='promise';raw.social.carriedFromLastGoodCheck=true;assert.equal(normalize('next',raw,time).status,'stale');
});
test('Codex Reset official windows match real fields and retire after completion',()=>{
 const raw=structuredClone(fixtures.codex);raw.official_signal={tweet_id:'123456',at:time,summary:'Reset tomorrow',window:{start_at:'2026-10-08T00:00:00Z',end_at:'2026-10-09T00:00:00Z'},url:'https://x.com/thsottiaux/status/123456'};
 const f=normalize('codex',raw,time).forecast;assert.equal(f.start,'2026-10-08T00:00:00.000Z');assert.equal(f.end,'2026-10-09T00:00:00.000Z');assert.equal(f.issuedAt,new Date(time).toISOString());
 raw.official_signal.at='2026-10-06T00:00:00Z';assert.equal(normalize('codex',raw,time).forecast.state,'none');
});
test('same upstream post has a stable identity across site-specific record ids',()=>{
 const sources=all();assert.equal(new Set(sources.map(s=>s.lastReset.id)).size,1);
});
test('probability updates do not notify; new forecasts and changed windows do',()=>{
 const before=all()[0], after=structuredClone(before);after.probabilities[0].value=99;assert.equal(changes(before,after,now).length,0);
 after.forecast={state:'scheduled',id:'p1',end:'2026-10-08T12:00:00Z',type:'global',kindLabel:'全局重置'};
 assert.equal(changes(before,after,now)[0].kind,'forecast');
 const changed=structuredClone(after);changed.forecast.end='2026-10-08T13:00:00Z';assert.equal(changes(after,changed,now)[0].kind,'time_changed');
 changed.status='error';assert.equal(changes(after,changed,now).length,0);
});
test('quota bars compare actual usage against the confirmed personal cycle',()=>{
 const q={used:200,total:750,state:'ok',fetchedAt:time,resetAt:'2026-10-11T14:40:00Z'};
 const result=quotaMath(q,{cycleDays:7},now);assert.equal(result.remaining,550);assert.ok(Math.abs(result.theoretical-3/7)<1e-8);assert.ok(result.delta<0);
 const unknown=quotaMath({...q,resetAt:null},{cycleDays:7},now);assert.equal(unknown.theoretical,null);assert.equal(unknown.delta,null);
});
test('automatic expired cycle stays stale, manual recurring calibration advances',()=>{
 const q={used:200,total:750,state:'ok',fetchedAt:time,resetAt:'2026-10-01T14:40:00Z'};
 assert.equal(quotaMath(q,{cycleDays:7},now).stale,true);
 const manual=quotaMath(q,{cycleDays:7,manualResetAt:'2026-10-01T14:40:00Z'},now);assert.equal(manual.resetAt,'2026-10-08T14:40:00.000Z');assert.equal(manual.stale,false);
});
test('unknown schema fails closed and Did interval respects hourly quota',()=>{
 for(const s of SOURCES)assert.throws(()=>normalize(s.id,{},time));
 assert.ok(3600000/SOURCES.find(s=>s.id==='did').interval<20);
});
