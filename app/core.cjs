'use strict';
const {isFresh,forecastState,projectForecasts}=require('./ui/pace-timing.js');
const {projectSourceHistory}=require('./history-events.cjs');

const SOURCES = [
  { id: 'codex', name: 'Codex Reset', url: 'https://codex-reset.com/zh/', api: 'https://codex-reset.com/api/forecast', family: 'codex-reset', familyLabel: '独立采集 · Codex Reset', interval: 30000, maxAge: 900000, color: '#3478f6', symbol: 'C' },
  { id: 'did', name: 'Did Codex Reset', url: 'https://didcodexreset.com/zh.html', api: 'https://didcodexreset.com/openapi/v1/records?page=1&pageSize=10', family: 'didcodexreset', familyLabel: '独立采集 · Did Codex Reset', interval: 185000, maxAge: 900000, color: '#158a76', symbol: 'D' },
  { id: 'next', name: 'NextReset', url: 'https://nextreset.ai/', api: 'https://nextreset.ai/api/forecast', family: 'codex-resets-feed', familyLabel: '上游 · Codex Resets', interval: 30000, maxAge: 900000, color: '#805bd5', symbol: 'N' },
  { id: 'tibo', name: 'TIBO', url: 'https://tibo.cc/', api: 'https://tibo.cc/api/v1/status', family: 'codex-resets-feed', familyLabel: '与 NextReset 共用上游', interval: 30000, maxAge: 900000, color: '#bd8435', symbol: 'T' },
  { id: 'today', name: 'Codex Reset Today', url: 'https://codex-reset.today/', api: 'https://codex-reset.today/api/v1/status', family: 'unverified-feed', familyLabel: '采集独立性未验证', interval: 30000, maxAge: 900000, color: '#64828d', symbol: 'R' }
];
const iso = v => v && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null;
const clean = (v, max = 1800) => typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c]/g, '').slice(0, max) : '';
const asPercent = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100 ? Math.round(v) : null;
const safeUrl = v => {
  try { const u = new URL(v); return u.protocol === 'https:' && !u.username && !u.password ? u.href : null; } catch { return null; }
};
const postId = u => safeUrl(u)?.match(/(?:x\.com|twitter\.com)\/[^/]+\/status\/(\d+)/)?.[1] || null;
const isAutomatic = type => ['reset', 'regular', 'global', 'automatic', 'global_and_banked', 'both', 'combined'].includes(type);
const kindName = type => isAutomatic(type) ? '全局重置' : type === 'banked' ? '重置卡' : '范围待核实';

function recordMetadata(record){
 const result={};
 if(['observation','commentary','repair','completion'].includes(record?.phase))result.phase=record.phase;
 if(typeof record?.evidenceOnly==='boolean')result.evidenceOnly=record.evidenceOnly;
 if(record?.completionRecordId!==undefined)result.completionRecordId=String(record.completionRecordId);
 if(Array.isArray(record?.relatedRecordIds))result.relatedRecordIds=record.relatedRecordIds.map(String);
 return result;
}
function event({ id, at, url, text, type = 'global', scope = null, timeBasis = 'announcement',...metadata }) {
  if (!iso(at)) return null;
  return { id: String(postId(url) || id || at), at: iso(at), url: safeUrl(url), text: clean(text), type, kindLabel: kindName(type), scope, timeBasis,...recordMetadata(metadata) };
}
function forecast(data, now) {
  if (!data) return { state: 'none', start: null, end: null, url: null, text: '', type: null, id: null };
  const start = iso(data.start), end = iso(data.end);
  const stale = Date.parse(end || start) <= now;
  const invalid = start && end && Date.parse(start)>Date.parse(end);
  return { id: String(postId(data.url) || data.id || `${start}:${end}:${clean(data.text, 100)}`), state: invalid ? 'invalid' : start || end ? (stale ? 'elapsed' : 'scheduled') : 'untimed',
    start, end, precision: data.precision || (start && end && start !== end ? 'window' : 'deadline'),
    text: clean(data.text), url: safeUrl(data.url), type: data.type || 'global', kindLabel: kindName(data.type || 'global'),
    scope: data.scope || null, timeZone:clean(data.timeZone,100)||null, timeSource:clean(data.timeSource,160)||null, sourceTimeVerified:typeof data.sourceTimeVerified==='boolean'?data.sourceTimeVerified:null, timeInterpretation:clean(data.timeInterpretation)||null, originalText:clean(data.originalText)||null, timingKind:data.timingKind || 'announcement', basis: clean(data.basis || '站方时间解释；请核对原帖'), issuedAt: iso(data.issuedAt), confidence: data.confidence ?? null };
}

