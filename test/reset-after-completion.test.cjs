'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {projectAfterReset,warning}=require('../app/ui/pace-timing.js');
const stamp=(hour,minute=0)=>`2026-10-15T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00+08:00`;
const now=Date.parse(stamp(14,40));
const quota={bucketId:'codex',key:'secondary',planType:'pro',durationMins:10080,resetsAt:'2026-10-22T14:13:00+08:00',usedPercent:3,fetchedAt:stamp(14,39),stale:false};
const actualLocalProof={key:'quota-reset:codex:secondary:'+quota.resetsAt,kind:'quota-reset',bucketId:'codex',windowKey:'secondary',resetsAt:quota.resetsAt,observedAt:stamp(14,14)};
const forecast=(id='old',issuedAt=stamp(12,55),end=stamp(14,55))=>({id,state:'scheduled',type:'global',issuedAt,start:end,end,url:`https://x.com/thsottiaux/status/${id==='old'?'2100000000000000001':'2100000000000000002'}`,text:'Original announcement',timingKind:'announcement'});
const source=(f=forecast())=>({id:'did',name:'Did Codex Reset',status:'ok',updatedAt:stamp(14,39),fetchedAt:stamp(14,39),maxAge:900000,forecast:f,additionalForecasts:[]});
const done=(patch={})=>({id:'tibo',name:'TIBO',status:'ok',updatedAt:stamp(14,39),fetchedAt:stamp(14,39),maxAge:900000,forecast:{state:'none'},lastReset:{id:'2100000000000000003',type:'global',at:stamp(14,28),url:'https://x.com/thsottiaux/status/2100000000000000003',text:'Completion record',...patch}});
const view=(sources,q=quota,local=actualLocalProof,t=now)=>projectAfterReset(sources,q,local,t);

test('reported local weekly refill retires the nearby old deadline and acceleration immediately from cache',()=>{
 const sources=[source()],before=JSON.stringify(sources),projected=view(sources);
 assert.equal(projected[0].forecast.state,'none');
 assert.equal(projected[0].archivedForecasts[0].retiredReason,'local-reset');
 assert.equal(projected[0].archivedForecasts[0].retiredAt,new Date(stamp(14,13)).toISOString());
 assert.equal(projected[0].archivedForecasts[0].issuedAt,stamp(12,55));
 assert.equal(warning(sources,quota,{state:'confirmed',at:stamp(7)},3,now,actualLocalProof).active,false);
 assert.equal(JSON.stringify(sources),before);
});

test('paused cached cycle evidence stays valid after freshness expires and projection is idempotent',()=>{
 const sources=[source()],cached={...quota,stale:true,fetchedAt:stamp(14,14)};
 const projected=view(sources,cached);
 assert.equal(projected[0].forecast.state,'none');
 assert.deepEqual(view(projected,cached),projected);
 assert.equal(warning(sources,cached,null,3,now,actualLocalProof).active,false);
});

test('a matching persisted local reset can supply the actual observation but a different window cannot',()=>{
 const q={...quota,fetchedAt:null,stale:true};
 const local={key:'quota-reset:codex:secondary:'+q.resetsAt,kind:'quota-reset',bucketId:'codex',windowKey:'secondary',resetsAt:q.resetsAt,observedAt:stamp(14,14)};
 assert.equal(view([source()],q,local)[0].forecast.state,'none');
 for(const changed of [{...local,bucketId:'other'},{...local,windowKey:'primary'},{...local,resetsAt:'2026-10-22T15:00:00+08:00'},{...local,observedAt:stamp(14,12)}])assert.equal(view([source()],q,changed)[0].forecast.state,'scheduled');
});

test('ordinary five-hour and weekly observed cycles cannot retire a global forecast by themselves',()=>{
 for(const q of [quota,{...quota,key:'primary',durationMins:300,resetsAt:stamp(19,13)}]){
  const observed={...actualLocalProof,kind:'observed-cycle',windowKey:q.key,resetsAt:q.resetsAt};
  for(const proof of [null,observed,{...observed,kind:undefined}]){
   assert.equal(view([source()],q,proof)[0].forecast.state,'scheduled');
   assert.equal(warning([source()],q,null,3,now,proof).active,true);
  }
 }
});

test('a real local refill uses its narrow two-hour relationship rather than the official six-hour assumption',()=>{
 const boundary=forecast('at-local-boundary',stamp(12),stamp(16,13));
 const after=forecast('after-local-boundary',stamp(12),'2026-10-15T16:13:00.001+08:00');
 assert.equal(view([source(boundary)])[0].forecast.state,'none');
 assert.equal(view([source(after)])[0].forecast.state,'scheduled');
 assert.equal(view([source(forecast('later',stamp(12),stamp(18)))])[0].forecast.state,'scheduled');
});

