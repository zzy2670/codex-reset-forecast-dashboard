'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {normalize}=require('../app/core.cjs');
const {warning}=require('../app/ui/pace-timing.js');
const fetched='2026-10-28T04:52:00.000Z',issued='2026-10-28T02:43:38.000Z';
const end='2026-10-28T07:00:00.000Z',pstEnd='2026-10-28T08:00:00.000Z';
const url='https://x.com/example/status/1000000000000000001';

test('separate PT and fixed PST interpretations retain their attributed times and zones',()=>{
 const codex=normalize('codex',{mode:'signal',updated_at:fetched,last_reset_at:'2026-10-26T07:00:00Z',official_signal:{tweet_id:'1000000000000000001',summary:'Lands by midnight PST.',at:issued,url,window:{start_at:issued,end_at:end,time_zone:'America/Los_Angeles'}}},fetched);
 const record={id:'schedule',kind:'reset_scheduled',resetType:'global',announcedAt:issued,effectiveAt:pstEnd,text:'Today is a reset.',scheduleState:'pending',scheduleBasis:'explicit',scheduleTimingSource:'explicit',scheduleTimezone:'PST',schedulePrecision:'datetime',scheduleConstraint:'deadline',scheduleWindow:{startAt:pstEnd,endAt:pstEnd},source:{url}};
 const did=normalize('did',{ok:true,meta:{lastSuccessfulCheckAt:fetched},data:{items:[record]}},fetched);
 assert.equal(codex.forecast.end,end);assert.equal(codex.forecast.timeZone,'America/Los_Angeles');
 assert.equal(did.forecast.end,pstEnd);assert.equal(did.forecast.timeZone,'PST');
 assert.equal(did.forecast.timeSource,'explicit');assert.equal(did.forecast.sourceTimeVerified,null);
 assert.equal(did.forecast.timingKind,'announcement');assert.equal(did.forecast.precision,'deadline');
 const unconstrained=normalize('did',{ok:true,meta:{lastSuccessfulCheckAt:fetched},data:{items:[{...record,scheduleConstraint:null}]}},fetched);
 assert.equal(unconstrained.forecast.precision,'point');
});

test('an unverified TIBO upstream deadline stays visible without becoming an explicit pace promise',()=>{
 const raw={last_successful_update:fetched,fresh_until:'2026-10-28T05:07:00Z',data:{scheduled_reset:{id:'schedule',reset_type:'regular',announced_at:issued,scheduled_for:end,text:'Lands by midnight PST.',translation:{text:'将于午夜 PST 前落地。'},source:{url}}},time_assessment:{window_end:end,calculation_timezone:'UTC',timestamp_origin:'scheduled_reset.scheduled_for',source_time_verified:false,reason:'Reference deadline, original time requires review.',text_time_assessment:{state:'needs_review'}}};
 const source=normalize('tibo',raw,fetched),f=source.forecast;
 assert.equal(f.state,'scheduled');assert.equal(f.end,end);assert.equal(f.timingKind,'inferred');
 assert.equal(f.sourceTimeVerified,false);assert.equal(f.timeSource,'scheduled_reset.scheduled_for');
 assert.equal(f.originalText,'Lands by midnight PST.');assert.equal(f.text,'将于午夜 PST 前落地。');
 assert.equal(f.timeInterpretation,raw.time_assessment.reason);
 assert.equal(warning([source],null,null,3,Date.parse(fetched)).active,false);
});

test('NextReset feed_deadline retains its interpretation without fabricating an original quote',()=>{
 const interpretation='Timing is interpreted by the public feed; check the original wording and timezone.';
 const source=normalize('next',{version:'test',asOf:fetched,expiresAt:'2026-10-28T05:07:00Z',state:'announced',windows:[],social:{classification:'promise',publishedAt:issued,timingKind:'feed_deadline',expectedBy:end,source:url,interpretation}},fetched),f=source.forecast;
 assert.equal(f.state,'scheduled');assert.equal(f.end,end);assert.equal(f.timingKind,'inferred');
 assert.equal(f.text,'');assert.equal(f.timeInterpretation,interpretation);assert.equal(f.sourceTimeVerified,false);
 assert.equal(warning([source],null,null,3,Date.parse(fetched)).active,false);
});

test('verified timing and additional Did schedule metadata survive normalization',()=>{
 const first={id:'first',kind:'reset_scheduled',resetType:'global',announcedAt:issued,effectiveAt:end,scheduleState:'pending',scheduleBasis:'explicit',scheduleTimezone:'PDT',schedulePrecision:'datetime',scheduleConstraint:'deadline',scheduleTimingSource:'source-text',sourceTimeVerified:true,source:{url}};
 const second={...first,id:'second',effectiveAt:pstEnd,scheduleTimezone:'PST',source:{url:'https://x.com/example/status/1000000000000000002'}};
 const source=normalize('did',{ok:true,meta:{lastSuccessfulCheckAt:fetched},data:{items:[second,first]}},fetched);
 assert.equal(source.forecast.precision,'deadline');assert.equal(source.additionalForecasts[0].precision,'deadline');
 assert.equal(source.forecast.timeZone,'PDT');assert.equal(source.forecast.sourceTimeVerified,true);
 assert.equal(source.additionalForecasts[0].timeZone,'PST');assert.equal(source.additionalForecasts[0].timeSource,'source-text');
});
