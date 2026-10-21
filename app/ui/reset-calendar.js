(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ResetCalendar=api;})(globalThis,()=>{
 'use strict';
 const DAY=86400000,OFFSET=8*3600000;
 function timestamp(value){
  if(typeof value==='string'&&!/^\d{4}-\d{2}-\d{2}$/.test(value)&&!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value))return NaN;
  const at=typeof value==='number'?value:value instanceof Date?value.getTime():typeof value==='string'?Date.parse(value):NaN;
  return Number.isFinite(at)&&Number.isFinite(new Date(at).getTime())?at:NaN;
 }
 const keyOf=day=>new Date(day*DAY).toISOString().slice(0,10);
 function dateKey(value){
  const at=timestamp(value);if(!Number.isFinite(at))throw new Error('Invalid date');
  return keyOf(Math.floor((at+OFFSET)/DAY));
 }
 function dayNumber(key){
  if(typeof key!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(key))return NaN;
  const at=Date.parse(`${key}T00:00:00.000Z`);
  return Number.isFinite(at)&&keyOf(at/DAY)===key?at/DAY:NaN;
 }
 function bounds(now){
  const at=timestamp(now);if(!Number.isFinite(at))throw new Error('Invalid date');
  const today=Math.floor((at+OFFSET)/DAY);return {at,today,start:today-42,end:today+7};
 }
 function postKey(value){
  try{
   const url=new URL(value);
   if(url.protocol!=='https:'||url.username||url.password)return null;
   const post=['x.com','twitter.com','www.x.com','www.twitter.com'].includes(url.hostname)&&url.pathname.match(/^\/[^/]+\/status\/(\d+)\/?$/);
   if(post)return `post:${post[1]}`;
   url.hash='';return `url:${url.href}`;
  }catch{return null;}
 }
 function historyEvents(history,range){
  const rows=(Array.isArray(history)?history:[]).filter(record=>{
   const at=timestamp(record?.at),day=Math.floor((at+OFFSET)/DAY);
   return Number.isFinite(at)&&at<=range.at&&day>=range.start&&day<=range.today;
  });
  // IDs and original-post URLs are aliases. Merge both transitively so source
  // copies cannot create a second event even when they use different row IDs.
  const parent=rows.map((_,i)=>i),aliases=new Map();
  const find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
  rows.forEach((row,i)=>{
   const keys=[row.id===undefined||row.id===null||String(row.id)===''?null:`id:${row.id}`,postKey(row.url)].filter(Boolean);
   for(const key of keys){if(aliases.has(key))parent[find(i)]=find(aliases.get(key));else aliases.set(key,i);}
  });
  const selected=new Map();rows.forEach((row,i)=>{const root=find(i);if(!selected.has(root))selected.set(root,row);});
  return [...selected.values()].map(row=>{
   const at=timestamp(row.at),clock=new Date(at+OFFSET).toISOString().slice(11,16);
   return {...row,id:String(row.id??postKey(row.url)??`${row.type||'reset'}:${at}`),time:clock,scope:row.scope??null};
  }).sort((a,b)=>timestamp(a.at)-timestamp(b.at)||a.id.localeCompare(b.id));
 }
 function calendar(history,now=Date.now()){
  const range=bounds(now),byDay=new Map();
  for(const event of historyEvents(history,range)){const key=dateKey(event.at);if(!byDay.has(key))byDay.set(key,[]);byDay.get(key).push(event);}
  const leading=(new Date(range.start*DAY).getUTCDay()+6)%7,cells=[];
  for(let i=0;i<56;i++){
   const day=range.start+i-leading;
   if(day<range.start||day>range.end){cells.push({key:null,day:null,month:null,inRange:false,future:false,today:false,events:[]});continue;}
   const key=keyOf(day),date=new Date(day*DAY);
   cells.push({key,day:date.getUTCDate(),month:date.getUTCMonth()+1,inRange:true,future:day>range.today,today:day===range.today,events:byDay.get(key)||[]});
  }
  return {start:keyOf(range.start),end:keyOf(range.end),today:keyOf(range.today),cells};
 }
 function targetForDay(key,hour,now=Date.now()){
  const range=bounds(now),day=dayNumber(key);
  if(!Number.isFinite(day)||day<=range.today||day>range.end)throw new Error('Invalid day');
  if(!Number.isInteger(hour)||hour<0||hour>23)throw new Error('Invalid hour');
  return new Date(day*DAY-OFFSET+hour*3600000).toISOString();
 }
 function daysForTarget(anchor,day,hour,now=Date.now()){
  const at=timestamp(anchor),current=timestamp(now);
  if(!Number.isFinite(at)||!Number.isFinite(current)||at>current){const error=new Error('No reset anchor');error.code='NO_ANCHOR';throw error;}
  let targetAt;
  try{targetAt=targetForDay(day,hour,now);}catch{const error=new Error('Invalid target');error.code='INVALID_TARGET';throw error;}
  const days=(Date.parse(targetAt)-at)/DAY;
  if(!Number.isFinite(days)||days<=0||days>365){const error=new Error('Invalid period');error.code='INVALID_PERIOD';throw error;}
  return {days,targetAt};
 }
 return {dateKey,calendar,targetForDay,daysForTarget};
});
