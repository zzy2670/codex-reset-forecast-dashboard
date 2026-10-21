'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process'),fs=require('node:fs'),vm=require('node:vm');
const Calendar=require('../app/ui/reset-calendar.js');
const now=Date.parse('2026-10-21T08:09:10+08:00');
const row=(id,at,extra={})=>({id,at,type:'global',scope:{plans:['all']},url:`https://x.com/thsottiaux/status/${id}`,...extra});

test('Beijing date keys cross midnight, month and year without using the host timezone',()=>{
 for(const [input,key] of [['2026-10-20T15:59:59.999Z','2026-10-20'],['2026-10-20T16:00:00Z','2026-10-21'],['2026-10-31T16:00:00Z','2026-11-01'],['2026-12-31T16:00:00Z','2027-01-01'],['2028-02-28T16:00:00Z','2028-02-29']])assert.equal(Calendar.dateKey(input),key);
 assert.equal(Calendar.dateKey(now),'2026-10-21');assert.equal(Calendar.dateKey(new Date(now)),'2026-10-21');
 for(const invalid of [null,undefined,'bad','2026-10-21T00:00:00',NaN,Infinity,1e20])assert.throws(()=>Calendar.dateKey(invalid),/Invalid date/);
});

test('calendar includes the prior 42 days, today and the next seven days in eight Monday-first weeks',()=>{
 const model=Calendar.calendar([],now),real=model.cells.filter(c=>c.inRange);
 assert.equal(model.start,'2026-09-09');assert.equal(model.end,'2026-10-28');assert.equal(model.today,'2026-10-21');
 assert.equal(model.cells.length,56);assert.equal(real.length,50);assert.equal(real.filter(c=>c.future).length,7);assert.equal(real.filter(c=>c.today).length,1);
 assert.deepEqual(model.cells.slice(0,2).map(c=>c.key),[null,null]);assert.equal(model.cells[2].key,'2026-09-09');
 assert.deepEqual(real[0],{key:'2026-09-09',day:9,month:9,inRange:true,future:false,today:false,events:[]});
 for(let i=0;i<model.cells.length;i+=7){const first=model.cells[i];if(first.inRange)assert.equal(new Date(first.key+'T00:00:00Z').getUTCDay(),1);}
 for(const cell of model.cells.filter(c=>!c.inRange))assert.deepEqual(cell,{key:null,day:null,month:null,inRange:false,future:false,today:false,events:[]});
});

test('each weekday produces exactly 56 cells and 50 distinct real dates',()=>{
 for(let offset=0;offset<7;offset++){
  const model=Calendar.calendar([],now+offset*86400000),real=model.cells.filter(c=>c.inRange);
  assert.equal(model.cells.length,56);assert.equal(real.length,50);assert.equal(new Set(real.map(c=>c.key)).size,50);
  assert.equal(real[0].key,model.start);assert.equal(real.at(-1).key,model.end);
 }
});

test('month/year boundaries and midnight advance the actual calendar window correctly',()=>{
 const before=Calendar.calendar([],'2026-12-31T15:59:59.999Z'),after=Calendar.calendar([],'2026-12-31T16:00:00Z');
 assert.equal(before.today,'2026-12-31');assert.equal(before.end,'2027-01-07');
 assert.equal(after.today,'2027-01-01');assert.equal(after.start,'2026-11-20');assert.equal(after.end,'2027-01-08');
 assert.equal(after.cells.find(c=>c.key==='2027-01-01').month,1);
});

test('multiple resets on one day remain separate, preserve scope and show their real HH:mm times',()=>{
 const history=[row('100','2026-10-20T01:02:59Z'),row('101','2026-10-20T09:04:01Z',{type:'banked',scope:{plans:['pro']}})];
 const original=JSON.stringify(history),cell=Calendar.calendar(history,now).cells.find(c=>c.key==='2026-10-20');
 assert.deepEqual(cell.events.map(e=>[e.id,e.time,e.type]),[['100','09:02','global'],['101','17:04','banked']]);
 assert.deepEqual(cell.events[1].scope,{plans:['pro']});assert.equal(JSON.stringify(history),original);
});

test('source copies deduplicate by stable event ID or canonical X/twitter post URL',()=>{
 const a=row('100','2026-10-20T01:00:00Z');
 const history=[a,{...a,url:'https://x.com/thsottiaux/status/101'},row('provider-copy','2026-10-20T01:00:00Z',{url:'https://twitter.com/thsottiaux/status/100?ref=feed#post'}),row('102','2026-10-20T02:00:00Z')];
 const events=Calendar.calendar(history,now).cells.flatMap(c=>c.events);
 assert.deepEqual(events.map(e=>e.id),['100','102']);
});

test('overlapping ID and post aliases deduplicate transitively while distinct posts stay separate',()=>{
 const history=[row('b','2026-10-20T01:00:00Z',{url:'https://x.com/thsottiaux/status/102'}),row('a','2026-10-20T01:00:00Z',{url:'https://x.com/thsottiaux/status/100'}),row('b','2026-10-20T01:00:00Z',{url:'https://twitter.com/thsottiaux/status/100'})];
 assert.equal(Calendar.calendar(history,now).cells.flatMap(c=>c.events).length,1);
});

