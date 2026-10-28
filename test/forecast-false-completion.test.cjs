'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {normalize,changes,calibratedReset}=require('../app/core.cjs');
const {projectAfterReset,warning}=require('../app/ui/pace-timing.js');
const {projectSourceHistory,reconcileHistory}=require('../app/history-events.cjs');
const now=Date.parse('2026-10-28T04:52:00Z'),iso=t=>new Date(t).toISOString();
const forecast={id:'2115273253711409208',state:'scheduled',type:'global',timingKind:'announcement',issuedAt:'2026-10-28T02:43:38Z',start:null,end:'2026-10-28T07:00:00Z',url:'https://x.com/thsottiaux/status/2115273253711409208',text:'Lands by midnight PST.'};
const source={id:'codex',family:'codex-reset',status:'ok',updatedAt:iso(now),fetchedAt:iso(now),maxAge:900000,forecast};
const falseRecord={id:'2115297093879472332',at:'2026-10-28T04:18:22Z',url:'https://x.com/thsottiaux/status/2115297093879472332',text:'https://t.co/Fgy0dBAHsJ has landed',type:'regular',relatedRecordIds:[forecast.id]};
const report=(extra={})=>({...source,id:'today',family:'unverified-feed',forecast:{state:'none'},lastReset:falseRecord,...extra});
test('generic link landing remains commentary on fresh and persisted history paths',()=>{
 for(const row of [falseRecord,{...falseRecord,phase:'completion'},{...falseRecord,text:'Catalogued from the public reset feed.'}]){
  const p=projectSourceHistory({lastReset:row,historyEvents:[row]});
  assert.equal(p.lastReset.type,'commentary');assert.equal(p.historyEvents[0].type,'commentary');assert.equal(p.lastReset.text,row.text);
  const history=reconcileHistory([{...row,sources:[{id:'did',family:'didcodexreset'},{id:'tibo',family:'codex-resets-feed'}]}]);
  assert.equal(history[0].familyCount,0);assert.equal(history[0].type,'commentary');
 }
});
test('unrelated landed post cannot retire forecasts or emit reset confirmation, even when feeds briefly agree',()=>{
 const reports=['did','tibo','next','today'].map(id=>report({id,family:id==='did'?'didcodexreset':'codex-resets-feed'}));
 for(const reportsNow of [reports, reports.slice(0,1),[]]){
  const projected=projectAfterReset([source,...reportsNow],null,null,now);
  assert.equal(projected[0].forecast.state,'scheduled');assert.equal(warning([source,...reportsNow],null,null,3,now).active,true);
  assert.notEqual(calibratedReset(reportsNow,now).state,'confirmed');
  for(const r of reportsNow)assert.equal(changes({...r,lastReset:null},r,now).filter(e=>e.kind==='confirmed').length,0);
 }
});
test('stale, unverified and evidence-only records cannot retire another source live forecast',()=>{
 const valid={...falseRecord,text:'Codex usage limits have been reset.'};
 for(const r of [report({lastReset:valid}),report({id:'tibo',family:'codex-resets-feed',status:'stale',lastReset:valid}),report({id:'tibo',family:'codex-resets-feed',lastReset:{...valid,evidenceOnly:true}})]){
  assert.equal(projectAfterReset([source,r],null,null,now)[0].forecast.state,'scheduled');
 }
 const good=report({id:'tibo',family:'codex-resets-feed',lastReset:valid});
 assert.equal(projectAfterReset([source,good],null,null,now)[0].forecast.state,'none');
});
test('legitimate source deadlines age at their actual end, without shifting the day',()=>{
 assert.equal(projectAfterReset([source],null,null,Date.parse(forecast.end)-1)[0].forecast.state,'scheduled');
 const p=projectAfterReset([source],null,null,Date.parse(forecast.end))[0];
 assert.equal(p.forecast.state,'none');assert.equal(p.archivedForecasts[0].retiredReason,'expired');assert.equal(p.archivedForecasts[0].end,forecast.end);
});
