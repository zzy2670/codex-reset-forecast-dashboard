(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DashboardTimeZone=api;})(globalThis,()=>{
 'use strict';
 const DEFAULT='Asia/Shanghai',formatters=new Map(),zones=new Map();
 function valid(zone){
  if(typeof zone!=='string'||!zone||zone!==zone.trim()||/^[+-]/.test(zone))return false;
  if(zones.has(zone))return zones.get(zone)!==null;
  try{zones.set(zone,new Intl.DateTimeFormat('en',{timeZone:zone}).resolvedOptions().timeZone);return true;}catch{zones.set(zone,null);return false;}
 }
 function normalize(zone){return valid(zone)?zone:DEFAULT;}
 function timestamp(value){
  if(typeof value==='string'&&!/^\d{4}-\d{2}-\d{2}$/.test(value)&&!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value))return NaN;
  const at=typeof value==='number'?value:value instanceof Date?value.getTime():typeof value==='string'?Date.parse(value):NaN;
  return Number.isFinite(at)&&Number.isFinite(new Date(at).getTime())?at:NaN;
 }
 function formatter(zone){
  zone=normalize(zone);
  if(!formatters.has(zone))formatters.set(zone,new Intl.DateTimeFormat('en-GB-u-ca-gregory-nu-latn',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}));
  return formatters.get(zone);
 }
 function parts(value,zone=DEFAULT){
  const at=timestamp(value);if(!Number.isFinite(at))throw new Error('Invalid date');
  const result={};
  for(const part of formatter(zone).formatToParts(at))if(['year','month','day','hour','minute','second'].includes(part.type))result[part.type]=Number(part.value);
  return result;
 }
 const pad=value=>String(value).padStart(2,'0');
 const keyOf=value=>`${String(value.year).padStart(4,'0')}-${pad(value.month)}-${pad(value.day)}`;
 function dateKey(value,zone=DEFAULT){return keyOf(parts(value,zone));}
 function time(value,zone=DEFAULT){const p=parts(value,zone);return `${pad(p.hour)}:${pad(p.minute)}`;}
 function invalidTarget(){const error=new Error('Invalid target');error.code='INVALID_TARGET';return error;}
 function atLocal(day,hour,zone=DEFAULT){
  if(typeof day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isInteger(hour)||hour<0||hour>23)throw invalidTarget();
  const nominal=Date.parse(`${day}T${pad(hour)}:00:00.000Z`);
  if(!Number.isFinite(nominal)||new Date(nominal).toISOString().slice(0,10)!==day)throw invalidTarget();
  zone=normalize(zone);
  // Collect the offsets on both sides of a transition, then verify each local
  // clock exactly. This also handles half-hour changes and skipped civil dates.
  const offsets=new Set();
  for(let delta=-36*3600000;delta<=36*3600000;delta+=1800000){
   const sample=nominal+delta,p=parts(sample,zone);
   const local=Date.parse(`${keyOf(p)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}.000Z`);
   offsets.add(local-sample);
  }
  const matches=[];
  for(const offset of offsets){
   const candidate=nominal-offset,p=parts(candidate,zone);
   if(keyOf(p)===day&&p.hour===hour&&p.minute===0&&p.second===0)matches.push(candidate);
  }
  if(!matches.length){const error=invalidTarget();error.reason='NONEXISTENT_HOUR';throw error;}
  return new Date(Math.min(...matches)).toISOString();
 }
 return {DEFAULT,valid,normalize,dateKey,time,parts,atLocal};
});