// Use only named schedule fields. Publication/update timestamps never become an ETA.
function scheduleFields(s) {
  const w = s?.window || s?.deliveryWindow || s?.scheduleWindow || {};
  return { start: w.startAt || w.start_at || w.start || s?.window_start || s?.windowStart || s?.startsAt,
    end: w.endAt || w.end_at || w.end || w.deadline || s?.window_end || s?.windowEnd || s?.deadline || s?.scheduled_for || s?.expected_by || s?.expectedBy || s?.expectedAt || s?.scheduledAt };
}

function normalize(id, raw, fetchedAt = new Date().toISOString()) {
  const spec = SOURCES.find(s => s.id === id);
  if (!spec) throw new Error('未知信源');
  const now = Date.parse(fetchedAt);
  let updatedAt, expiresAt = null, stale = false, last = null, upcoming = null, probabilities = [], notes = [], signals = [], model = '', historyEvents = [], additionalForecasts = [], archivedForecasts = [], dispositions = [];
  if (id === 'codex') {
    if (!raw || !('mode' in raw) || !('last_reset_at' in raw)) throw new Error('站方数据格式已变化');
    updatedAt = iso(raw.updated_at);
    const a = raw.latest_alert;
    const source = raw.evidence?.find(e => e.code === 'last_reset');
    const lastUrl = a?.kind === 'reset' && a?.state === 'confirmed' ? a.url : source?.href;
    last = event({ ...recordMetadata(a?.kind==='reset'?a:source),id: postId(lastUrl), at: raw.last_reset_at, url: lastUrl, text: a?.state === 'confirmed' && a?.kind === 'reset' ? a.summary : '站方收录的最近全局重置', type: 'global' });
    const s = raw.official_signal || raw.teased_window || (a && a.kind === 'watch' && !a.corrected && a.state === 'active' ? a : null);
    if (s && typeof s === 'object' && !(iso(s.at || s.source_at) && Date.parse(raw.last_reset_at) >= Date.parse(s.at || s.source_at))) upcoming = { ...scheduleFields(s), timeZone:s.window?.time_zone || s.window?.timeZone, timeSource:raw.official_signal?'official_signal.window':raw.teased_window?'teased_window.window':'latest_alert.window', sourceTimeVerified:typeof s.source_time_verified==='boolean'?s.source_time_verified:null, id: s.tweet_id || s.id || raw.alert_event_id, text: s.localized_summary || s.text || s.summary || s.quote, url: s.url || s.source_url, issuedAt: s.at || s.source_at, type: s.reset_type || 'global',scope:s.scope, confidence: s.score, timingKind:!raw.official_signal && raw.teased_window ? 'hint' : 'announcement',basis: !raw.official_signal && raw.teased_window ? '站方从暗示推断的观察窗口，非明确承诺' : 'Codex Reset 公告窗口；概率为站方评分' };
    if (raw.tease_signal?.post) signals.push({ text: clean(raw.tease_signal.post.localized_quote || raw.tease_signal.post.quote), url: safeUrl(raw.tease_signal.post.url), at: iso(raw.tease_signal.post.at) });
    probabilities = [24, 48].map(h => ({ hours: h, value: asPercent(raw.probabilities?.[`rounded_${h}h`]) })).filter(p => p.value !== null);
    model = raw.mode === 'model' ? '历史频率模型' : '公告信号评分';
    notes.push(raw.context?.state === 'QUIET' ? '最近一次重置后，未收录新的明确重置承诺。' : clean(raw.context_copy?.text || raw.context_copy || raw.context?.state));
    if (raw.time_window) notes.push('历史高发时段只供参考，不用作下一次重置时间。');
    if (a?.corrected) notes.push('站方已更正最近一条预警，请核对原文。');
  } else if (id === 'did') {
    if (!raw?.ok || !Array.isArray(raw?.data?.items)) throw new Error('站方数据格式已变化');
    updatedAt = iso(raw.meta?.lastSuccessfulCheckAt || raw.meta?.generatedAt);
    const items = raw.data.items;
    historyEvents = items.filter(i => i.kind === 'reset_completed').map(i => {const e=event({...recordMetadata(i),id:i.id,at:i.effectiveAt || i.announcedAt || i.completedAt,url:i.source?.url,text:i.text,type:i.resetType || 'unknown',scope:i.scope,timeBasis:i.effectiveAt ? 'effective' : 'announcement'});return e?{...e,recordKind:i.kind,relatedRecordIds:i.relatedRecordIds||[]}:null;}).filter(Boolean);
    const completed = items.filter(i => i.kind === 'reset_completed' && isAutomatic(i.resetType) && (!i.scope?.plans?.length || i.scope.plans.includes('all')));
    completed.sort((a,b) => Date.parse(b.effectiveAt || b.announcedAt) - Date.parse(a.effectiveAt || a.announcedAt));
    const c = completed[0];
    if (c) last = event({ ...recordMetadata(c),id: c.id, at: c.effectiveAt || c.announcedAt, url: c.source?.url, text: c.text, type: c.resetType, scope: c.scope, timeBasis: c.effectiveAt ? 'effective' : 'announcement' });
    const linkedCompleted = new Set(projectSourceHistory({historyEvents}).historyEvents.filter(i=>isAutomatic(i.type)).flatMap(i=>i.relatedRecordIds||[]).map(String));
    const retired=i=>['fulfilled','cancelled','revoked'].includes(i.scheduleState)||i.completionRecordId||iso(i.completedAt)||linkedCompleted.has(String(i.id))||linkedCompleted.has(String(i.source?.postId));
    const dispositionsRaw=items.filter(i=>i.kind==='reset_scheduled'&&retired(i));
    dispositions=dispositionsRaw.map(i=>({...forecast({id:i.id,precision:i.scheduleConstraint==='deadline'?'deadline':i.schedulePrecision==='datetime'?'point':'window',timeZone:i.scheduleTimezone,timeSource:i.scheduleTimingSource,sourceTimeVerified:typeof i.sourceTimeVerified==='boolean'?i.sourceTimeVerified:null,start:i.scheduleWindow?.startAt,end:i.scheduleWindow?.endAt||i.effectiveAt,text:i.text,url:i.source?.url,type:i.resetType || 'unknown',scope:i.scope,issuedAt:i.announcedAt,basis:i.scheduleBasis==='explicit'?'站方解析公告时间':'站方根据上下文推断'},now),outcome:['cancelled','revoked'].includes(i.scheduleState)?i.scheduleState:'fulfilled'}));
    const schedules = items.filter(i => i.kind === 'reset_scheduled' && !retired(i));
    const scheduleRank=s=>{const start=Date.parse(s.scheduleWindow?.startAt),end=Date.parse(s.scheduleWindow?.endAt||s.effectiveAt||s.scheduleWindow?.startAt);return isAutomatic(s.resetType)?(end>now&&(!Number.isFinite(start)||start<=end)?0:1):2;};
    schedules.sort((a,b)=>scheduleRank(a)-scheduleRank(b)||(Date.parse(a.scheduleWindow?.startAt||a.scheduleWindow?.endAt||a.effectiveAt)||Infinity)-(Date.parse(b.scheduleWindow?.startAt||b.scheduleWindow?.endAt||b.effectiveAt)||Infinity));
    const s = schedules[0];
    if (s) upcoming = { id: s.id, timeZone:s.scheduleTimezone,timeSource:s.scheduleTimingSource,sourceTimeVerified:typeof s.sourceTimeVerified==='boolean'?s.sourceTimeVerified:null, start: s.scheduleWindow?.startAt, end: s.scheduleWindow?.endAt || s.effectiveAt, precision: s.scheduleConstraint === 'deadline' ? 'deadline' : s.schedulePrecision === 'datetime' ? 'point' : 'window', text: s.text, url: s.source?.url, type: s.resetType || 'unknown', scope:s.scope, issuedAt: s.announcedAt, basis: s.scheduleBasis === 'explicit' ? '站方解析公告时间' : '站方根据上下文推断', confidence: s.confidence };
    additionalForecasts=schedules.slice(1).map(s=>forecast({id:s.id,precision:s.scheduleConstraint==='deadline'?'deadline':s.schedulePrecision==='datetime'?'point':'window',timeZone:s.scheduleTimezone,timeSource:s.scheduleTimingSource,sourceTimeVerified:typeof s.sourceTimeVerified==='boolean'?s.sourceTimeVerified:null,start:s.scheduleWindow?.startAt,end:s.scheduleWindow?.endAt||s.effectiveAt,type:s.resetType || 'unknown',scope:s.scope,text:s.text,url:s.source?.url,issuedAt:s.announcedAt,basis:s.scheduleBasis==='explicit'?'站方解析公告时间':'站方根据上下文推断',timingKind:s.scheduleBasis==='explicit'?'announcement':'inferred'},now));
    if(upcoming)upcoming.timingKind=s.scheduleBasis==='explicit'?'announcement':'inferred';
    signals = schedules.slice(1, 4).map(s => ({ text: clean(s.text), url: safeUrl(s.source?.url), at: iso(s.announcedAt) }));
    notes.push(s ? '排期是否兑现，以后续完成记录为准。' : '当前公开列表没有待执行的重置排期。', '该源接口限流，最小间隔185秒，自动检查通常每约3.5分钟获取一次。');
  } else if (id === 'next') {
    if (!raw?.version || !Array.isArray(raw.windows)) throw new Error('站方数据格式已变化');
    updatedAt = iso(raw.asOf); expiresAt = iso(raw.expiresAt);
    stale = raw.degraded === true || raw.checks?.history?.ok === false;
    const l = raw.history?.last;
    if (l) last = event({ ...recordMetadata(l),at: l.date, url: l.source, type: l.type, scope:l.scope, text: l.description || l.title });
    const s = raw.social;
    if (s && typeof s === 'object') {
      const signal = { ...scheduleFields(s), timeZone:s.timezone || s.timeZone || s.scheduleTimezone,timeSource:s.timingKind,sourceTimeVerified:s.timingKind==='feed_deadline'?false:typeof s.sourceTimeVerified==='boolean'?s.sourceTimeVerified:null,timeInterpretation:s.interpretation, id: s.id || s.postId, text: s.text || s.quote || s.summary, url: s.url || s.source?.url || (typeof s.source === 'string' ? s.source : null), issuedAt: s.announced_at || s.publishedAt, type: s.reset_type || 'global',scope:s.scope,timingKind:['next_week','feed_deadline'].includes(s.timingKind)?'inferred':'announcement', basis: s.timingKind === 'next_week' ? '站方按太平洋日历推断的下周窗口，非原帖明确时刻' : s.timingKind === 'feed_deadline' ? '上游换算的参考截止时间，原帖时区解释待核实' : 'NextReset 对公开信号的解释，非已验证的预测准确率' };
      if (['announced','awaiting_confirmation'].includes(raw.state) && !['hint','negative','credit'].includes(s.classification)) upcoming = signal;
      else signals.push({ text: clean(signal.text || ({hint:'仅有暗示，未形成明确承诺。',negative:'最新信号降低重置预期。',credit:'最新信号涉及重置卡。'}[s.classification] || '其他公开信号，未形成明确排期。')), url: safeUrl(signal.url), at: iso(signal.issuedAt), type:s.classification==='credit'?'banked':'signal', start:iso(signal.start),end:iso(signal.end),basis:signal.basis });
      if (s.carriedFromLastGoodCheck || raw.checks?.social?.ok === false) { stale = true; notes.push('公告采集检查失败，原信号需重新核实。'); }
    }
    probabilities = raw.windows.map(w => ({ hours: w.hours, value: asPercent(typeof w.probability === 'number' ? w.probability * 100 : null) })).filter(p => p.value !== null);
    model = clean(raw.version);
    notes.push('概率模型仍属实验；公告加权未经历史校准。', '与 TIBO 共用 Codex Resets 上游，不重复计为独立佐证。');
  } else if (id === 'tibo') {
    if (!raw?.data || !('scheduled_reset' in raw.data)) throw new Error('站方数据格式已变化');
    updatedAt = iso(raw.last_successful_update || raw.fetched_at); expiresAt = iso(raw.fresh_until); stale = raw.stale === true;
    const l = raw.data.latest_reset;
    if (l && isAutomatic(l.reset_type)) last = event({ ...recordMetadata(l),id: l.id, at: l.announced_at, text: l.translation?.text || l.text, url: l.source?.url, type: l.reset_type, scope:l.scope });
    const s = raw.data.scheduled_reset;
    const assessment = raw.time_assessment;
    if (s && !assessment?.timeline_relation?.retires_current_schedule) upcoming = { id: s.id, timeZone:assessment?.calculation_timezone,timeSource:assessment?.timestamp_origin || assessment?.timezone_basis,sourceTimeVerified:typeof assessment?.source_time_verified==='boolean'?assessment.source_time_verified:null,timeInterpretation:assessment?.reason,originalText:s.text,timingKind:assessment?.source_time_verified===false || assessment?.text_time_assessment?.state==='needs_review'?'inferred':'announcement', start: assessment?.window_start, end: assessment?.window_end || s.scheduled_for, text: s.translation?.text || s.text, url: s.source?.url, type: s.reset_type,scope:s.scope, issuedAt: s.announced_at, basis: assessment?.reason || '上游预告，时间精度以原帖为准' };
    if (raw.data.active_watch) signals.push({ text: clean(raw.data.active_watch.text), url: safeUrl(raw.data.active_watch.source?.url), at: iso(raw.data.active_watch.observed_at) });
    notes.push('保留预告、观察窗口及来源；全天窗口不代表具体小时。', '与 NextReset 共用上游。');
  } else if (id === 'today') {
    if (!raw?.data?.next_reset_estimate) throw new Error('站方数据格式已变化');
    updatedAt = iso(raw.data.freshness?.fetched_at || raw.meta?.generated_at); stale = raw.data.freshness?.state !== 'fresh';
    const l = raw.data.latest_reset;
    if (l && isAutomatic(l.reset_type)) last = event({ ...recordMetadata(l),id: l.id, at: l.announced_at, url: l.source?.url, text: l.text, type: l.reset_type, scope:l.scope });
    const e = raw.data.next_reset_estimate;
    const s = raw.data.active_watch;
    if (s || e.expected_by) upcoming = { id: s?.id, ...scheduleFields(s), end: e.expected_by || scheduleFields(s).end, text: s?.text || e.note, url: s?.source?.url, type: s?.reset_type || 'global',scope:s?.scope,timingKind:s?'announcement':'model', basis: '只有明确公开时间才展示 ETA' };
    // A probability horizon is not an event ETA.
    probabilities = [{ hours: e.forecast_window_hours || 48, value: asPercent(e.chance_percent) }].filter(p => p.value !== null);
    model = '站方情境模型'; notes.push('概率统计窗口的结束时间不是重置截止时间。', '采集独立性未验证，不用于增加独立佐证数量。');
  }
  if (!updatedAt) throw new Error('缺少数据更新时间，暂不作为实时证据');
  // Old schedules may remain pending in upstream APIs. Never present them as next.
  const candidates=[forecast(upcoming,now),...additionalForecasts].filter(f=>f.state!=='none');
  archivedForecasts=[...candidates.filter(f=>forecastState(f,now)==='elapsed').map(f=>({...f,retiredReason:'expired'})),...dispositions.map(f=>({...f,retiredReason:f.outcome}))];
  const active=candidates.filter(f=>forecastState(f,now)!=='elapsed');
  const primary=active.find(f=>isAutomatic(f.type)&&f.state==='scheduled')||active.find(f=>isAutomatic(f.type));
  additionalForecasts=active.filter(f=>f!==primary);
  const sourceStale = stale || now - Date.parse(updatedAt) > spec.maxAge || (expiresAt && now > Date.parse(expiresAt));
  return projectForecasts(projectSourceHistory({ ...spec, status: sourceStale ? 'stale' : 'ok', fetchedAt: iso(fetchedAt), updatedAt, expiresAt, error: null, lastReset: last, forecast: primary||forecast(null,now), probabilities, notes: notes.filter(Boolean), signals, model, historyEvents, additionalForecasts, archivedForecasts, dispositions, nextCheckAt: new Date(now + spec.interval).toISOString() }),now);
}

