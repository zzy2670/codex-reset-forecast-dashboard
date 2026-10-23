'use strict';
const {hypotheticalPace}=require('./ui/pace-timing.js');
const automatic=new Set(['reset','regular','global','automatic','global_and_banked','both','combined']);
const nonCompletion=new Set(['observation','commentary','repair','forecast','scheduled','hint']);
const MAX_IDS=512;
function completedGlobal(record,now){
 const at=Date.parse(record?.at),plans=record?.scope?.plans;
 return automatic.has(record?.type)&&!record?.evidenceOnly&&!nonCompletion.has(record?.phase)&&Number.isFinite(at)&&at<=now&&(!plans?.length||plans.includes('all'));
}
function originalPostId(record){
 try{
  const url=new URL(record.url);
  return url.protocol==='https:'&&!url.username&&!url.password&&['x.com','twitter.com'].includes(url.hostname)?url.pathname.match(/^\/[^/]+\/status\/(\d+)\/?$/)?.[1]||null:null;
 }catch{return null;}
}
function initializeCalendarResets(state,now=Date.now()){
 if(!state||typeof state!=='object'||!Number.isFinite(now))return false;
 if(state.calendarResets?.version===1&&Array.isArray(state.calendarResets.processedIds))return false;
 const rows=(Array.isArray(state.history)?state.history:[]).filter(row=>completedGlobal(row,now)&&originalPostId(row)&&hypotheticalPace(null,1,now,[row]).available).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
 state.calendarResets={version:1,processedIds:[...new Set(rows.map(originalPostId))].slice(-MAX_IDS),latestAt:rows.length?new Date(Date.parse(rows.at(-1).at)).toISOString():null};
 return true;
}
function applyOfficialCalendarReset(state,consensus,now=Date.now()){
 const ignored={changed:false,cleared:false,id:null};
 if(!state||typeof state!=='object'||!Number.isFinite(now))return ignored;
 initializeCalendarResets(state,now);
 if(consensus?.state!=='confirmed'||!completedGlobal(consensus,now))return ignored;
 const id=originalPostId(consensus);if(!id||state.calendarResets.processedIds.includes(id))return ignored;
 const at=Date.parse(consensus.at),previous=Date.parse(state.calendarResets.latestAt),newer=!Number.isFinite(previous)||at>previous;
 state.calendarResets.processedIds=[...state.calendarResets.processedIds,id].slice(-MAX_IDS);
 if(newer)state.calendarResets.latestAt=new Date(at).toISOString();
 const target=state.settings?.calendarTarget,createdAt=Date.parse(target?.createdAt);
 const cleared=!!target&&newer&&(!Number.isFinite(createdAt)||at>createdAt);
 if(cleared){delete state.settings.calendarTarget;state.calendarResetClearedBy=id;}
 return {changed:true,cleared,id};
}
module.exports={initializeCalendarResets,applyOfficialCalendarReset};
