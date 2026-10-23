'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {initializeCalendarResets,applyOfficialCalendarReset}=require('../app/calendar-reset.cjs');
const now=Date.parse('2026-10-23T12:00:00Z'),baseAt='2026-10-20T06:33:48.000Z',nextAt='2026-10-22T17:10:01.000Z';
const event=(id,at=nextAt,extra={})=>({id,at,url:`https://x.com/thsottiaux/status/${id}`,type:'global',scope:{plans:['all']},state:'confirmed',...extra});
function verified(id,at=baseAt,extra={}){const row=event(id,at,extra);return {...row,sources:[{id:'codex',family:'codex-reset',url:row.url,at},{id:'did',family:'didcodexreset',url:row.url,at}]};}
const target=()=>({at:'2026-10-25T07:00:00.000Z',anchor:baseAt});
function initial(extra={}){const state={settings:{calendarTarget:target(),hypotheticalDays:3,notify:true,language:'zh-CN'},history:[verified('2112432076767289678')],...extra};initializeCalendarResets(state,now);return state;}
const copy=value=>JSON.parse(JSON.stringify(value));

test('first migration records only independently cross-checked completed global history without clearing the target',()=>{
 const good=verified('100'),rows=[good,verified('101',nextAt,{type:'observation'}),verified('102',nextAt,{phase:'forecast'}),verified('103',nextAt,{type:'banked'}),verified('104',nextAt,{scope:{plans:['pro']}}),verified('105',nextAt,{timeConflict:true}),{...verified('106'),sources:[good.sources[0]]},verified('107',new Date(now+1).toISOString())];
 const state={settings:{calendarTarget:target(),hypotheticalDays:4},history:rows},before=copy(state.settings);
 assert.equal(initializeCalendarResets(state,now),true);assert.deepEqual(state.settings,before);assert.deepEqual(state.calendarResets.processedIds,['100']);assert.equal(state.calendarResets.latestAt,baseAt);
 assert.equal(initializeCalendarResets(state,now),false);assert.equal(state.calendarResetClearedBy,undefined);
});

test('a new confirmed official global completion clears only the calendar target exactly once',()=>{
 const state=initial(),settings=copy(state.settings),next=event('2113162277688070446');
 assert.deepEqual(applyOfficialCalendarReset(state,next,now),{changed:true,cleared:true,id:next.id});
 delete settings.calendarTarget;assert.deepEqual(state.settings,settings);assert.equal(state.calendarResetClearedBy,next.id);assert.equal(state.calendarResets.latestAt,next.at);
 assert.deepEqual(applyOfficialCalendarReset(state,next,now),{changed:false,cleared:false,id:null});
});

test('pending, conflict, forecast, local, observed, recap, repairs and limited plans cannot clear a target',()=>{
 const invalid=[{state:'pending'},{state:'conflict'},{state:'unavailable'},{type:'forecast'},{type:'quota_reset'},{type:'observation'},{type:'commentary'},{type:'repair'},{phase:'observation'},{phase:'scheduled'},{evidenceOnly:true},{type:'banked'},{scope:{plans:['pro']}},{scope:{plans:['unknown']}}];
 for(const extra of invalid){const state=initial(),before=copy(state);assert.deepEqual(applyOfficialCalendarReset(state,event('200',nextAt,extra),now),{changed:false,cleared:false,id:null});assert.deepEqual(state,before);}
});

test('same-post time and text revisions, A to B to A rollback and old history backfills never clear a new selection',()=>{
 const state=initial(),next=event('2113162277688070446');applyOfficialCalendarReset(state,next,now);state.settings.calendarTarget=target();
 const before=copy(state.settings.calendarTarget);
 for(const revised of [event('2112432076767289678'),{...next,at:'2026-10-23T11:00:00.000Z',text:'A corrected time'},event('199','2026-10-19T00:00:00.000Z'),next]){
  assert.equal(applyOfficialCalendarReset(state,revised,now).cleared,false);assert.deepEqual(state.settings.calendarTarget,before);
 }
 assert.equal(state.calendarResets.latestAt,nextAt);
 assert.ok(state.calendarResets.processedIds.includes('199'));
});