test('missing, failed, unobserved and invalid quota data cannot invent a completed reset',()=>{
 for(const q of [null,{...quota,state:'error'},{...quota,source:'another-provider'},{...quota,fetchedAt:null,stale:true},{...quota,fetchedAt:stamp(14,12)},{...quota,fetchedAt:stamp(14,45)},{...quota,durationMins:NaN},{...quota,durationMins:0},{...quota,usedPercent:NaN},{...quota,resetsAt:'2026-10-22T15:00:00+08:00'}]){
  assert.equal(view([source()],q,null)[0].forecast.state,'scheduled');
 }
});

test('a structured completion in another source retires the related nearby forecast even with a different post id',()=>{
 const sources=[source(),done()],projected=view(sources,null);
 assert.equal(projected[0].forecast.state,'none');
 assert.equal(projected[0].archivedForecasts[0].retiredReason,'completed');
 assert.equal(projected[0].archivedForecasts[0].retirementEvidence.url,sources[1].lastReset.url);
 assert.equal(projected[0].archivedForecasts[0].id,'old');
 assert.equal(warning(sources,null,null,3,now).active,false);
});

test('new announcements after local or public completion and remote future deadlines remain active',()=>{
 for(const f of [forecast('new',stamp(14,30)),forecast('new',stamp(14,13)),forecast('new',stamp(12),stamp(21))]){
  const p=view([source(f)],quota);
  assert.equal(p[0].forecast.state,'scheduled');
 }
 const f=forecast('new',stamp(14,30));
 assert.equal(view([source(f),done()],null)[0].forecast.state,'scheduled');
 assert.equal(warning([source(f),done()],quota,null,3,now).active,true);
 // The public completion post at 14:28 reports a refill observed at 14:13.
 const duringReportingLag=forecast('new',stamp(14,20));
 assert.equal(view([source(duringReportingLag),done()],quota)[0].forecast.state,'scheduled');
});

test('a newly completed event does not remove every future announcement or banked reset',()=>{
 const old=source();old.additionalForecasts=[forecast('later',stamp(12),stamp(21)),{...forecast('credit'),type:'banked'}];
 const projected=view([old,done()],null)[0];
 assert.equal(projected.forecast.id,'later');
 assert.deepEqual(projected.additionalForecasts.map(f=>f.id),['credit']);
 assert.deepEqual(projected.archivedForecasts.map(f=>f.id),['old']);
 assert.equal(warning([old,done()],null,null,3,now).earliest,Date.parse(stamp(21)));
});

test('window membership uses its original start and preserves evidence when a completion fulfills the window',()=>{
 const f={...forecast(),originalStart:stamp(14),start:null,end:stamp(18),clippedStart:true};
 const projected=view([source(f),done()],null)[0];
 assert.equal(projected.forecast.state,'none');
 assert.equal(projected.archivedForecasts[0].originalStart,stamp(14));
 assert.equal(projected.archivedForecasts[0].end,stamp(18));
});

test('six hour official default association boundary is exact and never replaces original deadline metadata',()=>{
 const boundary=forecast('new',stamp(12),stamp(20,13));
 const after={...boundary,id:'after',end:'2026-10-15T20:13:00.001+08:00',start:'2026-10-15T20:13:00.001+08:00'};
 const completion=done({at:stamp(14,13)});
 assert.equal(view([source(boundary),completion])[0].forecast.state,'none');
 assert.equal(view([source(after),completion])[0].forecast.state,'scheduled');
 assert.equal(view([source(forecast('earlier',stamp(12),stamp(18))),completion])[0].forecast.state,'none');
});

test('a window crossing the default six hour gap keeps only the source upper deadline in pacing',()=>{
 const f={...forecast('range',stamp(12),stamp(22)),start:stamp(18),precision:'window'};
 const sources=[source(f),done({at:stamp(14,13)})],before=JSON.stringify(sources),projected=view(sources),p=projected[0].forecast;
 assert.equal(p.state,'scheduled');assert.equal(p.start,null);
 assert.equal(p.originalStart,stamp(18));assert.equal(p.end,stamp(22));
 assert.equal(p.resetGapClipped,true);assert.equal(p.clippedStart,undefined);
 const w=warning(sources,quota,null,3,now,actualLocalProof);
 assert.equal(w.active,true);assert.equal(w.range,false);
 assert.equal(w.earliest,Date.parse(stamp(22)));assert.equal(w.latest,Date.parse(stamp(22)));
 assert.deepEqual(view(projected),projected);assert.equal(JSON.stringify(sources),before);
});

