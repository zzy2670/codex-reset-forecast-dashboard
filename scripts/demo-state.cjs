'use strict';
const {SOURCES}=require('../app/core.cjs');
const demoNow=Date.parse('2026-10-11T08:00:00+08:00');
function makeDemo(now=demoNow,{alert=false,range=false}={}){
 const iso=ms=>new Date(ms).toISOString(),anchor=now-48*3600000;
 const proof=SOURCES.slice(0,4).map(s=>({id:s.id,name:s.name,family:s.family,url:s.url,at:iso(anchor)}));
 const makeForecast=(s,h)=>({id:`demo-${s.id}`,state:'scheduled',type:'global',kindLabel:'全局重置',timingKind:'announcement',precision:'point',start:iso(now+h*3600000),end:iso(now+h*3600000),issuedAt:iso(now-600000),scope:{plans:['all']},url:s.url,text:'DEMO: synthetic timed reset announcement. This is not a live forecast.',basis:'Synthetic demonstration; no forecast accuracy claim.'});
 const sources=SOURCES.map((s,i)=>({...s,status:'ok',updatedAt:iso(now),fetchedAt:iso(now),expiresAt:null,forecast:alert&&i<3?makeForecast(s,range&&i===2?12:6):{state:'none'},lastReset:{id:'demo-completed',at:iso(anchor),url:s.url,text:'DEMO: synthetic public completion record.',type:'global'},notes:[s.familyLabel,'Demonstration data — open the live application for current evidence.'],signals:[],probabilities:[],additionalForecasts:[],historyEvents:[]}));
 const quotaDisplay={id:'codex',name:'Codex',durationMins:10080,remainingPercent:58,usedPercent:42,planType:'pro',resetsAt:iso(now+5*86400000),fetchedAt:iso(now),stale:false,resetCredits:null,ordinaryUsageAllowed:true};
 return {settings:{language:'en',notify:false,sound:false,closeToTray:true,autoStart:false,theme:'dark',hypotheticalDays:3,bodyFontSize:13,barOrder:['actual','hypothetical','theory'],quotaLimitId:'codex',quotaWindow:'secondary'},sources,consensus:{state:'confirmed',at:iso(anchor),sources:proof,timeBasis:'announcement',url:SOURCES[0].url,message:'Three independent collection chains agree on this synthetic completion record.'},quotaDisplay,quota:{state:'ok',limits:[{id:'codex',name:'Codex',secondary:quotaDisplay}]},events:[],paused:false,refreshing:false,version:'2.0.0',notificationStatus:'Demonstration mode — notifications disabled.',history:[0,1,2].map((_,i)=>({id:`demo-history-${i}`,at:iso(anchor-i*3*86400000),type:i===1?'banked':'global',timeBasis:'announcement',scope:{plans:['all']},text:'DEMO: illustrative completion record, not live history.',sources:proof,familyCount:3,url:SOURCES[0].url}))};
}
module.exports={makeDemo,demoNow};
