'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{spawnSync}=require('node:child_process');
const TimeZone=require('../app/ui/time-zone.js');

test('default is Beijing and only supported IANA zones validate',()=>{
 assert.equal(TimeZone.DEFAULT,'Asia/Shanghai');
 for(const zone of ['Asia/Shanghai','America/New_York','Europe/Berlin','Asia/Kathmandu','Australia/Lord_Howe','Pacific/Apia','UTC'])assert.equal(TimeZone.valid(zone),true,zone);
 for(const zone of [null,undefined,42,'','Mars/Olympus','+08:00',' Asia/Shanghai','Asia/Shanghai ']){assert.equal(TimeZone.valid(zone),false);assert.equal(TimeZone.normalize(zone),'Asia/Shanghai');}
 assert.equal(TimeZone.normalize('America/New_York'),'America/New_York');
 assert.equal(TimeZone.normalize('Asia/Kolkata'),'Asia/Kolkata');
});

test('date keys and clocks use the selected zone with an unambiguous 24 hour clock',()=>{
 const at='2026-10-20T16:00:00Z';
 assert.equal(TimeZone.dateKey(at),'2026-10-21');assert.equal(TimeZone.time(at),'00:00');
 assert.equal(TimeZone.dateKey(at,'America/New_York'),'2026-10-20');assert.equal(TimeZone.time(at,'America/New_York'),'12:00');
 assert.equal(TimeZone.dateKey('2026-12-31T11:00:00Z','Pacific/Auckland'),'2027-01-01');
 assert.deepEqual(TimeZone.parts('2026-10-21T01:02:03Z','Asia/Kathmandu'),{year:2026,month:10,day:21,hour:6,minute:47,second:3});
 assert.equal(TimeZone.time(at,'invalid'),TimeZone.time(at));
});

test('invalid timestamps do not depend on the host local timezone',()=>{
 for(const value of [null,undefined,'bad','2026-10-21T00:00:00',NaN,Infinity,1e20]){
  assert.throws(()=>TimeZone.parts(value),/Invalid date/);assert.throws(()=>TimeZone.dateKey(value),/Invalid date/);assert.throws(()=>TimeZone.time(value),/Invalid date/);
 }
 assert.equal(TimeZone.time(new Date('2026-10-21T16:00:00Z')),'00:00');
});

test('local dates and hours convert to exact UTC including fractional-hour offsets',()=>{
 assert.equal(TimeZone.atLocal('2026-10-22',15),'2026-10-22T07:00:00.000Z');
 assert.equal(TimeZone.atLocal('2026-10-22',0,'Asia/Kathmandu'),'2026-10-21T18:15:00.000Z');
 assert.equal(TimeZone.atLocal('2027-01-01',0,'Pacific/Auckland'),'2026-12-31T11:00:00.000Z');
 assert.equal(TimeZone.atLocal('2026-10-22',15,'not/a-zone'),TimeZone.atLocal('2026-10-22',15));
});

test('spring DST gaps reject nonexistent hours instead of shifting the selected time',()=>{
 assert.throws(()=>TimeZone.atLocal('2026-03-08',2,'America/New_York'),{code:'INVALID_TARGET',reason:'NONEXISTENT_HOUR'});
 assert.equal(TimeZone.atLocal('2026-03-08',1,'America/New_York'),'2026-03-08T06:00:00.000Z');
 assert.equal(TimeZone.atLocal('2026-03-08',3,'America/New_York'),'2026-03-08T07:00:00.000Z');
 assert.throws(()=>TimeZone.atLocal('2026-03-29',2,'Europe/Berlin'),{code:'INVALID_TARGET',reason:'NONEXISTENT_HOUR'});
});

test('fall DST repeated hours choose the first occurrence deterministically',()=>{
 assert.equal(TimeZone.atLocal('2026-11-01',1,'America/New_York'),'2026-11-01T05:00:00.000Z');
 assert.equal(TimeZone.atLocal('2026-10-25',2,'Europe/Berlin'),'2026-10-25T00:00:00.000Z');
 assert.equal(TimeZone.atLocal('2026-11-01',2,'America/New_York'),'2026-11-01T07:00:00.000Z');
});

test('half-hour DST transitions and skipped civil dates use exact clock verification',()=>{
 assert.throws(()=>TimeZone.atLocal('2026-10-04',2,'Australia/Lord_Howe'),{code:'INVALID_TARGET',reason:'NONEXISTENT_HOUR'});
 assert.equal(TimeZone.atLocal('2026-10-04',3,'Australia/Lord_Howe'),'2026-10-03T16:00:00.000Z');
 assert.throws(()=>TimeZone.atLocal('2011-12-30',12,'Pacific/Apia'),{code:'INVALID_TARGET',reason:'NONEXISTENT_HOUR'});
});

test('invalid targets return a coded error distinct from missing DST hours',()=>{
 for(const [day,hour] of [['2026-02-30',1],['2026-1-01',1],['bad',1],['2026-01-01',-1],['2026-01-01',24],['2026-01-01',1.5],['2026-01-01','1']]){
  assert.throws(()=>TimeZone.atLocal(day,hour),error=>error.code==='INVALID_TARGET'&&error.reason===undefined);
 }
});

test('timezone APIs are independent of the host timezone including DST ambiguity',()=>{
 const file=require.resolve('../app/ui/time-zone.js');
 const code=`const t=require(${JSON.stringify(file)});process.stdout.write(JSON.stringify([t.dateKey('2026-10-21T00:00:00Z','America/New_York'),t.time('2026-10-21T00:00:00Z','Asia/Kathmandu'),t.atLocal('2026-11-01',1,'America/New_York')]));`;
 const values=['UTC','Asia/Shanghai','Pacific/Auckland'].map(TZ=>{const result=spawnSync(process.execPath,['-e',code],{encoding:'utf8',env:{...process.env,TZ}});assert.equal(result.status,0,result.stderr);return result.stdout;});
 assert.equal(values[0],values[1]);assert.equal(values[1],values[2]);
});

test('browser UMD exposes the same timezone API',()=>{
 const context=vm.createContext({Date,Intl});vm.runInContext(fs.readFileSync(require.resolve('../app/ui/time-zone.js'),'utf8'),context);
 assert.equal(context.DashboardTimeZone.DEFAULT,TimeZone.DEFAULT);
 assert.equal(context.DashboardTimeZone.atLocal('2026-11-01',1,'America/New_York'),'2026-11-01T05:00:00.000Z');
 assert.equal(context.DashboardTimeZone.time('2026-10-20T16:00:00Z'),'00:00');
});