test('completion IDs are consumed even with no target so later choices survive unchanged polls',()=>{
 const state=initial();delete state.settings.calendarTarget;const next=event('2113162277688070446');
 assert.deepEqual(applyOfficialCalendarReset(state,next,now),{changed:true,cleared:false,id:next.id});
 state.settings.calendarTarget=target();assert.equal(applyOfficialCalendarReset(state,next,now).cleared,false);assert.deepEqual(state.settings.calendarTarget,target());
 const later=event('2113162277688070447','2026-10-23T11:00:00.000Z');assert.equal(applyOfficialCalendarReset(state,later,now).cleared,true);
});

test('processed completion identity and watermark survive restart without clearing a newly selected target',()=>{
 const state=initial(),next=event('2113162277688070446');applyOfficialCalendarReset(state,next,now);state.settings.calendarTarget=target();
 const restored=copy(state);assert.equal(initializeCalendarResets(restored,now),false);assert.deepEqual(applyOfficialCalendarReset(restored,next,now),{changed:false,cleared:false,id:null});assert.deepEqual(restored.settings.calendarTarget,target());
 assert.equal(applyOfficialCalendarReset(restored,event('2113162277688070447','2026-10-23T11:00:00.000Z'),now).cleared,true);
});

test('future, malformed and non-original completion identities do not advance the watermark',()=>{
 for(const extra of [{at:new Date(now+1).toISOString()},{at:'invalid'},{url:null},{url:'https://codex-reset.com/manual/123'},{url:'https://x.com/thsottiaux/status/not-numeric'},{url:'https://user:password@x.com/thsottiaux/status/200'}]){
  const state=initial(),before=copy(state);assert.equal(applyOfficialCalendarReset(state,event('200',nextAt,extra),now).changed,false);assert.deepEqual(state,before);
 }
});

test('late completion notices older than the target selection are consumed without removing that selection',()=>{
 for(const createdAt of [nextAt,'2026-10-23T11:00:00.000Z']){
  const state=initial();state.settings.calendarTarget={...target(),createdAt};const next=event('2113162277688070446');
  assert.deepEqual(applyOfficialCalendarReset(state,next,now),{changed:true,cleared:false,id:next.id});assert.equal(state.settings.calendarTarget.createdAt,createdAt);
  assert.equal(state.calendarResets.latestAt,nextAt);assert.equal(state.calendarResetClearedBy,undefined);
 }
 const state=initial();state.settings.calendarTarget={...target(),createdAt:'2026-10-21T00:00:00.000Z'};assert.equal(applyOfficialCalendarReset(state,event('2113162277688070446'),now).cleared,true);
});

test('the same original post across site-specific IDs and X/twitter URLs is consumed only once',()=>{
 const state=initial(),next=event('2113162277688070446');applyOfficialCalendarReset(state,next,now);state.settings.calendarTarget=target();
 assert.equal(applyOfficialCalendarReset(state,{...next,id:'provider-copy',url:'https://twitter.com/thsottiaux/status/2113162277688070446?ref=feed'},now).changed,false);
 assert.deepEqual(state.settings.calendarTarget,target());
});

test('processed identities remain bounded while the latest watermark blocks evicted old events',()=>{
 const state=initial(),base=Date.parse(baseAt);
 for(let index=0;index<520;index++)applyOfficialCalendarReset(state,event(String(index+1000),new Date(base+(index+1)*1000).toISOString()),now);
 assert.equal(state.calendarResets.processedIds.length,512);state.settings.calendarTarget=target();
 assert.equal(applyOfficialCalendarReset(state,event('1000',new Date(base+1000).toISOString()),now).cleared,false);
 assert.deepEqual(state.settings.calendarTarget,target());
});
