'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {projectSourceHistory}=require('../app/history-events.cjs');
const {normalize,calibratedReset,changes}=require('../app/core.cjs');
const {hypotheticalPace,projectAfterReset}=require('../app/ui/pace-timing.js');
const now=Date.parse('2026-10-21T12:00:00Z'),at=new Date(now-60000).toISOString(),stamp=new Date(now).toISOString();
const event=(id,extra={})=>({id,at,url:`https://x.com/thsottiaux/status/${id}`,type:'global',scope:null,text:'Original public text',timeBasis:'announcement',...extra});
const feed=(id,lastReset)=>({id,name:id,family:id==='codex'?'codex-reset':'didcodexreset',status:'ok',updatedAt:stamp,fetchedAt:stamp,maxAge:900000,lastReset,historyEvents:[lastReset],forecast:{state:'none'}});
const reviewed=[['2110595554036400151','observation'],['2111492738025959922','observation'],['2097183639356489952','commentary'],['2106239435461579088','repair']];

test('reviewed observations, commentary and repair remain visible but cannot form global consensus or completion notifications',()=>{
 for(const [id,type] of reviewed){
  const original=event(id),source=feed('codex',original),before=JSON.stringify(source),projected=projectSourceHistory(source);
  assert.equal(projected.lastReset.type,type);assert.equal(projected.historyEvents[0].type,type);
  assert.equal(projected.lastReset.phase,type);assert.equal(projected.lastReset.id,original.id);assert.equal(projected.lastReset.url,original.url);
  assert.equal(projected.lastReset.at,original.at);assert.equal(projected.lastReset.text,original.text);assert.equal(projected.lastReset.originalType,'global');
  assert.equal(Object.hasOwn(projected.lastReset,'sources'),false);assert.equal(JSON.stringify(source),before);
  assert.deepEqual(projectSourceHistory(projected),projected);
  const consensus=calibratedReset([source,feed('did',original)],now);
  assert.equal(consensus.state,'unavailable');assert.equal(hypotheticalPace(consensus,3,now,[]).available,false);
  assert.deepEqual(changes({...source,lastReset:null,historyEvents:[]},source,now),[]);
 }
});

test('genuine official completions still corroborate and produce the normal completion event',()=>{
 const original=event('2112432076767289678',{text:'Day 15/ Nevermind, we’re still cooking... and reset. Enjoy.'});
 const a=feed('codex',original),b=feed('did',original);
 assert.deepEqual(projectSourceHistory(a),a);
 const consensus=calibratedReset([a,b],now);assert.equal(consensus.state,'confirmed');assert.equal(consensus.familyCount,2);
 assert.equal(hypotheticalPace(consensus,3,now,[]).available,true);
 const events=changes({...a,lastReset:null,historyEvents:[]},a,now);assert.equal(events.length,1);assert.equal(events[0].kind,'confirmed');
});

test('new explicit observation and evidence-only stages cannot become completions',()=>{
 for(const extra of [{phase:'observation',completionRecordId:'901'},{evidenceOnly:true}]){
  const original=event('900',extra),sources=[feed('codex',original),feed('did',original)];
  assert.equal(calibratedReset(sources,now).state,'unavailable');assert.deepEqual(changes(null,sources[0],now),[]);
  const projected=projectSourceHistory(sources[0]);assert.equal(projected.lastReset.type,'observation');
  if(extra.completionRecordId)assert.equal(projected.lastReset.completionRecordId,extra.completionRecordId);
 }
});

test('normalization preserves explicit phase and relation for every provider completion format',()=>{
 for(const id of ['did','next','tibo','today','codex']){
  let raw;
  if(id==='did')raw={ok:true,meta:{generatedAt:stamp},data:{items:[{id:'900',kind:'reset_completed',resetType:'global',announcedAt:at,source:{url:'https://x.com/thsottiaux/status/900'},text:'Observed',phase:'observation',completionRecordId:'901',relatedRecordIds:['899']}]}};
  else{
   const file={next:'nextreset',tibo:'tibo',today:'today',codex:'codex-reset'}[id];
   raw=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures',`${file}.json`),'utf8'));
   const record=id==='next'?raw.history.last:id==='codex'?raw.latest_alert:raw.data.latest_reset;
   record.phase='observation';record.completionRecordId='901';
   if(id==='codex'){record.kind='reset';record.state='confirmed';}
  }
  const normalized=normalize(id,raw,stamp);
  assert.equal(normalized.lastReset.type,'observation',id);assert.equal(normalized.lastReset.phase,'observation',id);assert.equal(normalized.lastReset.completionRecordId,'901',id);
  assert.deepEqual(changes(null,normalized,now).filter(e=>e.kind==='confirmed'),[],id);
 }
});

test('an observed reset cannot retire a subsequent old announcement through the completion projector',()=>{
 const forecast={id:'902',state:'scheduled',type:'global',issuedAt:new Date(now-3600000).toISOString(),start:new Date(now+3600000).toISOString(),end:new Date(now+3600000).toISOString()};
 const sources=[projectSourceHistory({...feed('codex',event('2110595554036400151')),forecast})];
 const projected=projectAfterReset(sources,null,null,now);assert.equal(projected[0].forecast.id,forecast.id);assert.equal(projected[0].archivedForecasts.length,0);
});
