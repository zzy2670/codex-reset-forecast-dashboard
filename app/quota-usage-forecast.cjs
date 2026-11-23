'use strict';

const minute = 60000;
const day = 1440 * minute;
const validOwner = owner => typeof owner === 'string' && /^[a-f0-9]{64}$/i.test(owner);
const validUsage = used => Number.isFinite(used) && used >= 0 && used <= 100;

function rememberUsage(state, rows, now) {
 const recent = (Array.isArray(state.recentQuotaUsage) ? state.recentQuotaUsage : [])
  .filter(row => Date.parse(row.fetchedAt) >= now - day);
 const key = row => JSON.stringify([row.accountFingerprint, row.bucketId, row.windowKey, row.resetsAt, row.fetchedAt]);
 const readings = new Map(recent.map(row => [key(row), row]));
 for (const row of rows) {
  if (!validOwner(row.accountFingerprint) || state.ambiguousAccountOwners?.[row.accountFingerprint]) continue;
  const { accountFingerprint, bucketId, windowKey, resetsAt, fetchedAt, remainingPercent } = row;
  readings.set(key(row), { accountFingerprint, bucketId, windowKey, resetsAt, fetchedAt, used: 100 - remainingPercent });
 }
 state.recentQuotaUsage = [...readings.values()].sort((a,b)=>Date.parse(a.fetchedAt)-Date.parse(b.fetchedAt)).slice(-12000);
}

function forecastUsage(state, window, now, timeZone = 'Asia/Shanghai') {
 const { accountFingerprint, bucketId, key, resetsAt, fetchedAt, usedPercent } = window || {};
 const end = Date.parse(resetsAt), latest = Date.parse(fetchedAt);
 if (!validOwner(accountFingerprint) || state.ambiguousAccountOwners?.[accountFingerprint] ||
     state.paused || !validUsage(usedPercent) || !(end > now) || !(latest <= now && now - latest <= 2 * minute)) return null;
 const date = new Intl.DateTimeFormat('en-CA', { timeZone, year:'numeric', month:'numeric', day:'numeric' });
 const today = date.format(now);
 if (date.format(latest) !== today) return null;
 const rows = (Array.isArray(state.recentQuotaUsage) ? state.recentQuotaUsage : [])
  .filter(row => row.accountFingerprint === accountFingerprint && row.bucketId === bucketId &&
   row.windowKey === key && row.resetsAt === resetsAt && validUsage(row.used))
  .map(row => ({ at:Date.parse(row.fetchedAt), used:row.used }))
  .filter(row => row.at >= latest - 90 * minute && row.at < latest && date.format(row.at) === today)
  .sort((a,b)=>a.at-b.at);
 rows.push({at:latest, used:usedPercent});
 const increases = [];
 for (let i = 1; i < rows.length; i++) {
  const before=rows[i-1], after=rows[i], difference=after.used-before.used;
  if (difference < 0 || after.at-before.at > 20*minute) increases.length=0;
  if (difference > 0 && after.at-before.at <= 20*minute) increases.push({before,after});
 }
 const last = increases.at(-1);
 if (!last || now-last.after.at >= 20*minute) return null;
 let first = increases.length-1;
 while (first>0 && increases[first].after.at-increases[first-1].after.at<=20*minute) first--;
 const start=increases[first].before, span=last.after.at-start.at;
 if (increases.length-first<2 || span<15*minute) return null;
 const rate=(last.after.used-start.used)/span;
 const emptyAt=latest+(100-usedPercent)/rate;
 return {percent:Math.min(100,usedPercent+rate*(end-latest)), emptyAt:emptyAt<=end?new Date(emptyAt).toISOString():null,
  validUntil:Math.min(end,latest+2*minute,last.after.at+20*minute)};
}

module.exports={rememberUsage,forecastUsage};
