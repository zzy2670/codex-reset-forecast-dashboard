'use strict';
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let zone = 'Asia/Shanghai';
let dateFormat = new Intl.DateTimeFormat('zh-CN',{timeZone:zone,month:'numeric',day:'numeric'});
let timeFormat = new Intl.DateTimeFormat('zh-CN',{timeZone:zone,hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
const period = mins => mins % 1440 === 0 ? `${mins/1440} 天` : mins % 60 === 0 ? `${mins/60} 小时` : `${mins} 分钟`;
const date = x => x && Number.isFinite(Date.parse(x)) ? new Date(x) : null;
const clock = x => date(x) ? timeFormat.format(date(x)) : '—';
const full = x => date(x) ? new Intl.DateTimeFormat(DashboardI18n.locale(state?.settings.language),{timeZone:zone,month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date(x)) : '时间未注明';
const precise = x => date(x) ? new Intl.DateTimeFormat(DashboardI18n.locale(state?.settings.language),{timeZone:zone,month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(date(x)) : '时间未注明';
const zoneName=()=>zone==='Asia/Shanghai'?'北京时间':zone;
const applyLocale=()=>DashboardI18n.apply(document,state?.settings.language||'zh-CN');
let state, toastTimer, detailsExpanded=false, temporalKey='',barDrag=null,barSaving=false,lastConnectionMarkup='';
function toast(message) { $('toast').textContent=message; $('toast').hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('toast').hidden=true,3600);applyLocale(); }
async function call(fn) { try { return await fn(); } catch(error) { toast(error.message?.replace(/^Error invoking remote method '[^']+': Error: /,'') || '操作未完成，请重试'); return null; } }
function isFresh(s) { return PaceTiming.isFresh(s); }
function scheduleLabel(f) {const status=PaceTiming.forecastState(f);return status==='invalid'?'时间待核实':status==='elapsed'?'时间已过':f.timingKind==='hint'?'观察窗口，非承诺':status==='untimed'?'时间未定':'待执行';}
function cardMarkup(s) {
  s=PaceTiming.projectForecasts(s);
  const raw=s.forecast||{state:'none'},remaining=PaceTiming.remainingSchedule(raw),f={...remaining,state:PaceTiming.forecastState(raw)},fresh=isFresh(s);
  const status={retrying:['重试中','warn'],ok:['已更新',''],stale:['待更新','warn'],error:['连接异常','error'],blocked:['已暂停','error'],loading:['读取中','muted']}[!fresh&&s.status==='ok'?'stale':s.status] || ['待更新','muted'];
  let value='无', valueClass='', note=s.archivedForecasts?.length?'旧排期时间已过或已有完成记录，尚无有效的下次预告':'尚无明确的下次重置预告';
  if (!fresh && f.state==='none') { value=s.status==='loading'?'读取中':'待核实'; valueClass='unknown'; note=s.error || '等待新数据，暂不判断是否有预告'; }
  else if(f.state==='invalid'){value='时间待核实';valueClass='unknown';note='站方窗口起止时间有矛盾，请核对原帖';}
  else if (f.state==='untimed') { value='时间未定'; valueClass='unknown'; note=`已收录${f.kindLabel || '重置'}预告，未给出具体时刻`; }
  else if(f.state==='elapsed'){note='旧预告时间已过，不作为下次重置预计';}
  else if(f.type==='banked'){note='仅有重置卡消息，尚无自动重置排期';}
  else if (f.state==='scheduled') {
    valueClass='scheduled';
    if (f.start && f.end && f.start!==f.end) value=`${esc(full(f.start))}<br><small>至 ${esc(full(f.end))}</small>`;
    else value=esc(full(f.end || f.start));
    note=f.state==='elapsed'?'预告时间已过，等待完成确认':`${f.kindLabel || '重置'} · ${f.precision==='point'?'预计时刻':f.start && f.end && f.start!==f.end?'预计窗口':'参考截止时间'}`;
    if(f.clippedStart)note+=' · 起点已过，只显示截止';
    if(f.resetGapClipped)note+=' · 默认间隔 6 小时，仅显示原截止';
    if(f.timingKind==='hint')note='站方推断的观察窗口 · 非明确承诺';
    const plans=f.scope?.plans;if(plans?.length&&!plans.includes('all'))note+=` · ${plans.map(p=>p.toUpperCase()).join('、')} 专属`;
    if (!fresh) note+=' · 数据待更新';
  }
  const p=fresh ? s.probabilities || [] : [];
  const probabilityHtml=p.length?`<div class="probabilities">${p.map(x=>`<span class="probability">${esc(x.hours)}h<b>${esc(x.value)}%</b></span>`).join('')}</div>`:'';
  const news=PaceTiming.latestNews(s);
  const text=f.state!=='none'?f.text || '站方已收录预告，请打开原站查看全文。':news?.context?`${news.context.text}\n\n${news.text}`:news?.text || s.lastReset?.text || s.error || '正在读取公开信息…';
  const hasOriginal=!!(f.state!=='none'?f.text:news?.text||s.lastReset?.text);
  const newsTime=news?.end||news?.start;
  const bankedNews=news?.type==='banked';
  const bankedHtml=bankedNews?`<div class="source-news"><strong>有重置卡消息</strong><p>${news.recordKind==='reset_completed'?`站方补发完成记录：${esc(full(news.at))}`:newsTime?`站方参考截止：${esc(full(newsTime))}${Date.parse(newsTime)>Date.now()?' 前':' · 已过，待到账确认'}`:'到账时间未定'}${!fresh?' · 数据待更新':''}</p><p class="news-caveat">${/EOD\s+PST/i.test(`${news.text} ${news.context?.text||''}`)?'原文 EOD PST；站方按太平洋日历换算，时区与到账时刻需核实。':'补发重置卡，不表示自动清空当前额度。'}</p></div>`:'';
  const details=s.notes || [], extraSignals=s.signals || [];
  const oldForecasts=[...(s.archivedForecasts||[]),...(f.state==='elapsed'?[f]:[])];
  const oldHtml=oldForecasts.length?`<div class="additional-forecast"><strong>历史排期（不作为下次预计）</strong>${oldForecasts.map(a=>`<p>${esc(full(a.start||a.end))}${a.start&&a.end&&a.start!==a.end?` 至 ${esc(full(a.end))}`:''} · ${['fulfilled','completed','local-reset'].includes(a.retiredReason)?'已有完成记录':['cancelled','revoked'].includes(a.retiredReason)?'已撤销':'已过期'}<br><span data-original>${esc(a.text)}</span>${a.scope?.plans?.length?`<br>适用范围：${esc(a.scope.plans.join('、').toUpperCase())}`:''}${a.basis?`<br>${esc(a.basis)}`:''}</p>${a.url?`<button class="text-button" data-link="${esc(a.url)}">查看历史预告原帖 ↗</button>`:''}`).join('')}</div>`:'';
  const recentEvent=state.events?.find(e=>e.sourceId===s.id && !e.read);
  return `<article class="source-card ${recentEvent?'highlight':''}" data-source="${esc(s.id)}" style="--source-color:${esc(s.color)}">
    <div class="source-header"><span class="source-logo">${esc(s.symbol)}</span><span class="source-title">${esc(s.name)}</span><span class="pill ${status[1]}">${status[0]}</span></div>
    <div class="forecast-value-area"><p class="eyebrow">${f.timingKind==='hint'?'站方观察窗口':'下次自动重置'}</p><div class="forecast-value ${valueClass}">${value}</div><div class="forecast-note ${!fresh || f.state==='elapsed'?'source-warning':''}">${esc(note)}</div>${probabilityHtml}${bankedHtml}</div>
    <div class="source-details"><h3>${f.timingKind==='hint'?'观察依据':f.state!=='none'?'预告依据':'最近公开消息'}${news?.at&&f.state==='none'?` · ${esc(full(news.at))}`:''}</h3><p class="source-quote"${hasOriginal?' data-original':''}>${esc(text)}</p>${news?.url&&f.state==='none'?`<button class="text-button" data-link="${esc(news.url)}">查看最新原帖 ↗</button>`:''}
      <details class="source-more" data-details="${esc(s.id)}" ${detailsExpanded?'open':''}><summary>查看依据与说明</summary><p${hasOriginal?' data-original':''}>${esc(text)}</p>${f.url?`<button class="text-button" data-link="${esc(f.url)}">查看预告原帖 ↗</button>`:news?.url?`<button class="text-button" data-link="${esc(news.url)}">查看消息原帖 ↗</button>`:s.lastReset?.url?`<button class="text-button" data-link="${esc(s.lastReset.url)}">查看完成原帖 ↗</button>`:''}${f.issuedAt?`<p>原帖发布：${esc(full(f.issuedAt))}</p>`:''}${f.clippedStart?`<p>原始窗口：${esc(full(f.originalStart))} 至 ${esc(full(f.end))}；起点已过去，不再作为下次预计。</p>`:''}${f.resetGapClipped?`<p>原始窗口：${esc(full(f.originalStart))} 至 ${esc(full(f.end))}；按重置后 6 小时间隔，已略去窗口起点。</p>`:''}${news?.context?.url?`<button class="text-button" data-link="${esc(news.context.url)}">查看前文公告 ↗</button>`:''}<ul>${details.map(n=>`<li>${esc(n)}</li>`).join('')}${p.length?'<li>百分比为站方模型估计，不代表已验证的命中率。</li>':''}${f.basis?`<li>${esc(f.basis)}</li>`:''}</ul><p>${esc(s.familyLabel)}</p>${(s.additionalForecasts||[]).map(a=>PaceTiming.remainingSchedule(a)).map(a=>`<div class="additional-forecast"><p><strong>其他预告 · ${esc(a.kindLabel||'重置')}</strong><br>${esc(a.start?full(a.start):full(a.end))}${a.start&&a.end&&a.start!==a.end?` 至 ${esc(full(a.end))}`:''} · ${scheduleLabel(a)}${a.scope?.plans?.length?` · ${esc(a.scope.plans.join('、').toUpperCase())}`:''}</p><p data-original>${esc(a.text)}</p>${a.clippedStart?`<p>原始窗口：${esc(full(a.originalStart))} 至 ${esc(full(a.end))}；起点已过去，不再作为下次预计。</p>`:''}${a.resetGapClipped?`<p>原始窗口：${esc(full(a.originalStart))} 至 ${esc(full(a.end))}；按重置后 6 小时间隔，已略去窗口起点。</p>`:''}${a.url?`<button class="text-button" data-link="${esc(a.url)}">查看该预告原帖 ↗</button>`:''}</div>`).join('')}${oldHtml}${extraSignals.map(n=>`<p data-original>${esc(n.text)}</p>${n.url?`<button class="text-button" data-link="${esc(n.url)}">查看信号原帖 ↗</button>`:''}`).join('')}</details>
    </div><div class="source-footer"><div class="source-times">源更新 ${esc(clock(s.updatedAt))}<br>本地获取 ${esc(clock(s.fetchedAt))}${s.id==='did'?' · 约3.5分钟':''}</div><button class="text-button" data-link="${esc(s.url)}">打开原站 ↗</button></div>
  </article>`;
}
function render(next) {
  const calendarChanged=next.settings.calendarTarget?.at!==state?.settings.calendarTarget?.at||next.settings.timeZone!==state?.settings.timeZone;
  if(next.calendarResetClearedBy&&next.calendarResetClearedBy!==state?.calendarResetClearedBy&&!next.settings.calendarTarget){calendarDate=null;$('calendar-hour').value='';$('calendar-result').textContent='';}
  state=next;
  const nextZone=DashboardTimeZone.normalize(state.settings.timeZone);
  if(zone!==nextZone){zone=nextZone;dateFormat=new Intl.DateTimeFormat('zh-CN',{timeZone:zone,month:'numeric',day:'numeric'});timeFormat=new Intl.DateTimeFormat('zh-CN',{timeZone:zone,hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});calendarDate=null;temporalKey='';lastCalendarMarkup='';}
  if(calendarChanged&&Number.isFinite(Date.parse(state.settings.calendarTarget?.at))){calendarDate=DashboardTimeZone.dateKey(state.settings.calendarTarget.at,zone);$('calendar-hour').value=String(Number(DashboardTimeZone.time(state.settings.calendarTarget.at,zone).split(':')[0]));}
  $('display-zone').textContent=zone==='Asia/Shanghai'?'北京时间 UTC+8':zone;
  $('calendar-range').textContent=`过去6周 · 未来1周 · ${zoneName()}`;
  $('calendar-hour-label').textContent=`小时（${zoneName()}）`;
  document.body.classList.toggle('dark',state.settings.theme==='dark');
  document.body.style.setProperty('--body-font-size',`${state.settings.bodyFontSize||13}px`);
  if(!barDrag&&!barSaving)applyBarOrder(state.settings.barOrder);
  const sources=state.sources || [], c=state.consensus || {};
  const ok=sources.filter(s=>s.status==='ok'&&isFresh(s)).length;
  $('live-state').innerHTML=`<i></i>${state.paused?'监控已暂停':state.refreshing?'正在检查':`${ok}/${sources.length} 信源在线`}`;
  $('live-state').classList.toggle('paused',state.paused || !ok); $('refresh').classList.toggle('spinning',state.refreshing); $('refresh').disabled=state.refreshing || state.paused;
  const cs={confirmed:['已交叉核对',''],pending:['待交叉核对','warn'],conflict:['时间有分歧','error'],unavailable:['待更新','muted']}[c.state] || ['核对中','muted'];
  $('consensus-status').textContent=cs[0]; $('consensus-status').className=`pill ${cs[1]}`;
  if (c.at) {
    const t=clock(c.at).split(':');
    $('last-reset-value').innerHTML=`<div class="reset-date">${esc(dateFormat.format(date(c.at)))}</div><div class="reset-time-row"><div class="reset-clock">${esc(t[0])}:${esc(t[1])}<span>:${esc(t[2])}</span></div><div class="reset-elapsed" id="reset-elapsed"></div></div>`;
  } else $('last-reset-value').innerHTML='<div class="reset-date">等待可靠的记录</div><div class="reset-clock">—</div>';
  $('consensus-note').textContent=c.message || '正在比对公开完成记录';
  $('consensus-note').style.color=c.state==='confirmed'?'var(--green)':'var(--secondary)';
  $('source-proof').innerHTML=(c.sources || []).map(s=>{ const spec=sources.find(x=>x.id===s.id); return `<button class="proof-dot" data-link="${esc(spec?.url)}" title="${esc(s.name)}">${esc(spec?.symbol)}</button>`; }).join('')+(c.sources?.length?`<span>${c.sources.length} 站收录 · 同上游已去重</span>`:'');
  $('reset-semantics').textContent=c.timeBasis==='effective'?'站方记录的生效时间':'公开完成公告时间'; $('reset-semantics').title=c.semantics || '';
  $('original-post').disabled=!c.url;
  renderQuota();
  $('sources-grid').innerHTML=sources.map(cardMarkup).join('');
  renderHistory(); renderHypothetical();
  const fCount=sources.filter(s=>isFresh(s) && s.forecast && s.forecast.timingKind!=='hint' && !['none','elapsed','invalid'].includes(PaceTiming.forecastState(s.forecast))).length;
  $('forecast-subtitle').textContent=fCount?`${fCount} 个站收录了待确认预告`:'各站预计时间与公开依据';
  const unread=(state.events || []).filter(e=>!e.read); $('unread-dot').hidden=!unread.length;
  $('change-banner').hidden=!unread.length;
  if (unread.length) $('change-banner').innerHTML=`<strong>${esc(unread[0].title)}</strong>${esc(unread[0].body)}<span>查看 ›</span>`;
  $('pause').textContent=state.paused?'继续监控':'暂停监控';
  $('poll-dot').style.background=state.paused?'#bb9863':ok?'#50a996':'#bb9863';
  populateTimeZones();$('setting-timezone').value=zone;
  if (!$('settings-dialog').open) syncSettings();
  tick();
}
function quotaConnectionMarkup(){
 const c=state.quotaConnection||{},connected=state.quotaDisplay&&!state.quotaDisplay.stale&&state.quota?.state==='ok';
 if(connected)return '<strong>额度已连接</strong>';
 const note=c.loginPending?'已打开登录页，完成授权后自动读取额度。':c.checking?'正在验证额度…':c.errorCode?'连接未完成，请重试。':c.requiresAccountSwitch?'为看板单独登录 ChatGPT，以读取个人额度。':'内置 Codex 已就绪，登录后即可显示个人额度。';
 return `<p>${esc(note)}</p><div class="connection-actions"><button class="primary-button" data-connect-quota>${c.loginPending?'重新打开登录页':'登录 ChatGPT 并接入额度'}</button>${c.loginPending?'<button class="text-button" data-cancel-quota-login>取消本次登录</button>':''}</div>`;
}
function renderQuota(refreshDetails=true) {
  const stored=state.quotaDisplay,now=Date.now();
  const end=Date.parse(stored?.resetsAt),duration=stored?.durationMins*60000;
  const q=stored?{...stored,theoretical:Number.isFinite(end)&&duration>0?Math.max(0,Math.min(1,(now-end+duration)/duration)):null,stale:stored.stale||state.quota?.state!=='ok'||now-Date.parse(stored.fetchedAt)>120000||end<=now}:null;
  const connectionPanel=$('quota-connection');connectionPanel.hidden=!!q&&!q.stale;if(!connectionPanel.hidden){const markup=quotaConnectionMarkup();if(markup!==lastConnectionMarkup){connectionPanel.innerHTML=markup;lastConnectionMarkup=markup;}}
  if (!q) {
    $('quota-value').innerHTML='—<span>%</span>';
    $('quota-side').innerHTML=`<button class="text-button" data-refresh-quota>刷新额度</button>`;
    $('actual-fill').style.width='0%'; $('theory-fill').style.width='0%'; $('actual-percent').textContent='—'; $('theory-percent').textContent='—';
    $('quota-permission').hidden=true;$('quota-reset').textContent='个人周期独立于全局重置预告'; return;
  }
  $('quota-caption').textContent=`本机 Codex · ${period(q.durationMins)} 剩余额度`;
  $('quota-value').innerHTML=`${esc(q.remainingPercent.toFixed(q.remainingPercent%1 ? 1 : 0))}<span>% 剩余</span>`;
  $('quota-side').innerHTML=`<strong>${esc((q.planType || 'Codex').toUpperCase())}</strong><span>${esc(q.name)}${q.stale?' · 待更新':''}</span>${q.resetCredits===null?'':`<span>可用重置卡 ${q.resetCredits} 张</span>`}`;
  $('actual-fill').style.width=`${q.usedPercent}%`; $('theory-fill').style.width=`${(q.theoretical ?? 0)*100}%`;
  $('actual-percent').textContent=`${q.usedPercent}%`; $('theory-percent').textContent=q.theoretical===null?'—':`${Math.round(q.theoretical*100)}%`;
  $('actual-track').setAttribute('aria-valuenow',String(q.usedPercent)); $('theory-track').setAttribute('aria-valuenow',String(Math.round((q.theoretical ?? 0)*100)));
  $('quota-reset').textContent=q.resetsAt?`个人重置 · ${full(q.resetsAt)}`:'本机接口尚未提供重置时刻';
  $('quota-permission').hidden=q.ordinaryUsageAllowed!==false;
  $('quota-reset').title=`额度读取：${full(q.fetchedAt)}`;
  if (refreshDetails && $('quota-dialog').open) renderQuotaDetails();
}
function renderQuotaDetails() {
 const buckets=state.quota?.limits || [];
 $('quota-details').innerHTML=quotaConnectionMarkup()+(buckets.length?buckets.map(b=>`<div class="event-row"><h3>${esc(b.name)}</h3>${['primary','secondary'].filter(k=>b[k]).map(k=>{const w=b[k];return `<p>${esc(period(w.durationMins))}额度 · 剩余 ${esc((100-w.usedPercent).toFixed(0))}%<br>重置 ${esc(full(w.resetsAt))}</p><button class="text-button" data-quota-bucket="${esc(b.id)}" data-quota-window="${k}">在看板显示此周期</button>`;}).join('')}</div>`).join(''):`<p class="help-text">${esc(state.quota?.message || '正在读取本机额度…')}</p>`);
}
function renderHistory(now=Date.now()) {
 const cutoff=PaceTiming.historyStart(now),rows=[...(state.history||[]),...(state.localQuotaHistory||[])].filter(r=>Date.parse(r.at)>=cutoff&&Date.parse(r.at)<=now).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
 $('history-range').textContent=`从 2026/9/1 起 · 最新在上 · ${zoneName()}`;
 $('history-list').innerHTML=rows.length?rows.map(r=>{
   if(r.type==='local'){
     const known=Number.isFinite(r.beforeRemainingPercent)&&r.beforeRemainingPercent>=0&&r.beforeRemainingPercent<=100;
     const after=Number.isFinite(r.afterRemainingPercent)&&r.afterRemainingPercent>=0&&r.afterRemainingPercent<=100;
     const value=known?r.beforeRemainingPercent.toFixed(0)+'%':'未记录';
     return `<article class="history-row history-local" data-history-id="${esc(r.id)}"><div class="history-time"><time>${esc(dateFormat.format(date(r.at)))}<strong>${esc(clock(r.at))}</strong></time><span>本机确认时间</span></div><div class="history-content"><div class="history-row-heading"><span class="pill">本机额度补充</span><span class="history-evidence">${esc(r.bucketId||'Codex')} · ${r.windowKey==='secondary'?'副额度窗口':'主额度窗口'}</span></div><p class="history-quote">${after?'补充后剩余 '+esc(r.afterRemainingPercent.toFixed(0))+'%':'补充后额度未记录'}</p>${known&&r.beforeFetchedAt?`<p class="history-evidence">补充前最后读取 · ${esc(precise(r.beforeFetchedAt))}</p>`:''}</div><div class="history-quota-before${known?'':' unknown'}"><span>补充前剩余</span><strong>${esc(value)}</strong>${known&&r.beforeBasis==='snapshot'&&r.beforeFetchedAt?`<small class="history-quota-before-note">快照 · ${esc(precise(r.beforeFetchedAt))}</small>`:''}</div></article>`;
   }
   const plans=r.scope?.plans||[], limited=plans.length&&!plans.includes('all');
   const type=r.type==='observation'?'站方观察':r.type==='commentary'?'回顾':r.type==='repair'?'限定套餐修复':r.type==='banked'?'重置卡':r.type==='global_and_banked'?'全局＋重置卡':limited?'限定套餐重置':'全局重置';
   const scope=limited?` · ${plans.map(p=>p.toUpperCase()).join('、')}`:'';
   return `<article class="history-row"><div class="history-time"><time>${esc(dateFormat.format(date(r.at)))}<strong>${esc(clock(r.at))}</strong></time><span>${r.type==='observation'?'观察记录时间':['commentary','repair'].includes(r.type)?'消息发布时间':r.timeBasis==='effective'?'记录生效时间':'完成公告时间'}</span></div><div class="history-content"><div class="history-row-heading"><span class="pill ${r.type==='banked'?'warn':''}">${esc(type+scope)}</span><span class="history-evidence">${r.familyCount>=2?`${r.familyCount} 条采集链收录`:'单源记录'} · ${new Set(r.sources.map(s=>s.id)).size} 站${r.timeConflict?' · 记录时间存在分歧':''}</span></div><p class="history-quote"${r.text?' data-original':''}>${esc(r.text||'已收录完成记录，请查看来源原文。')}</p><details class="history-proof"><summary>查看各站记录</summary>${r.sources.map(s=>`<p><strong>${esc(s.name)}</strong> · ${s.phase==='commentary'?'回顾':s.phase==='repair'?'限定套餐修复':s.evidenceOnly?'观察记录':'完成记录'} · 来源记录时间 ${esc(precise(s.at||r.at))}<br>采集链：${esc(s.family||'unverified')} ${s.url?`<button class="text-button" data-link="${esc(s.url)}">查看原帖 ↗</button>`:''}</p>`).join('')}</details></div>${r.url?`<button class="text-button" data-link="${esc(r.url)}">查看原帖 ↗</button>`:''}</article>`;
 }).join(''):'<p class="history-empty">正在获取 2026/9/1 以来的完成记录…</p>';
}
let calendarDate=null,calendarSaving=false,lastCalendarMarkup='';
const dayLabel=days=>String(days>=.01?Number(days.toFixed(3)):Number(days.toPrecision(2)));
function renderCalendar(now=Date.now()){
 const model=ResetCalendar.calendar(state.history,now,zone),pace=PaceTiming.calendarPace(state.settings.calendarTarget,now,{quota:state.quotaDisplay,localReset:state.localReset});
 if(calendarDate&&(calendarDate<=model.today||calendarDate>model.end))calendarDate=null;
 const targetDay=pace.available?ResetCalendar.dateKey(pace.end,zone):null;
 const showBanked=$('calendar-show-banked').checked,showLimited=$('calendar-show-limited').checked;
 const markup=model.months.map(month=>`<section class="calendar-month"><h3 class="calendar-month-heading" style="margin-left:calc(${month.cells.findIndex(c=>c.inRange)%7} * (100% + 4px) / 7)">${state.settings.language==='en'?month.month:month.month+'月'}</h3><div class="calendar-month-grid">`+month.cells.map(c=>{
  if(!c.inRange)return '<div class="calendar-cell empty" aria-hidden="true"></div>';
  const events=c.events.filter(e=>(showBanked||e.type!=='banked')&&(showLimited||!e.scope?.plans?.length||e.scope.plans.includes('all')));
  const assumed=targetDay===c.key,hasReset=events.some(e=>e.type!=='banked');
  const labels=events.map(e=>`${e.time}${e.type==='banked'?' · 重置卡':e.scope?.plans?.length&&!e.scope.plans.includes('all')?' · '+e.scope.plans.join('/').toUpperCase():''}`);
  const text=labels.join('；')+(assumed?`${labels.length?'；':''}假设时间 ${full(pace.end)}`:'');
  return `<button class="calendar-cell${c.future?' future':''}${c.today?' is-today':''}${hasReset?' has-reset':''}${calendarDate===c.key?' selected':''}${assumed?' assumed':''}" data-calendar-day="${c.key}" ${c.future?'':'disabled'} aria-label="${esc(c.key+' '+text)}" aria-pressed="${calendarDate===c.key}" title="${esc(c.key+' '+text)}"><span class="calendar-day"><span class="calendar-day-number">${c.day}</span></span>${labels.map((label,i)=>`<span class="calendar-time${events[i].type==='banked'?' banked':''}">${esc(events[i].time)}</span>`).join('')}${assumed?`<span class="calendar-time assumed-time">${esc(clock(pace.end).slice(0,5))}</span>`:''}</button>`;
 }).join('')+'</div></section>').join('');
 if(markup!==lastCalendarMarkup){$('reset-calendar').innerHTML=markup;lastCalendarMarkup=markup;}
 $('calendar-selected').value=calendarDate||'';
 $('calendar-current').textContent=pace.available?`指定时间 · ${full(pace.end)}`:'';
 let valid=false;
 if(!calendarDate)$('calendar-preview').textContent='请先选择未来日期';
 else try{
  const value=$('calendar-hour').value,hour=value.trim()===''?NaN:Number(value);
  const result=ResetCalendar.daysForTarget(PaceTiming.hypotheticalPace(state.consensus,1,now,state.history,{quota:state.quotaDisplay,localReset:state.localReset}).anchor,calendarDate,hour,now,zone);valid=true;
  $('calendar-preview').textContent=`目标 ${full(result.targetAt)} · 日历节奏`;
 }catch(error){$('calendar-preview').textContent=error.reason==='NONEXISTENT_HOUR'?'此时区没有这个整点，请选择其他小时':error.code==='NO_ANCHOR'?'等待已核对的全局重置，以设置假设时间':error.code==='INVALID_PERIOD'?'假设天数须大于0且不超过365':'请选择未来一周的日期及0—23点';}
 $('calendar-confirm').disabled=calendarSaving||!valid;
}
$('reset-calendar').addEventListener('click',event=>{const day=event.target.closest('[data-calendar-day]');if(!day||day.disabled)return;calendarDate=day.dataset.calendarDay;$('calendar-result').textContent='';renderCalendar();applyLocale();});
for(const id of ['calendar-hour','calendar-show-banked','calendar-show-limited'])$(id).addEventListener(id==='calendar-hour'?'input':'change',()=>{$('calendar-result').textContent='';renderCalendar();applyLocale();});
$('calendar-confirm').addEventListener('click',async()=>{
 if(calendarSaving||$('calendar-confirm').disabled)return;
 calendarSaving=true;renderCalendar();
 const saved=await call(()=>window.dashboard.saveSettings({calendarTarget:{day:calendarDate,hour:Number($('calendar-hour').value)}}));
 calendarSaving=false;if(saved){render(saved);$('calendar-result').textContent='已更新日历节奏';}renderCalendar();applyLocale();
});

$('calendar-clear').addEventListener('click',async()=>{const saved=await call(()=>window.dashboard.saveSettings({clearCalendarTarget:true}));if(saved){render(saved);$('calendar-result').textContent='日期假设已清除';applyLocale();}});
$('clear-hypothetical').addEventListener('click',async()=>{const saved=await call(()=>window.dashboard.saveSettings({clearHypothetical:true}));if(saved)render(saved);});
function renderCalendarPace(now=Date.now()){
 const pace=PaceTiming.calendarPace(state.settings.calendarTarget,now,{quota:state.quotaDisplay,localReset:state.localReset}),progress=pace.available?pace.progress:null;
 $('calendar-target-label').textContent=pace.available?`日历预测 ${dateFormat.format(date(pace.end))}`:'日历预测';
 $('calendar-fill').style.width=`${(progress??0)*100}%`;
 $('calendar-track').setAttribute('aria-valuenow',String(Math.round((progress??0)*100)));
 $('calendar-percent').textContent=progress===null?'—':`${Math.round(progress*100)}%`;
 $('calendar-pace-note').textContent=pace.available?`${pace.origin==='local'?'从本机最近补充起算 · ':pace.origin==='cycle'?'从本机额度周期起算 · ':''}指定时间 · ${full(pace.end)}`:'未设置日历预测';
 $('calendar-clear').disabled=!pace.available;
}
function renderHypothetical(now=Date.now()) {
 const days=state.settings.hypotheticalDays||3,pace=PaceTiming.hypotheticalPace(state.consensus,days,now,state.history,{quota:state.quotaDisplay,localReset:state.localReset});
 const at=Date.parse(pace.anchor),known=pace.available;
 const progress=known&&state.settings.hypotheticalEnabled!==false?pace.progress:null;
 $('hypothetical-days-label').textContent=dayLabel(days);
 $('hypothetical-fill').style.width=`${(progress??0)*100}%`;
 $('hypothetical-track').setAttribute('aria-valuenow',String(Math.round((progress??0)*100)));
 $('hypothetical-percent').textContent=progress===null?'—':`${Math.round(progress*100)}%`;
 $('hypothetical-note').textContent=state.settings.hypotheticalEnabled===false?'天数假设已清除':known?progress>=1?'假设周期已到期 · 等待实际重置':`假设 ${dayLabel(days)} 天 · ${pace.origin==='local'?'从本机最近补充起算':pace.origin==='cycle'?'从本机额度周期起算':'从最近全局重置起算'} · 参考到期 ${full(new Date(at+days*86400000).toISOString())}`:'等待已核对的全局重置，以显示假设节奏';
}
function renderForecastWarning(now=Date.now()) {
 const w=PaceTiming.warning(state.sources,state.quotaDisplay,state.consensus,state.settings.hypotheticalDays||3,now,state.localReset);
 document.body.classList.toggle('reset-alert',w.active);
 $('forecast-warning').hidden=!w.active; $('forecast-markers').hidden=!w.active||!w.mapped;
 if(!w.active){$('forecast-markers').replaceChildren();return;}
 const when=full(new Date(w.earliest).toISOString())+(w.range?` — ${full(new Date(w.latest).toISOString())}`:'');
 const hours=Math.max(0,(w.earliest-now)/3600000);
 const countdown=w.earliest<=now?'已进入预告窗口':`最早约 ${hours.toFixed(1)} 小时后`;
 const pace=w.mapped?` · 目标消耗 ${w.range? w.left.toFixed(1)+'%—'+w.right.toFixed(1)+'%':w.right.toFixed(1)+'%'}`:' · 等待可靠起点';
 $('forecast-warning').textContent=`加速提醒 · ${when} · ${countdown}${pace} · ${w.sourceCount} 站预告`;
 $('forecast-warning').title=`红线从${w.axisLabel}起算，随时间推进，按预告时刻用完100%额度；多时刻显示目标节奏范围。预告截止不表示已完成，实际到账以本机额度为准。`;
 $('forecast-markers').innerHTML=w.mapped?`${w.range?`<div class="forecast-band" style="left:${w.left}%;width:${w.right-w.left}%"></div>`:''}<i class="forecast-line" style="left:${w.left}%"></i>${w.range?`<i class="forecast-line" style="left:${w.right}%"></i>`:''}`:'';
 $('hypothetical-note').textContent+=` · 红线：${w.mapped?'预告消耗节奏，从'+w.axisLabel+'起算':'等待可靠起点'}（预告优先）`;
}
function tick() {
  const now=new Date();
  $('local-date').innerHTML=`<span>${esc(new Intl.DateTimeFormat(DashboardI18n.locale(state?.settings.language),{timeZone:zone,month:'long',day:'numeric',weekday:'long'}).format(now))}</span><strong>${esc(timeFormat.format(now))}</strong>`;
  if (!state) return;
  const elapsed=$('reset-elapsed');if(elapsed&&state.consensus?.at){const hours=Math.max(0,(Date.now()-Date.parse(state.consensus.at))/3600000);elapsed.innerHTML=`<span>距今</span><strong><span>${hours.toFixed(2)}<small>小时</small></span><span class="elapsed-days"><small>=</small>${(hours/24).toFixed(2)}<small>天</small></span></strong>`;}
  renderQuota(false);renderHypothetical();renderCalendarPace();renderCalendar(); renderForecastWarning(now.getTime());
  const newsDeadlines=(state.sources||[]).map(s=>{const news=PaceTiming.latestNews(s,now.getTime());return Date.parse(news?.end||news?.start)<=now.getTime();}).join(',');
  const key=(state.sources||[]).map(s=>`${s.id}:${isFresh(s)}:${[s.forecast,...(s.additionalForecasts||[])].map(f=>PaceTiming.forecastState(f)+':'+!!PaceTiming.remainingSchedule(f).clippedStart).join(',')}`).join('|')+newsDeadlines+PaceTiming.historyStart(now.getTime());
  if(key!==temporalKey){temporalKey=key;$('sources-grid').innerHTML=(state.sources||[]).map(cardMarkup).join('');renderHistory(now.getTime());
   const ok=(state.sources||[]).filter(isFresh).length;$('live-state').innerHTML=`<i></i>${state.paused?'监控已暂停':state.refreshing?'正在检查':`${ok}/5 信源在线`}`;
   if(state.consensus?.state==='confirmed'&&!state.consensus.sources?.some(proof=>isFresh(state.sources.find(s=>s.id===proof.id)))){$('consensus-status').textContent='上次核对 · 待更新';$('consensus-status').className='pill warn';$('consensus-note').textContent='信源信息已过期，保留上次核对的时间';}
  }
  let countdown=state.nextPollAt?Math.max(0,Math.ceil((Date.parse(state.nextPollAt)-Date.now())/1000)):30;
  $('poll-status').textContent=state.paused?'监控已暂停':state.refreshing?'正在获取信源信息…':`每 30 秒检查 · ${countdown || 30} 秒后再次检查`;
  $('notification-status').textContent=Date.parse(state.resetQuietUntil)>Date.now()?`重置系统通知已静默至 ${full(state.resetQuietUntil)}（${zoneName()}）`:state.notificationStatus || '系统勿扰模式可能将通知收进通知中心。';
  applyLocale();
}
function populateTimeZones(){
 const select=$('setting-timezone'),language=state.settings.language||'zh-CN';if(select.dataset.language===language)return;
 const zones=[...new Set(['Asia/Shanghai','UTC',...Intl.supportedValuesOf('timeZone')])];
 select.innerHTML=zones.map(z=>{const name=new Intl.DateTimeFormat(DashboardI18n.locale(language),{timeZone:z,timeZoneName:'long'}).formatToParts(new Date()).find(p=>p.type==='timeZoneName')?.value||z;return `<option value="${esc(z)}">${esc(z+' · '+name)}</option>`;}).join('');select.dataset.language=language;
}
function syncSettings() {
  if (!state) return;
  $('setting-language').value=state.settings.language||'zh-CN';
  populateTimeZones();$('setting-timezone').value=zone;
  $('setting-notify').checked=state.settings.notify; $('setting-sound').checked=state.settings.sound;
  $('setting-tray').checked=state.settings.closeToTray; $('setting-autostart').checked=state.settings.autoStart; $('setting-dark').checked=state.settings.theme==='dark';
  $('setting-hypothetical-days').value=state.settings.hypotheticalDays||3;
  $('setting-body-font').value=state.settings.bodyFontSize||13; $('body-font-value').textContent=`${state.settings.bodyFontSize||13} px`;
  $('quota-limit-field').hidden=!(state.quota?.limits?.length>1);
  $('quota-limit-select').innerHTML=(state.quota?.limits || []).map(q=>`<option value="${esc(q.id)}">${esc(q.name)}</option>`).join('');
  $('quota-limit-select').value=state.settings.quotaLimitId;
}
function openSettings() { syncSettings(); $('settings-error').textContent=''; $('settings-dialog').showModal();applyLocale(); }
function currentBarOrder(){return [...document.querySelectorAll('.quota-row[data-bar]')].map(row=>row.dataset.bar);}
function applyBarOrder(order){
 const bars=document.querySelector('.quota-bars'),marker=$('forecast-markers');
 const desired=BarOrder.normalize(order);if(currentBarOrder().join(',')===desired.join(','))return;
 for(const id of desired)bars.insertBefore(bars.querySelector(`[data-bar="${id}"]`),marker);
}
async function saveBarOrder(order,previous){
 if(order.join(',')===previous.join(','))return;
 barSaving=true;
 const saved=await call(()=>window.dashboard.saveSettings({barOrder:order}));
 barSaving=false;
 if(saved){render(saved);$('bar-sort-status').textContent='横条顺序已保存';}
 else {state.settings.barOrder=previous;applyBarOrder(previous);}
}
function finishBarDrag(cancel=false){
 if(!barDrag)return;
 const drag=barDrag,order=currentBarOrder();barDrag=null;
 document.querySelector('.quota-bars').classList.remove('bars-sorting');
 document.querySelectorAll('.bar-dragging').forEach(row=>row.classList.remove('bar-dragging'));
 const bars=document.querySelector('.quota-bars');if(bars.hasPointerCapture(drag.pointerId))bars.releasePointerCapture(drag.pointerId);
 if(cancel)applyBarOrder(drag.previous);else saveBarOrder(order,drag.previous);
}
document.querySelector('.quota-bars').addEventListener('pointerdown',event=>{
 const handle=event.target.closest('.bar-drag-handle');if(!handle||event.button!==0||barSaving)return;
 barDrag={id:handle.closest('[data-bar]').dataset.bar,pointerId:event.pointerId,startY:event.clientY,previous:currentBarOrder(),started:false};
 event.preventDefault();handle.focus();document.querySelector('.quota-bars').setPointerCapture(event.pointerId);
});
window.addEventListener('pointermove',event=>{
 if(!barDrag||event.pointerId!==barDrag.pointerId)return;
 if(!barDrag.started&&Math.abs(event.clientY-barDrag.startY)<4)return;
 barDrag.started=true;document.querySelector('.quota-bars').classList.add('bars-sorting');
 document.querySelector(`[data-bar="${barDrag.id}"]`).classList.add('bar-dragging');
 const remaining=[...document.querySelectorAll('.quota-row[data-bar]')].filter(row=>row.dataset.bar!==barDrag.id);
 const before=remaining.findIndex(row=>{const r=row.getBoundingClientRect();return event.clientY<r.top+r.height/2;});
 applyBarOrder(BarOrder.move(currentBarOrder(),barDrag.id,before<0?remaining.length:before));event.preventDefault();
});
window.addEventListener('pointerup',event=>{if(event.pointerId===barDrag?.pointerId)finishBarDrag();});
window.addEventListener('pointercancel',()=>finishBarDrag(true));
document.querySelector('.quota-bars').addEventListener('lostpointercapture',()=>finishBarDrag(true));
window.addEventListener('blur',()=>finishBarDrag(true));
window.addEventListener('keydown',event=>{if(event.key==='Escape'&&barDrag){event.preventDefault();finishBarDrag(true);}});
document.querySelector('.quota-bars').addEventListener('keydown',event=>{
 const handle=event.target.closest('.bar-drag-handle');if(!handle||barSaving||barDrag||!['ArrowUp','ArrowDown'].includes(event.key))return;
 event.preventDefault();const previous=currentBarOrder(),id=handle.closest('[data-bar]').dataset.bar;
 const order=BarOrder.move(previous,id,previous.indexOf(id)+(event.key==='ArrowUp'?-1:1));applyBarOrder(order);handle.focus();saveBarOrder(order,previous);
});
function openQuota() { renderQuotaDetails(); $('quota-dialog').showModal();applyLocale(); }
async function openEvents() {
  const events=state.events || [];
  $('events-list').innerHTML=events.length?events.map(e=>`<div class="event-row"><h3>${esc(e.title)}</h3><p>${esc(e.body)}</p><time>${esc(full(e.at))}</time>${e.evidence?.length?[...new Map(e.evidence.filter(p=>p.url).map(p=>[p.url,p])).values()].map(p=>`<button class="text-button" data-link="${esc(p.url)}">${esc(state.sources.find(s=>s.id===p.sourceId)?.name||'查看来源')} ↗</button>`).join(''):e.url?`<button class="text-button" data-link="${esc(e.url)}">查看来源 ↗</button>`:''}</div>`).join(''):'<div class="events-empty">还没有新的关键变化。<br>有新预告或确认重置时，提醒会保留在这里。</div>';
  $('events-dialog').showModal();applyLocale(); await call(()=>window.dashboard.readEvents());
}
document.addEventListener('click',event=>{
  const close=event.target.closest('[data-close]'); if(close) $(close.dataset.close).close();
  const link=event.target.closest('[data-link]'); if(link?.dataset.link) call(()=>window.dashboard.openLink(link.dataset.link));
  const control=event.target.closest('[data-window]'); if(control) call(()=>window.dashboard.window(control.dataset.window));
  if(event.target.closest('[data-connect-quota]')) call(()=>window.dashboard.connectQuota());
  if(event.target.closest('[data-cancel-quota-login]')) call(()=>window.dashboard.cancelQuotaLogin());
  if(event.target.closest('[data-refresh-quota]')) call(()=>window.dashboard.refreshQuota());
  const quotaChoice=event.target.closest('[data-quota-bucket]');
  if(quotaChoice) call(()=>window.dashboard.saveSettings({quotaLimitId:quotaChoice.dataset.quotaBucket,quotaWindow:quotaChoice.dataset.quotaWindow}));
});
$('refresh').addEventListener('click',()=>call(()=>window.dashboard.refresh()));
$('pause').addEventListener('click',()=>call(()=>window.dashboard.pause()));
$('settings-button').addEventListener('click',openSettings);
$('events-button').addEventListener('click',openEvents); $('change-banner').addEventListener('click',openEvents);
$('quota-settings').addEventListener('click',openQuota);
$('hypothetical-settings').addEventListener('click',()=>{openSettings();$('setting-hypothetical-days').focus();});

$('settings-refresh-quota').addEventListener('click',()=>call(()=>window.dashboard.refreshQuota()));
$('quota-details-refresh').addEventListener('click',()=>call(()=>window.dashboard.refreshQuota()));
$('quota-open').addEventListener('click',()=>call(()=>window.dashboard.refreshQuota()));
$('original-post').addEventListener('click',()=>state.consensus?.url && call(()=>window.dashboard.openLink(state.consensus.url)));

for (const [id,key] of [['setting-notify','notify'],['setting-sound','sound'],['setting-tray','closeToTray'],['setting-autostart','autoStart']]) $(id).addEventListener('change',async()=>{
  try { await window.dashboard.saveSettings({[key]:$(id).checked}); $('settings-error').textContent=''; } catch(error) { $('settings-error').textContent=error.message.replace(/^Error invoking remote method '[^']+': Error: /,''); $(id).checked=state.settings[key]; }
});
$('setting-timezone').addEventListener('change',()=>call(()=>window.dashboard.saveSettings({timeZone:$('setting-timezone').value})));
$('setting-dark').addEventListener('change',()=>call(()=>window.dashboard.saveSettings({theme:$('setting-dark').checked?'dark':'light'})));
$('quota-limit-select').addEventListener('change',()=>call(()=>window.dashboard.saveSettings({quotaLimitId:$('quota-limit-select').value})));
$('test-notification').addEventListener('click',async()=>{await call(()=>window.dashboard.testNotification());toast('已发送常驻测试通知，可手动关闭');});
for(const dialog of document.querySelectorAll('dialog')) {
 let beganOutside=false;
 const outside=e=>{const r=dialog.getBoundingClientRect();return e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom;};
 dialog.addEventListener('pointerdown',e=>beganOutside=e.target===dialog&&outside(e));
 dialog.addEventListener('click',e=>{if(beganOutside&&e.target===dialog&&outside(e))dialog.close();beganOutside=false;});
}
document.addEventListener('toggle',e=>{const d=e.target;if(!d.matches?.('.source-more')||d.open===detailsExpanded)return;detailsExpanded=d.open;for(const item of document.querySelectorAll('.source-more'))item.open=detailsExpanded;},true);
$('setting-hypothetical-days').addEventListener('change',async()=>{const days=Number($('setting-hypothetical-days').value);if(!Number.isFinite(days)||days<=0||days>365){$('settings-error').textContent='假设天数须大于0且不超过365';return;}await call(()=>window.dashboard.saveSettings({hypotheticalDays:days}));$('settings-error').textContent='';});
$('setting-body-font').addEventListener('input',()=>{const size=Number($('setting-body-font').value);document.body.style.setProperty('--body-font-size',`${size}px`);$('body-font-value').textContent=`${size} px`;});
$('setting-body-font').addEventListener('change',()=>call(()=>window.dashboard.saveSettings({bodyFontSize:Number($('setting-body-font').value)})));
window.dashboard.onState(render);
window.dashboard.get().then(render).then(()=>window.dashboard.ready()).catch(()=>toast('看板初始化失败，请重新打开软件'));
setInterval(tick,1000);

$('setting-language').addEventListener('change',()=>call(()=>window.dashboard.saveSettings({language:$('setting-language').value})));