function freshness(source, now = Date.now()) {
  return isFresh(source,now);
}
function calibratedReset(sources, now = Date.now()) {
  sources=sources.map(projectSourceHistory);
  const candidates = sources.filter(s => freshness(s, now) && s.lastReset && isAutomatic(s.lastReset.type) && (!s.lastReset.scope?.plans?.length||s.lastReset.scope.plans.includes('all')) && Date.parse(s.lastReset.at) <= now + 60000);
  if (!candidates.length) return { state: 'unavailable', at: null, sources: [], familyCount: 0, message: '等待可靠的完成记录' };
  const sorted = [...candidates].sort((a,b) => Date.parse(b.lastReset.at) - Date.parse(a.lastReset.at));
  const chosen = sorted[0].lastReset;
  const group = candidates.filter(s => (postId(s.lastReset.url) && postId(s.lastReset.url) === postId(chosen.url)) || (s.lastReset.id === chosen.id && s.lastReset.id));
  const independent = new Set(group.filter(s => s.family !== 'unverified-feed' && postId(s.lastReset.url)).map(s => s.family));
  const times = group.map(s => Date.parse(s.lastReset.at));
  const conflict = times.length > 1 && Math.max(...times)-Math.min(...times) > 120000;
  const state = conflict ? 'conflict' : independent.size >= 2 ? 'confirmed' : 'pending';
  return { state, ...chosen, sources: group.map(s => ({ id: s.id, name: s.name, at: s.lastReset.at, url: s.lastReset.url })), familyCount: independent.size,
    message: state === 'confirmed' ? `${independent.size} 条采集链记录一致` : state === 'conflict' ? '同一事件的时间记录有分歧' : '最新完成记录，等待另一采集链核对',
    semantics: chosen.timeBasis === 'effective' ? '站方记录的生效时间，非个人到账保证' : '公开完成公告时间，非个人到账时间' };
}