test('public completions also trim only old lower bounds and leave later official window announcements intact',()=>{
 const f={...forecast('range',stamp(12),stamp(23)),start:stamp(19),precision:'window'};
 const p=view([source(f),done()],null)[0].forecast;
 assert.equal(p.start,null);assert.equal(p.originalStart,stamp(19));assert.equal(p.end,stamp(23));assert.equal(p.resetGapClipped,true);
 const fresh={...f,id:'new',issuedAt:stamp(14,30)};
 assert.deepEqual(view([source(fresh),done()],quota)[0].forecast,fresh);
 const remote={...f,start:stamp(21)};
 assert.equal(view([source(remote),done()],null)[0].forecast.start,stamp(21));
});

test('six hour projection retains a new confirmed completion as evidence rather than treating it as a forecast',()=>{
 const first=done(),second={...done({id:'2100000000000000004',at:stamp(14,35),url:'https://x.com/thsottiaux/status/2100000000000000004'}),id:'today'};
 const projected=view([source(),first,second]);
 assert.equal(projected[2].lastReset,second.lastReset);
 assert.equal(projected[2].lastReset.at,stamp(14,35));
 assert.equal(projected[2].forecast.state,'none');
});

test('a new effective official completion overrides a prior local cycle and fulfills its new forecast',()=>{
 const f=forecast('new',stamp(14,20));
 const completion=done({at:stamp(14,35),timeBasis:'effective'});
 const p=view([source(f),completion])[0];
 assert.equal(p.forecast.state,'none');
 assert.equal(p.archivedForecasts[0].retirementEvidence.kind,'completion-record');
 assert.equal(p.archivedForecasts[0].retiredAt,new Date(stamp(14,35)).toISOString());
});

test('explicit cross-source completion relationships beat reporting lag and a distant projected deadline',()=>{
 for(const f of [forecast('new',stamp(14,20),stamp(23)),{...forecast('new',stamp(14,20),stamp(23)),id:'source-record-id'}]){
  const post=f.url.match(/\/status\/(\d+)/)[1];
  for(const id of [f.id,post]){
   const completion=done({at:stamp(14,35),relatedRecordIds:[id]});
   const p=view([source(f),completion])[0];
   assert.equal(p.forecast.state,'none');assert.equal(p.archivedForecasts[0].retirementEvidence.sourceId,'tibo');
  }
 }
});

test('a reporting lag after two hours cannot hide a later structured official completion',()=>{
 const t=Date.parse(stamp(17,10)),f=forecast('new',stamp(15),stamp(17,30));
 const completed=done({at:stamp(17)});
 const p=view([source(f),completed],{...quota,fetchedAt:stamp(17,9)},actualLocalProof,t)[0];
 assert.equal(p.forecast.state,'none');assert.equal(p.archivedForecasts[0].retiredReason,'completed');
});

test('unrelated plan completions do not retire global or other-plan forecasts',()=>{
 const pro={...forecast(),scope:{plans:['pro']}};
 assert.equal(view([source(pro),done({scope:{plans:['plus']}})],null)[0].forecast.state,'scheduled');
 assert.equal(view([source(),done({scope:{plans:['plus']}})],null)[0].forecast.state,'scheduled');
 assert.equal(view([source({...forecast(),scope:{plans:['plus']}})],quota)[0].forecast.state,'scheduled');
 assert.equal(view([source(pro),done({scope:{plans:['PRO']}})],null)[0].forecast.state,'none');
});

test('missing issue time, vague messages, unknown types and future completions never imply fulfillment',()=>{
 for(const patch of [{type:'banked'},{type:'unknown'},{url:null},{url:'https://example.com/reset'},{at:stamp(15)}]){
  assert.equal(view([source(),done(patch)],null)[0].forecast.state,'scheduled');
 }
 const textOnly={...done(),lastReset:null,signals:[{text:'Reset complete',at:stamp(14,28)}]};
 assert.equal(view([source(),textOnly],null)[0].forecast.state,'scheduled');
 assert.equal(view([source({...forecast(),issuedAt:null}),done()])[0].forecast.state,'scheduled');
});

test('shared upstream records can retire fulfilled schedules without inventing multi-source confirmation',()=>{
 const a={...done(),family:'codex-resets-feed'},b={...done(),id:'next',family:'codex-resets-feed'};
 const before=JSON.stringify([source(),a,b]);
 const projected=view([source(),a,b],null);
 assert.equal(projected[0].forecast.state,'none');
 assert.equal(projected[1].lastReset,a.lastReset);
 assert.equal('familyCount' in projected[0],false);
 assert.equal(JSON.stringify([source(),a,b]),before);
});
