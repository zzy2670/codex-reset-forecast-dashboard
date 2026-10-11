'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {latestNews,warning}=require('../app/ui/pace-timing.js'),{normalize}=require('../app/core.cjs');
const now=Date.parse('2026-10-08T02:00:00Z'),stamp=new Date(now).toISOString();
const announcement={id:'banked',type:'banked',state:'scheduled',issuedAt:'2026-10-07T19:19:17Z',end:'2026-10-08T07:00:00Z',text:'Loading a banked reset in paid accounts.',url:'https://x.com/thsottiaux/status/2107913674593644711'};
test('morning banked announcement and deadline reply remain visible over an older automatic completion',()=>{
 const source={id:'did',status:'ok',fetchedAt:stamp,updatedAt:stamp,maxAge:900000,forecast:{state:'none'},lastReset:{type:'global',at:'2026-10-07T03:35:09Z',text:'The reset has been processed.'},additionalForecasts:[announcement,{...announcement,id:'reply',issuedAt:'2026-10-07T19:19:33Z',text:'Will be there by EOD PST.',url:'https://x.com/thsottiaux/status/2107913738791596286'}]};
 const news=latestNews(source,now);assert.equal(news.text,'Will be there by EOD PST.');assert.equal(news.end,'2026-10-08T07:00:00Z');assert.equal(news.context.text,announcement.text);assert.equal(warning([source],null,null,3,now).active,false);
});
test('NextReset credit signal retains published time, reference deadline and banked classification',()=>{
 const source=normalize('next',{version:'NR',asOf:stamp,windows:[],state:'forecast',social:{classification:'credit',publishedAt:'2026-10-07T19:19:33Z',expectedBy:'2026-10-08T07:00:00Z',source:'https://x.com/thsottiaux/status/2107913738791596286'}},stamp);
 const news=latestNews(source,now);assert.equal(source.forecast.state,'none');assert.equal(news.type,'banked');assert.equal(news.end,'2026-10-08T07:00:00.000Z');assert.equal(warning([source],null,null,3,now).active,false);
});
test('newest signal wins without inventing a publication time or choosing a future-dated post',()=>{
 const news=latestNews({lastReset:{at:'2026-10-07T03:00:00Z',text:'old'},signals:[{at:'2026-10-07T19:20:00Z',text:'new',url:'https://x.com/thsottiaux/status/123'},{text:'undated'},{at:'2027-01-01T00:00:00Z',text:'future'}]},now);
 assert.equal(news.text,'new');assert.equal(news.url,'https://x.com/thsottiaux/status/123');
});
test('retired banked message keeps evidence but later banked completion replaces the pending headline',()=>{
 const source={archivedForecasts:[announcement],historyEvents:[{type:'banked',recordKind:'reset_completed',at:'2026-10-07T23:00:00Z',text:'Banked reset loaded.'}]};
 assert.equal(latestNews(source,now).recordKind,'reset_completed');
});