test('history excludes future hours, future days, invalid records and events before the window',()=>{
 const history=[row('100','2026-09-09T00:00:00+08:00'),row('101','2026-09-08T23:59:59+08:00'),row('102','2026-10-21T08:09:10+08:00'),row('103','2026-10-21T08:09:11+08:00'),row('104','2026-10-22T00:00:00+08:00'),row('105','bad'),null];
 const model=Calendar.calendar(history,now),events=model.cells.flatMap(c=>c.events);
 assert.deepEqual(events.map(e=>e.id),['100','102']);assert.ok(model.cells.filter(c=>c.future).every(c=>c.events.length===0));
 assert.equal(Calendar.calendar(null,now).cells.length,56);
});

test('target conversion accepts only the next seven Beijing dates and preserves the selected hour exactly',()=>{
 assert.equal(Calendar.targetForDay('2026-10-22',0,now),'2026-10-21T16:00:00.000Z');
 assert.equal(Calendar.targetForDay('2026-10-22',15,now),'2026-10-22T07:00:00.000Z');
 assert.equal(Calendar.targetForDay('2026-10-28',23,now),'2026-10-28T15:00:00.000Z');
 for(const key of ['2026-10-20','2026-10-21','2026-10-29','2026-02-30','2026-1-01','bad',null])assert.throws(()=>Calendar.targetForDay(key,15,now),/Invalid day/);
 for(const hour of [-1,24,1.5,'15',NaN,null])assert.throws(()=>Calendar.targetForDay('2026-10-22',hour,now),/Invalid hour/);
 assert.equal(Calendar.targetForDay('2027-01-01',0,'2026-12-31T00:00:00+08:00'),'2026-12-31T16:00:00.000Z');
});

test('calendar targets derive exact fractional days from the real reset anchor',()=>{
 const anchor='2026-10-20T14:13:01.000+08:00';
 const result=Calendar.daysForTarget(anchor,'2026-10-22',15,now);
 assert.equal(result.targetAt,'2026-10-22T07:00:00.000Z');
 assert.equal(result.days,(Date.parse(result.targetAt)-Date.parse(anchor))/86400000);
 assert.equal(Date.parse(anchor)+result.days*86400000,Date.parse(result.targetAt));
 assert.ok(result.days>2&&result.days<3);
});

test('a recent reset permits a target less than a quarter day away',()=>{
 const current='2026-10-21T23:59:00+08:00',anchor='2026-10-21T23:58:00+08:00';
 const result=Calendar.daysForTarget(anchor,'2026-10-22',0,current);
 assert.equal(result.targetAt,'2026-10-21T16:00:00.000Z');assert.equal(result.days,2/1440);
 assert.ok(result.days>0&&result.days<0.25);
});

test('period bounds accept exactly 365 days and return short coded errors',()=>{
 const target=Date.parse('2026-10-22T07:00:00Z'),yearAgo=target-365*86400000;
 assert.equal(Calendar.daysForTarget(yearAgo,'2026-10-22',15,now).days,365);
 assert.throws(()=>Calendar.daysForTarget(yearAgo-1,'2026-10-22',15,now),{code:'INVALID_PERIOD'});
 for(const anchor of [null,undefined,'invalid',Infinity,now+1])assert.throws(()=>Calendar.daysForTarget(anchor,'2026-10-22',15,now),{code:'NO_ANCHOR'});
 for(const [day,hour] of [['2026-10-21',15],['2026-10-29',15],['2026-02-30',15],['2026-10-22',24],['2026-10-22',1.5]])assert.throws(()=>Calendar.daysForTarget(yearAgo,day,hour,now),{code:'INVALID_TARGET'});
});

test('all three APIs are identical under different host timezones',()=>{
 const modulePath=require.resolve('../app/ui/reset-calendar.js');
 const code=`const c=require(${JSON.stringify(modulePath)});process.stdout.write(JSON.stringify([c.dateKey('2026-12-31T16:00:00Z'),c.calendar([],'2026-12-31T16:00:00Z'),c.targetForDay('2027-01-02',15,'2026-12-31T16:00:00Z')]));`;
 const results=['UTC','America/Los_Angeles','Pacific/Auckland'].map(TZ=>{
  const result=spawnSync(process.execPath,['-e',code],{env:{...process.env,TZ},encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);return result.stdout;
 });
 assert.equal(results[0],results[1]);assert.equal(results[0],results[2]);
});

test('browser UMD exposes the same pure API without requiring the Node runtime',()=>{
 const context=vm.createContext({Date,URL});vm.runInContext(fs.readFileSync(require.resolve('../app/ui/reset-calendar.js'),'utf8'),context);
 assert.equal(context.ResetCalendar.dateKey('2026-10-20T16:00:00Z'),'2026-10-21');
 assert.equal(context.ResetCalendar.calendar([],now).cells.length,56);
 assert.equal(context.ResetCalendar.targetForDay('2026-10-22',15,now),'2026-10-22T07:00:00.000Z');
 assert.equal(context.ResetCalendar.daysForTarget('2026-10-20T07:00:00Z','2026-10-22',15,now).days,2);
});