function forecastKey(f) { return f && f.state !== 'none' ? `${f.id}|${f.start || ''}|${f.end || ''}|${f.type || ''}|${[...(f.scope?.plans||[])].sort().join(',')}|${f.timingKind||'announcement'}` : null; }
function changes(previous, next, now = Date.now()) {
  if (!next || !freshness(next, now)) return [];
  next=projectSourceHistory(next);
  previous=projectSourceHistory(previous||{forecast:{state:'none'}});
  const all=s=>[s.forecast,...(s.additionalForecasts||[])].filter(f=>forecastKey(f));
  const events=[],old=all(previous),latest=all(next),before=new Set(old.map(forecastKey)),after=new Set(latest.map(forecastKey)),sent=new Set();
  for(const f of latest){
    const key=forecastKey(f);if(before.has(key)||sent.has(key)||f.timingKind==='hint'||['elapsed','invalid'].includes(forecastState(f,now)))continue;sent.add(key);
    const samePost=old.some(o=>o.id===f.id);
    events.push({key:`forecast:${key}`,transition:{entity:`forecast:${f.id}`,signature:key},kind:samePost?'time_changed':'forecast',title:samePost?'重置预告信息已更新':'发现新的重置预告',
      body:`${next.name}：${f.kindLabel||'重置'}。${f.timingKind==='hint'?'站方推断观察窗口，非明确承诺。':f.start||f.end?'已给出时间，点击查看。':'尚未给出具体时间。'}`,start:f.start,end:f.end,resetType:f.type,scope:f.scope,timingKind:f.timingKind,sourceId:next.id,url:f.url||next.url,at:new Date(now).toISOString()});
  }
  for(const f of old){
    const key=forecastKey(f);if(after.has(key)||latest.some(n=>n.id===f.id)||f.timingKind==='hint')continue;
    const disposition=next.dispositions?.find(d=>d.id===f.id),cancelled=['cancelled','revoked'].includes(disposition?.outcome);
    events.push({key:`${cancelled?'cancelled':'removed'}:${next.id}:${key}`,transition:{entity:`forecast:${f.id}`,signature:`${cancelled?'cancelled':'removed'}:${key}`},kind:cancelled?'cancelled':'removed',title:cancelled?'站方已撤销一条重置预告':'一条预告已从当前列表移除',body:cancelled?`${next.name} 已标记原预告取消或撤回，请按更新后的信息调整节奏。`:`${next.name} 暂未列出原预告，请查看后续确认；移除不等于取消。`,start:f.start,end:f.end,resetType:f.type,scope:f.scope,timingKind:f.timingKind,sourceId:next.id,url:disposition?.url||f.url||next.url,at:new Date(now).toISOString()});
  }
  const completions=s=>[s.lastReset,...(s.historyEvents||[])].filter(e=>e&&isAutomatic(e.type));
  const completionKey=e=>`${e.id}|${e.at}|${e.type}|${[...(e.scope?.plans||[])].map(p=>String(p).toLowerCase()).sort().join(',')}`;
  const completedBefore=new Set(completions(previous).map(completionKey)),completedSent=new Set();
  for(const e of completions(next)){
    const key=completionKey(e),at=Date.parse(e.at);
    if(completedBefore.has(key)||completedSent.has(key)||!Number.isFinite(at)||at>now+60000||at<now-86400000)continue;
    completedSent.add(key);
    events.push({key:`completion:${key}`,transition:{entity:`completion:${e.id}`,signature:key},kind:'confirmed',title:'信源报告重置已完成',body:`${next.name}：已收录重置完成记录。`,start:e.at,end:e.at,resetType:e.type,scope:e.scope,timingKind:'announcement',sourceId:next.id,url:e.url||next.url,at:new Date(now).toISOString()});
  }
  return events;
}

function quotaMath(quota, settings, now = Date.now()) {
  if (!quota || !Number.isFinite(quota.used) || !Number.isFinite(quota.total) || quota.total <= 0) return null;
  const cycleMs = (settings.cycleDays || 7) * 86400000;
  let end = iso(settings.manualResetAt) || iso(quota.resetAt);
  // Manual recurring cycle is intentional, while automatic expired data remains expired.
  if (settings.manualResetAt && end && Date.parse(end) <= now) end = new Date(Date.parse(end) + (Math.floor((now-Date.parse(end))/cycleMs)+1)*cycleMs).toISOString();
  const elapsed = end ? Math.min(1, Math.max(0, (now-(Date.parse(end)-cycleMs))/cycleMs)) : null;
  const actual = Math.min(1,Math.max(0, quota.used/quota.total));
  return { ...quota, remaining: Math.max(0,quota.total-quota.used), remainingPercent: Math.max(0,100-actual*100), actual,
    theoretical: elapsed, theoreticalUsed: elapsed === null ? null : quota.total*elapsed, delta: elapsed === null ? null : quota.used-quota.total*elapsed,
    resetAt: end, cycleDays: settings.cycleDays || 7, manual: !!settings.manualResetAt,
    stale: quota.state !== 'ok' || now-Date.parse(quota.fetchedAt) > 120000 || (!settings.manualResetAt && end && Date.parse(end) <= now) };
}
module.exports = { SOURCES, normalize, calibratedReset, changes, quotaMath, forecastKey, freshness, safeUrl, iso, clean };
