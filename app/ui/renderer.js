'use strict';
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Compare untranslated source values, not serialized DOM: localization and
// user-expanded details legitimately change the rendered nodes between polls.
const textValues=new WeakMap(),markupValues=new WeakMap(),attributeValues=new WeakMap();
let localeDirty=true,appliedLanguage=null;
function setText(element,value){if(!element)return;const text=String(value??'');if(textValues.get(element)===text)return;if(element.textContent!==text)element.textContent=text;textValues.set(element,text);if(/[\u3400-\u9fff]/.test(text))localeDirty=true;}
function setLiveLocalizedText(element,value){const text=DashboardI18n.text(String(value??''),state?.settings.language||'zh-CN');if(element.textContent!==text)element.textContent=text;}
function setMarkup(element,markup){
 if(!element||markupValues.get(element)===markup)return;
 const focusIndex=[...element.querySelectorAll('button,summary,a,input')].indexOf(document.activeElement),open=[...element.querySelectorAll('details')].map(d=>d.open);
 if(element.innerHTML!==markup){element.innerHTML=markup;localeDirty=true;element.querySelectorAll('details').forEach((d,i)=>{if(open[i]!==undefined)d.open=open[i];});if(focusIndex>=0)element.querySelectorAll('button,summary,a,input')[focusIndex]?.focus({preventScroll:true});}
 markupValues.set(element,markup);
}
function setWidth(element,value){if(element.style.width!==value)element.style.width=value;}
function setAttribute(element,name,value){const text=String(value);if(element.getAttribute(name)!==text)element.setAttribute(name,text);}
function setLocalizedAttribute(element,name,value){const text=String(value??''),values=attributeValues.get(element)||{};if(values[name]!==text){element.setAttribute(name,text);values[name]=text;attributeValues.set(element,values);localeDirty=true;}}
// Reconcile rows by an internal key. Preserve opened evidence and keyboard
// focus when a real data change requires one row to be replaced.
function reconcile(parent,entries,cache,onCreate=()=>{}){
 const keep=new Set();
 for(const [index,item] of entries.entries()){
  keep.add(item.key);let current=cache.get(item.key);
  if(!current||current.markup!==item.markup){
   const template=document.createElement('template');template.innerHTML=item.markup;const node=template.content.firstElementChild;
   if(!node)continue;
   let focusIndex=-1;const open=[];
   if(current){const old=current.node;old.querySelectorAll('details').forEach((d,i)=>open[i]=d.open);focusIndex=[...old.querySelectorAll('button,summary,a,input')].indexOf(document.activeElement);if(old.parentNode===parent)parent.replaceChild(node,old);}
   node.querySelectorAll('details').forEach((d,i)=>{if(open[i]!==undefined)d.open=open[i];});
   current={node,markup:item.markup};cache.set(item.key,current);onCreate(node);localeDirty=true;
   if(focusIndex>=0)node.querySelectorAll('button,summary,a,input')[focusIndex]?.focus({preventScroll:true});
  }
  const anchor=parent.children[index]||null;if(current.node!==anchor)parent.insertBefore(current.node,anchor);
 }
 for(const [key,value] of cache)if(!keep.has(key)){value.node.remove();cache.delete(key);localeDirty=true;}
}
const sourceNodes=new Map(),historyNodes=new Map(),weeklyAccountNodes=new Map();
let zone = 'Asia/Shanghai';
let dateFormat = new Intl.DateTimeFormat('zh-CN',{timeZone:zone,month:'numeric',day:'numeric'});
let timeFormat = new Intl.DateTimeFormat('zh-CN',{timeZone:zone,hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
const period = mins => mins % 1440 === 0 ? `${mins/1440} 天` : mins % 60 === 0 ? `${mins/60} 小时` : `${mins} 分钟`;
const date = x => x && Number.isFinite(Date.parse(x)) ? new Date(x) : null;
const clock = x => date(x) ? timeFormat.format(date(x)) : '—';
const full = x => date(x) ? new Intl.DateTimeFormat(DashboardI18n.locale(state?.settings.language),{timeZone:zone,month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date(x)) : '时间未注明';
const precise = x => date(x) ? new Intl.DateTimeFormat(DashboardI18n.locale(state?.settings.language),{timeZone:zone,month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(date(x)) : '时间未注明';
const zoneName=()=>zone==='Asia/Shanghai'?'北京时间':zone;
const applyLocale=()=>{const language=state?.settings.language||'zh-CN';if(!localeDirty&&appliedLanguage===language)return;DashboardI18n.apply(document,language);appliedLanguage=language;localeDirty=false;};
let state, toastTimer, detailsExpanded=false, temporalKey='',barDrag=null,barSaving=false,lastConnectionMarkup='';
function toast(message) { setText($('toast'),message); $('toast').hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('toast').hidden=true,3600);applyLocale(); }
async function call(fn) { try { return await fn(); } catch(error) { toast(error.message?.replace(/^Error invoking remote method '[^']+': Error: /,'') || '操作未完成，请重试'); return null; } }
function isFresh(s) { return PaceTiming.isFresh(s); }
function weeklyCountdown(account,now=Date.now()){
 const reset=Date.parse(account?.resetsAt);
 if(!Number.isFinite(reset)||!Number.isFinite(now))return '重置时间未记录';
 if(now>=reset)return '预计重置时间已到，等待确认';
 const minutes=Math.ceil((reset-now)/60000),days=Math.floor(minutes/1440),hours=Math.floor(minutes%1440/60),mins=minutes%60;
 const time=days?`${days} 天 ${hours} 小时`:hours?`${hours} 小时 ${mins} 分钟`:`${mins} 分钟`;
 return `距预计重置 ${time}`;
}
function weeklyPace(account,now){
 const reset=Date.parse(account?.resetsAt),week=7*24*60*60*1000;
 if(!Number.isFinite(reset)||!Number.isFinite(now))return null;
 return Math.max(0,Math.min(100,(now-(reset-week))/week*100));
}
function renderWeeklyAccounts(now=Date.now()){
 const list=$('weekly-accounts-list'),empty=$('weekly-accounts-empty');if(!list||!empty)return;
 const accounts=Array.isArray(state?.weeklyAccounts)?state.weeklyAccounts:[];
 const entries=accounts.map((account,index)=>{
  const key=`weekly:${String(account?.id??index)}`;
  return {key,account,markup:'<div class="weekly-account" role="listitem"><div class="weekly-account-head"><strong class="weekly-account-name"></strong><span class="weekly-account-plan"></span><span class="weekly-account-badge"></span><strong class="weekly-account-percent"></strong></div><div class="weekly-account-track" role="progressbar" aria-label="周额度实际消耗" aria-valuemin="0" aria-valuemax="100"><i></i><span class="weekly-account-pace" aria-hidden="true" hidden></span></div><div class="weekly-account-meta"><span class="weekly-account-countdown"></span><span class="weekly-account-sampled"></span></div></div>'};
 });
 reconcile(list,entries,weeklyAccountNodes);empty.hidden=entries.length>0;
 for(const item of entries){
  const node=weeklyAccountNodes.get(item.key)?.node;if(!node)continue;
  const a=item.account,active=a?.isCurrent===true,live=active&&!a?.isChecking&&!a?.isStale&&a?.isLive!==false;
  const label=/^账号 [1-9]\d*$/.test(a?.label||'')?a.label:'账号',plan=String(a?.planType||'').trim().slice(0,32).toUpperCase()||'未知';
  const remaining=Number.isFinite(a?.remainingPercent)&&a.remainingPercent>=0&&a.remainingPercent<=100?a.remainingPercent:null,used=remaining===null?null:Math.round((100-remaining)*1e8)/1e8;
  const badge=a?.isChecking?'核验中':active?(a?.isStale||a?.isLive===false?'当前账号 · 待更新':'当前账号'):'上次记录';
  node.classList.toggle('current',active);setLiveLocalizedText(node.querySelector('.weekly-account-name'),label);setLiveLocalizedText(node.querySelector('.weekly-account-plan'),plan);setLiveLocalizedText(node.querySelector('.weekly-account-badge'),badge);setLiveLocalizedText(node.querySelector('.weekly-account-percent'),used===null?'未提供':`${Number(used.toFixed(1))}%`);
  const track=node.querySelector('.weekly-account-track'),fill=track.querySelector('i'),marker=track.querySelector('.weekly-account-pace'),pace=weeklyPace(a,now),language=state?.settings.language||'zh-CN';
  track.classList.toggle('unknown',used===null);fill.hidden=used===null;setWidth(fill,`${used??0}%`);if(used===null)track.removeAttribute('aria-valuenow');else setAttribute(track,'aria-valuenow',used);
  marker.hidden=pace===null;if(pace!==null&&marker.style.left!==`${pace}%`)marker.style.left=`${pace}%`;
  const labelText=`${used===null?'实际消耗未提供':`已消耗 ${Number(used.toFixed(1))}%`}${pace===null?'':` · 七天周期已过 ${Number(pace.toFixed(1))}%`}`;
  setAttribute(track,'aria-label',DashboardI18n.text('周额度实际消耗',language));setAttribute(track,'aria-valuetext',DashboardI18n.text(labelText,language));setAttribute(track,'title',DashboardI18n.text(labelText,language));
  setLiveLocalizedText(node.querySelector('.weekly-account-countdown'),weeklyCountdown(a,now));setLiveLocalizedText(node.querySelector('.weekly-account-sampled'),`${live?'更新于':'记录于'} ${full(a?.fetchedAt)}`);
 }
}
function scheduleLabel(f) {const status=PaceTiming.forecastState(f);return status==='invalid'?'时间待核实':status==='elapsed'?'时间已过':f.timingKind==='hint'?'观察窗口，非承诺':status==='untimed'?'时间未定':'待执行';}
function cardMarkup(s) {
  s=PaceTiming.projectForecasts(s);
  const raw=s.forecast||{state:'none'},remaining=PaceTiming.remainingSchedule(raw),f={...remaining,state:PaceTiming.forecastState(raw)},fresh=isFresh(s);
  const status={retrying:['重试中','warn'],ok:['已更新',''],stale:['待更新','warn'],error:['连接异常','error'],blocked:['已暂停','error'],loading:['读取中','muted']}[!fresh&&s.status==='ok'?'stale':s.status] || ['待更新','muted'];
  let value='无', valueClass='', note=s.archivedForecasts?.length?'旧排期时间已过或已有完成记录，尚无有效的下次预告':'尚无明确的下次重置预告';
  if(s.archivedForecasts?.length){
    const latest=[...s.archivedForecasts].sort((a,b)=>(Date.parse(b.issuedAt||b.end||b.start)||0)-(Date.parse(a.issuedAt||a.end||a.start)||0))[0];
    const reasons=[latest.retiredReason];
    if(reasons.some(r=>['fulfilled','completed','local-reset'].includes(r)))note='已收录完成记录，原预告不再作为下次预计';
    else if(reasons.every(r=>['cancelled','revoked'].includes(r)))note='原预告已撤销，尚无新的重置预告';
    else note='旧预告时间已过，尚无新的重置预告';
  }
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
    if(f.timingKind==='inferred'||f.sourceTimeVerified===false)note+=' · 站方换算，待核实';
    if(f.timeZone)note+=` · ${f.timeZone}`;
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
  return `<article class="source-card" data-source="${esc(s.id)}" style="--source-color:${esc(s.color)}">
    <div class="source-header"><span class="source-logo">${esc(s.symbol)}</span><span class="source-title">${esc(s.name)}</span><span class="pill ${status[1]}">${status[0]}</span></div>
    <div class="forecast-value-area"><p class="eyebrow">${f.timingKind==='hint'?'站方观察窗口':'下次自动重置'}</p><div class="forecast-value ${valueClass}">${value}</div><div class="forecast-note ${!fresh || f.state==='elapsed'?'source-warning':''}">${esc(note)}</div>${probabilityHtml}${bankedHtml}</div>
    <div class="source-details"><h3>${f.timingKind==='hint'?'观察依据':f.state!=='none'?'预告依据':'最近公开消息'}${news?.at&&f.state==='none'?` · ${esc(full(news.at))}`:''}</h3><p class="source-quote"${hasOriginal?' data-original':''}>${esc(text)}</p>${news?.url&&f.state==='none'?`<button class="text-button" data-link="${esc(news.url)}">查看最新原帖 ↗</button>`:''}
      <details class="source-more" data-details="${esc(s.id)}"><summary>查看依据与说明</summary><p${hasOriginal?' data-original':''}>${esc(text)}</p>${f.url?`<button class="text-button" data-link="${esc(f.url)}">查看预告原帖 ↗</button>`:news?.url?`<button class="text-button" data-link="${esc(news.url)}">查看消息原帖 ↗</button>`:s.lastReset?.url?`<button class="text-button" data-link="${esc(s.lastReset.url)}">查看完成原帖 ↗</button>`:''}${f.issuedAt?`<p>原帖发布：${esc(full(f.issuedAt))}</p>`:''}${f.clippedStart?`<p>原始窗口：${esc(full(f.originalStart))} 至 ${esc(full(f.end))}；起点已过去，不再作为下次预计。</p>`:''}${f.resetGapClipped?`<p>原始窗口：${esc(full(f.originalStart))} 至 ${esc(full(f.end))}；按重置后 6 小时间隔，已略去窗口起点。</p>`:''}${news?.context?.url?`<button class="text-button" data-link="${esc(news.context.url)}">查看前文公告 ↗</button>`:''}<ul>${details.map(n=>`<li>${esc(n)}</li>`).join('')}${p.length?'<li>百分比为站方模型估计，不代表已验证的命中率。</li>':''}${f.basis?`<li>${esc(f.basis)}</li>`:''}</ul><p>${esc(s.familyLabel)}</p>${(s.additionalForecasts||[]).map(a=>PaceTiming.remainingSchedule(a)).map(a=>`<div class="additional-forecast"><p><strong>其他预告 · ${esc(a.kindLabel||'重置')}</strong><br>${esc(a.start?full(a.start):full(a.end))}${a.start&&a.end&&a.start!==a.end?` 至 ${esc(full(a.end))}`:''} · ${scheduleLabel(a)}${a.scope?.plans?.length?` · ${esc(a.scope.plans.join('、').toUpperCase())}`:''}</p><p data-original>${esc(a.text)}</p>${a.clippedStart?`<p>原始窗口：${esc(full(a.originalStart))} 至 ${esc(full(a.end))}；起点已过去，不再作为下次预计。</p>`:''}${a.resetGapClipped?`<p>原始窗口：${esc(full(a.originalStart))} 至 ${esc(full(a.end))}；按重置后 6 小时间隔，已略去窗口起点。</p>`:''}${a.url?`<button class="text-button" data-link="${esc(a.url)}">查看该预告原帖 ↗</button>`:''}</div>`).join('')}${oldHtml}${extraSignals.map(n=>`<p data-original>${esc(n.text)}</p>${n.url?`<button class="text-button" data-link="${esc(n.url)}">查看信号原帖 ↗</button>`:''}`).join('')}</details>
    </div><div class="source-footer"><div class="source-times"><span data-source-updated></span><br><span data-source-fetched></span></div><button class="text-button" data-link="${esc(s.url)}">打开原站 ↗</button></div>
  </article>`;
}
function renderSources(sources){
 reconcile($('sources-grid'),sources.map(s=>({key:s.id,markup:cardMarkup(s)})),sourceNodes,node=>{const details=node.querySelector('.source-more');if(details)details.open=detailsExpanded;});
 for(const source of sources){const card=sourceNodes.get(source.id)?.node;if(!card)continue;
  setText(card.querySelector('[data-source-updated]'),`源更新 ${clock(source.updatedAt)}`);
  setText(card.querySelector('[data-source-fetched]'),`本地获取 ${clock(source.fetchedAt)}${source.id==='did'?' · 约3.5分钟':''}`);
 }
}
const identityPending=value=>!value?.quotaCacheChecking&&!!(value?.quotaConnection?.identityChecking||(value?.quotaConnection?.checking&&!value?.quotaConnection?.loginPending));
function render(next) {
  // While account identity is being rechecked, never expose a previously
  // cached account's quota or tie its history to the current session.
  if(identityPending(next))next={...next,quota:null,quotaDisplay:null,localReset:null,localQuotaHistory:(next.localQuotaHistory||[]).filter(row=>!row.accountFingerprint),events:(next.events||[]).filter(e=>!['quota_reset','quota_refill','quota_denied'].includes(e.kind)||!e.accountFingerprint)};
  if(state?.quotaCacheChecking&&!next.quotaCacheChecking&&calendarCheckingNotice){setText($('calendar-result'),'');calendarCheckingNotice=false;}
  const calendarChanged=next.settings.calendarTarget?.at!==state?.settings.calendarTarget?.at||next.settings.timeZone!==state?.settings.timeZone;
  if(next.calendarResetClearedBy&&next.calendarResetClearedBy!==state?.calendarResetClearedBy&&!next.settings.calendarTarget){calendarDate=null;calendarDraft=false;$('calendar-hour').value='';setText($('calendar-result'),'');}
  state=next;
  const nextZone=DashboardTimeZone.normalize(state.settings.timeZone);
  if(zone!==nextZone){zone=nextZone;dateFormat=new Intl.DateTimeFormat('zh-CN',{timeZone:zone,month:'numeric',day:'numeric'});timeFormat=new Intl.DateTimeFormat('zh-CN',{timeZone:zone,hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});calendarDate=null;temporalKey='';lastCalendarMarkup='';}
  if(calendarChanged&&Number.isFinite(Date.parse(state.settings.calendarTarget?.at))){calendarDate=DashboardTimeZone.dateKey(state.settings.calendarTarget.at,zone);$('calendar-hour').value=String(Number(DashboardTimeZone.time(state.settings.calendarTarget.at,zone).split(':')[0]));}
  setText($('display-zone'),zone==='Asia/Shanghai'?'北京时间 UTC+8':zone);
  setText($('calendar-range'),state.quotaCacheChecking?'上次核验账号的缓存 · 核验中':`过去6周 · 未来1周 · ${zoneName()}`);
  setText($('calendar-hour-label'),`小时（${zoneName()}）`);
  document.body.classList.toggle('dark',state.settings.theme==='dark');
  document.body.style.setProperty('--body-font-size',`${state.settings.bodyFontSize||13}px`);
  if(!barDrag&&!barSaving)applyBarOrder(state.settings.barOrder);
  const sources=state.sources || [], c=state.consensus || {};
  const ok=sources.filter(s=>s.status==='ok'&&isFresh(s)).length;
  setMarkup($('live-state'),`<i></i>${state.paused?'监控已暂停':state.refreshing?'正在检查':`${ok}/${sources.length} 信源在线`}`);
  $('live-state').classList.toggle('paused',state.paused || !ok); $('refresh').classList.toggle('spinning',state.refreshing); $('refresh').disabled=state.refreshing || state.paused;
  const cs={confirmed:['已交叉核对',''],pending:['待交叉核对','warn'],conflict:['时间有分歧','error'],unavailable:['待更新','muted']}[c.state] || ['核对中','muted'];
  setText($('consensus-status'),cs[0]); $('consensus-status').className=`pill ${cs[1]}`;
  if (c.at) {
    const t=clock(c.at).split(':');
    setMarkup($('last-reset-value'),`<div class="reset-date">${esc(dateFormat.format(date(c.at)))}</div><div class="reset-time-row"><div class="reset-clock">${esc(t[0])}:${esc(t[1])}<span>:${esc(t[2])}</span></div><div class="reset-elapsed" id="reset-elapsed"></div></div>`);
  } else setMarkup($('last-reset-value'),'<div class="reset-date">等待可靠的记录</div><div class="reset-clock">—</div>');
  setText($('consensus-note'),c.message || '正在比对公开完成记录');
  $('consensus-note').style.color=c.state==='confirmed'?'var(--green)':'var(--secondary)';
  setMarkup($('source-proof'),(c.sources || []).map(s=>{ const spec=sources.find(x=>x.id===s.id); return `<button class="proof-dot" data-link="${esc(spec?.url)}" title="${esc(s.name)}">${esc(spec?.symbol)}</button>`; }).join('')+(c.sources?.length?`<span>${c.sources.length} 站收录 · 同上游已去重</span>`:''));
  setText($('reset-semantics'),c.timeBasis==='effective'?'站方记录的生效时间':'公开完成公告时间');setLocalizedAttribute($('reset-semantics'),'title',c.semantics || '');
  $('original-post').disabled=!c.url;
  renderWeeklyAccounts();
  renderQuota();
  renderSources(sources);
  renderHistory(); if(!state.quotaCacheChecking)renderHypothetical();
  renderEvents();
  const fCount=sources.filter(s=>isFresh(s) && s.forecast && s.forecast.timingKind!=='hint' && !['none','elapsed','invalid'].includes(PaceTiming.forecastState(s.forecast))).length;
  setText($('forecast-subtitle'),fCount?`${fCount} 个站收录了待确认预告`:'各站预计时间与公开依据');
  setText($('pause'),state.paused?'继续监控':'暂停监控');
  $('poll-dot').style.background=state.paused?'#bb9863':ok?'#50a996':'#bb9863';
  populateTimeZones();$('setting-timezone').value=zone;
  if (!$('settings-dialog').open) syncSettings();
  tick();
}
function quotaConnectionMarkup(){
 const c=state.quotaConnection||{};if(state.quotaCacheChecking)return '<strong>上次核验账号的缓存 · 核验中</strong>';if(identityPending(state))return '<p>正在核实账号…</p>';
 const connected=state.quotaDisplay&&!state.quotaDisplay.stale&&state.quota?.state==='ok';
 if(connected)return '<strong>额度已连接</strong>';
 const note=c.loginPending?'已打开登录页，完成授权后自动读取额度。':c.errorCode?'连接未完成，请重试。':c.needsLogin?(c.requiresAccountSwitch?'为看板单独登录 ChatGPT，以读取个人额度。':'内置 Codex 已就绪，登录后即可显示个人额度。'):'正在读取本机额度，请稍后重试。';
 const action=c.loginPending?'<button class="primary-button" data-connect-quota>重新打开登录页</button><button class="text-button" data-cancel-quota-login>取消本次登录</button>':c.needsLogin?'<button class="primary-button" data-connect-quota>登录 ChatGPT 并接入额度</button>':'<button class="text-button" data-refresh-quota>重试读取额度</button>';
 return `<p>${esc(note)}</p><div class="connection-actions">${action}</div>`;
}
let lastQuotaTopHeight=0,lastQuotaPermissionVisible=false,lastQuotaNameHeight=0,lastQuotaNameFontSize=12;
function renderQuota(refreshDetails=true) {
  const stored=state.quotaDisplay,now=Date.now();
  const end=Date.parse(stored?.resetsAt),duration=stored?.durationMins*60000;
  const q=stored?{...stored,theoretical:Number.isFinite(end)&&duration>0?Math.max(0,Math.min(1,(now-end+duration)/duration)):null,stale:stored.stale||state.quota?.state!=='ok'||now-Date.parse(stored.fetchedAt)>120000||end<=now}:null;
  // Retain a stale reading in place: a transient failure must not insert a
  // full sign-in panel into the middle of an otherwise populated card.
  const c=state.quotaConnection||{},checking=identityPending(state),top=$('quota-top')||document.querySelector('.quota-top');
  const connectionPanel=$('quota-connection');connectionPanel.hidden=!!q||checking;
  if(!connectionPanel.hidden){const markup=quotaConnectionMarkup();if(markup!==lastConnectionMarkup){setMarkup(connectionPanel,markup);lastConnectionMarkup=markup;}}
  if (!q) {
    setText($('quota-caption'),'本机 Codex · 剩余额度');
    setMarkup($('quota-value'),'—<span>%</span>');
    top.style.minHeight=checking&&lastQuotaTopHeight?`${lastQuotaTopHeight}px`:'';
    setMarkup($('quota-side'),checking?'<button class="text-button" data-connect-quota aria-disabled="true">正在核实账号…</button>':'<button class="text-button" data-refresh-quota>刷新额度</button>');
    setWidth($('actual-fill'),'0%');setWidth($('theory-fill'),'0%');setText($('actual-percent'),'—');setText($('theory-percent'),'—');
    $('actual-track').removeAttribute('aria-valuenow');$('theory-track').removeAttribute('aria-valuenow');
    $('quota-permission').hidden=!(checking&&lastQuotaPermissionVisible);$('quota-permission').style.visibility=checking?'hidden':'';setText($('quota-reset'),'个人周期独立于全局重置预告');setLocalizedAttribute($('quota-reset'),'title','');
    // A details dialog may still be open during account switching. Clear its
    // old windows immediately even when the main quota card has no reading.
    setMarkup($('quota-details'),quotaConnectionMarkup()+'<p class="help-text">正在读取本机额度…</p>');return;
  }
  top.style.minHeight='';$('quota-permission').style.visibility='';
  const status=state.quotaCacheChecking?'上次核验账号的缓存 · 核验中':q.name+(c.loginPending?' · 等待完成登录':c.errorCode?' · 连接未完成':q.stale?' · 待更新':'');
 const action=c.checking?'正在验证额度…':c.loginPending?'重新打开登录页':'在 Codex 中切换账号';
  setText($('quota-caption'),`本机 Codex · ${period(q.durationMins)} 剩余额度`);
  setMarkup($('quota-value'),`${esc(q.remainingPercent.toFixed(q.remainingPercent%1 ? 1 : 0))}<span>% 剩余</span>`);
  setMarkup($('quota-side'),`<strong>${esc((q.planType || 'Codex').toUpperCase())}</strong><span data-quota-name></span>${q.identityUnverified?'<span>账号未核实</span>':''}${q.resetCredits===null?'':`<span>可用重置卡 ${q.resetCredits} 张</span>`}<button class="text-button" data-connect-quota ${c.checking?'disabled':''}>${action}</button>`);
  const name=$('quota-side').querySelector('[data-quota-name]');setText(name,status);setLocalizedAttribute(name,'title',status);
  if(state.quotaCacheChecking&&lastQuotaNameHeight){name.style.fontSize=Math.min(lastQuotaNameFontSize,12)+'px';name.style.lineHeight=lastQuotaNameHeight+'px';}
  else{name.style.fontSize='';name.style.lineHeight='';lastQuotaNameHeight=name.getBoundingClientRect().height;lastQuotaNameFontSize=parseFloat(getComputedStyle(name).fontSize)||12;}
  if(!state.quotaCacheChecking){
   setWidth($('actual-fill'),`${q.usedPercent}%`);setWidth($('theory-fill'),`${(q.theoretical ?? 0)*100}%`);
   setText($('actual-percent'),`${q.usedPercent}%`);setText($('theory-percent'),q.theoretical===null?'—':`${Math.round(q.theoretical*100)}%`);
   setAttribute($('actual-track'),'aria-valuenow',q.usedPercent);setAttribute($('theory-track'),'aria-valuenow',Math.round((q.theoretical ?? 0)*100));
  }
  setText($('quota-reset'),q.resetsAt?`个人重置 · ${full(q.resetsAt)}`:'本机接口尚未提供重置时刻');
  $('quota-permission').hidden=q.ordinaryUsageAllowed!==false;
  lastQuotaPermissionVisible=!$('quota-permission').hidden;lastQuotaTopHeight=top.getBoundingClientRect().height;
  setLocalizedAttribute($('quota-reset'),'title',`额度读取：${full(q.fetchedAt)}`);
  if (refreshDetails) renderQuotaDetails();
}
function renderQuotaDetails() {
 const buckets=state.quotaDisplay ? (state.quota?.limits || []) : [];
 setMarkup($('quota-details'),quotaConnectionMarkup()+(buckets.length?buckets.map(b=>`<div class="event-row"><h3>${esc(b.name)}</h3>${['primary','secondary'].filter(k=>b[k]).map(k=>{const w=b[k];return `<p>${esc(period(w.durationMins))}额度 · 剩余 ${esc((100-w.usedPercent).toFixed(0))}%<br>重置 ${esc(full(w.resetsAt))}</p><button class="text-button" data-quota-bucket="${esc(b.id)}" data-quota-window="${k}">在看板显示此周期</button>`;}).join('')}</div>`).join(''):`<p class="help-text">${esc(state.quota?.message || '正在读取本机额度…')}</p>`));
}
function historyRowMarkup(r){
   const hasBanked=r.type==='personal_card'||r.type==='plan_upgrade';
   const proof=(r.members||[r]).map(member=>`<p><strong>${esc(member.type==='local'?'本机到账记录':member.type==='observation'?'站方观察':member.kindLabel||'全局重置')}</strong> · ${esc(precise(member.at))}${member.text?`<br><span data-original>${esc(member.text)}</span>`:''}${member.url?` <button class="text-button" data-link="${esc(member.url)}">查看原帖 ↗</button>`:''}</p>`).join('')+(r.sources||[]).map(source=>`<p><strong>${esc(source.name||source.id)}</strong> · ${source.at?'来源记录时间 '+esc(precise(source.at)):'来源时间未记录'}<br>采集链：${esc(source.family||'unverified')} ${source.url?`<button class="text-button" data-link="${esc(source.url)}">查看原帖 ↗</button>`:''}</p>`).join('');
   const mergedProof=r.mergedCount>1?`<p class="history-evidence">相近重置记录已合并</p><details class="history-proof"><summary>查看各站记录</summary>${proof}</details>`:'';
   if(r.type==='local'||r.hasLocalReset||r.type==='personal_card'||r.type==='plan_upgrade'){
     const known=Number.isFinite(r.beforeRemainingPercent)&&r.beforeRemainingPercent>=0&&r.beforeRemainingPercent<=100;
     const after=Number.isFinite(r.afterRemainingPercent)&&r.afterRemainingPercent>=0&&r.afterRemainingPercent<=100;
     const value=known?r.beforeRemainingPercent.toFixed(0)+'%':'未记录';
     return `<article class="history-row history-local${hasBanked?' history-banked':''}" data-history-type="${esc(r.type)}"><div class="history-time"><time>${esc(dateFormat.format(date(r.at)))}<strong>${esc(clock(r.at))}</strong></time><span>${r.hasLocalReset?'本机到账时间':'本机确认时间'}</span></div><div class="history-content"><div class="history-row-heading"><span class="pill">${r.periodicWindow?(r.refillReasonUnverified?'周期额度补充 · 原因待核实':'周期额度补充'):r.type==='plan_upgrade'?'套餐升级补充':r.type==='personal_card'?(r.cardInferred?'疑似重置卡 · 原因待核实':'个人重置卡'):r.hasLocalReset?'全局重置':r.refillReasonUnverified?'本机额度补充 · 原因待核实':'本机额度补充'}</span><span class="history-evidence">${esc(r.bucketId||'Codex')} · ${r.windowKey==='secondary'?'副额度窗口':'主额度窗口'}${r.identityUnverified?' · 账号未核实':''}${r.hasLocalReset&&r.refillReasonUnverified?' · 原因待核实':''}${r.hasBankedIssuance?' · 含发卡公告':''}</span></div><p class="history-quote">${after?'补充后剩余 '+esc(r.afterRemainingPercent.toFixed(0))+'%':'补充后额度未记录'}</p>${r.type==='plan_upgrade'&&Number.isFinite(r.beforeMultiplier)&&Number.isFinite(r.afterMultiplier)?`<p class="history-evidence">${esc(r.beforeMultiplier)}x → ${esc(r.afterMultiplier)}x</p>`:''}${known&&r.beforeFetchedAt?`<p class="history-evidence">补充前最后读取 · ${esc(precise(r.beforeFetchedAt))}</p>`:''}${mergedProof}</div><div class="history-quota-before${known?'':' unknown'}"><span>补充前剩余</span><strong>${esc(value)}</strong>${known&&r.beforeBasis==='snapshot'&&r.beforeFetchedAt?`<small class="history-quota-before-note">快照 · ${esc(precise(r.beforeFetchedAt))}</small>`:''}</div></article>`;
   }
   const plans=r.scope?.plans||[], limited=plans.length&&!plans.includes('all');
   const type=r.type==='observation'?'站方观察':r.type==='commentary'?'回顾':r.type==='repair'?'限定套餐修复':r.type==='banked'?'发卡公告':r.type==='global_and_banked'?'全局＋重置卡':limited?'限定套餐重置':'全局重置';
   const scope=limited?` · ${plans.map(p=>p.toUpperCase()).join('、')}`:'';
   return `<article class="history-row${r.type==='banked'?' history-issued':hasBanked?' history-banked':''}" data-history-type="${esc(r.type)}"><div class="history-time"><time>${esc(dateFormat.format(date(r.at)))}<strong>${esc(clock(r.at))}</strong></time><span>${r.type==='observation'?'观察记录时间':['commentary','repair'].includes(r.type)?'消息发布时间':r.timeBasis==='effective'?'记录生效时间':'完成公告时间'}</span></div><div class="history-content"><div class="history-row-heading"><span class="pill ${r.type==='banked'?'warn':''}">${esc(type+scope)}</span><span class="history-evidence">${r.familyCount>=2?`${r.familyCount} 条采集链收录`:'单源记录'} · ${new Set(r.sources.map(s=>s.id)).size} 站${r.timeConflict?' · 记录时间存在分歧':''}${r.hasBankedIssuance?' · 含发卡公告':''}</span></div><p class="history-quote"${r.text?' data-original':''}>${esc(r.text||'已收录完成记录，请查看来源原文。')}</p>${r.type==='banked'?'<p class="history-evidence">仅发放重置卡，未表示本机额度已补充</p>':''}${r.mergedCount>1?'<p class="history-evidence">相近重置记录已合并</p>':''}<details class="history-proof"><summary>查看各站记录</summary>${r.mergedCount>1?proof:''}${(r.mergedCount>1?[]:r.sources).map(s=>`<p><strong>${esc(s.name)}</strong> · ${s.phase==='commentary'?'回顾':s.phase==='repair'?'限定套餐修复':s.evidenceOnly?'观察记录':'完成记录'} · ${s.at?'来源记录时间 '+esc(precise(s.at)):'来源时间未记录'}<br>采集链：${esc(s.family||'unverified')} ${s.url?`<button class="text-button" data-link="${esc(s.url)}">查看原帖 ↗</button>`:''}</p>`).join('')}</details></div>${r.url?`<button class="text-button" data-link="${esc(r.url)}">查看原帖 ↗</button>`:''}</article>`;
}
let protectedHistory=null;
function hideAccountHistory(){
 if(protectedHistory)return;protectedHistory=new Map();
 for(const [key,item] of historyNodes){const old=item.node;if(!old?.matches('.history-local')||!old.isConnected)continue;
  const index=[...old.querySelectorAll('button,summary,a,input')].indexOf(document.activeElement),open=[...old.querySelectorAll('details')].map(node=>node.open),height=old.getBoundingClientRect().height;
  const placeholder=document.createElement('article');placeholder.className='history-row history-checking';placeholder.style.height=height+'px';placeholder.setAttribute('aria-label','正在核实账号');placeholder.tabIndex=-1;
  old.replaceWith(placeholder);item.node=placeholder;item.markup=null;protectedHistory.set(key,{open,index,placeholder});if(index>=0)placeholder.focus({preventScroll:true});
 }
}
function restoreHistoryPresentation(){
 if(!protectedHistory)return;
 for(const [key,saved] of protectedHistory){const row=historyNodes.get(key)?.node;if(!row||row===saved.placeholder)continue;row.querySelectorAll('details').forEach((item,i)=>{if(saved.open[i]!==undefined)item.open=saved.open[i];});if(saved.index>=0&&saved.hadFocus)row.querySelectorAll('button,summary,a,input')[saved.index]?.focus({preventScroll:true});}
 protectedHistory=null;
}
function renderHistory(now=Date.now()) {
 if(state.quotaCacheChecking){setText($('history-range'),'上次核验账号的缓存 · 核验中');return;}
 if(identityPending(state)){hideAccountHistory();return;}
 const cutoff=PaceTiming.historyStart(now),rows=HistoryGroups.rows(state.history,state.localQuotaHistory,{now,cutoff,zone});
 setText($('history-range'),state.quotaCacheChecking?'上次核验账号的缓存 · 核验中':`从 2026/9/1 起 · 最新在上 · ${zoneName()}`);
 const counts=new Map();
 const entries=rows.length?rows.map(r=>{
  // The key stays in JS memory only; local record IDs may contain account hashes.
  const base=JSON.stringify([r.id||'',r.type||'',r.at||'',r.url||'',r.bucketId||'',r.windowKey||'']);
  const count=counts.get(base)||0;counts.set(base,count+1);
  return {key:`${base}|${count}`,markup:historyRowMarkup(r)};
 }):[{key:'empty',markup:'<p class="history-empty">正在获取 2026/9/1 以来的完成记录…</p>'}];
 const focused=protectedHistory&&[...protectedHistory.values()].find(item=>item.index>=0&&document.activeElement===item.placeholder);
 reconcile($('history-list'),entries,historyNodes);
 // Replacing the focused placeholder temporarily moves focus to the body.
 if(focused)focused.hadFocus=true;restoreHistoryPresentation();
}
let calendarDate=null,calendarSaving=false,calendarDraft=false,lastCalendarMarkup='',calendarMasked=false,calendarCheckingNotice=false;
function hideAccountCalendar(){
 if(calendarMasked)return;calendarMasked=true;
 for(const item of $('reset-calendar').querySelectorAll('[data-local-quota]')){const cell=item.closest('[data-calendar-day]'),box=item.getBoundingClientRect(),blank=document.createElement('span');blank.className='calendar-time';blank.style.width=box.width+'px';blank.style.height=box.height+'px';blank.setAttribute('aria-hidden','true');item.replaceWith(blank);if(cell){cell.title=cell.dataset.calendarDay+' · 正在核实账号';cell.setAttribute('aria-label',cell.dataset.calendarDay+' · 正在核实账号');}}
}

const dayLabel=days=>String(days>=.01?Number(days.toFixed(3)):Number(days.toPrecision(2)));
function renderCalendar(now=Date.now()){
 if(state.quotaCacheChecking)return;
 if(identityPending(state)){hideAccountCalendar();return;}
 if(calendarMasked){calendarMasked=false;lastCalendarMarkup='';}
 const model=ResetCalendar.calendar(state.history,now,zone,{localHistory:state.localQuotaHistory||[],currentAccountFingerprint:state.quotaDisplay?.accountFingerprint||null}),pace=PaceTiming.calendarPace(state.settings.calendarTarget,now,{quota:state.quotaDisplay,localReset:state.localReset,localHistory:state.localQuotaHistory});
 if(calendarDate&&(calendarDate<=model.today||calendarDate>model.end))calendarDate=null;
 const targetDay=pace.available?ResetCalendar.dateKey(pace.end,zone):null;
 const showBanked=$('calendar-show-banked').checked,showLimited=$('calendar-show-limited').checked;
 const markup=model.months.map(month=>`<section class="calendar-month"><h3 class="calendar-month-heading" style="margin-left:calc(${month.cells.findIndex(c=>c.inRange)%7} * (100% + 4px) / 7)">${state.settings.language==='en'?month.month:month.month+'月'}</h3><div class="calendar-month-grid">`+month.cells.map(c=>{
  if(!c.inRange)return '<div class="calendar-cell empty" aria-hidden="true"></div>';
  const isCard=e=>e.type==='banked'||e.type==='personal_card';
  const cardVisible=e=>showBanked&&(isCard(e)||e.hasBankedIssuance);
  const events=c.events.filter(e=>(showBanked||!isCard(e))&&(showLimited||!e.scope?.plans?.length||e.scope.plans.includes('all')));
  const assumed=targetDay===c.key,hasReset=events.some(e=>e.type!=='banked'&&!e.periodicWindow);
  const labels=events.map(e=>`${e.time}${e.periodicWindow?' · 周期额度补充':cardVisible(e)?e.cardInferred?' · 疑似重置卡 · 原因待核实':' · 重置卡':e.scope?.plans?.length&&!e.scope.plans.includes('all')?' · '+e.scope.plans.join('/').toUpperCase():''}${e.identityUnverified?' · 账号未核实':''}${e.refillReasonUnverified&&!e.cardInferred?' · 原因待核实':''}`);
  const text=labels.join('；')+(assumed?`${labels.length?'；':''}假设时间 ${full(pace.end)}`:'');
  return `<button class="calendar-cell${c.future?' future':''}${c.today?' is-today':''}${hasReset?' has-reset':''}${calendarDate===c.key?' selected':''}${assumed?' assumed':''}" data-calendar-day="${c.key}" ${c.future?'':'disabled'} aria-label="${esc(c.key+' '+text)}" aria-pressed="${calendarDate===c.key}" title="${esc(c.key+' '+text)}"><span class="calendar-day"><span class="calendar-day-number">${c.day}</span></span>${labels.map((label,i)=>`<span class="calendar-time${events[i].periodicWindow?' periodic':cardVisible(events[i])?' banked':''}"${events[i].type==='local'||events[i].hasLocalReset||events[i].type==='personal_card'||events[i].type==='plan_upgrade'?' data-local-quota':''}>${esc(events[i].time)}</span>`).join('')}${assumed?`<span class="calendar-time assumed-time">${esc(clock(pace.end).slice(0,5))}</span>`:''}</button>`;
 }).join('')+'</div></section>').join('');
 if(markup!==lastCalendarMarkup){const focused=document.activeElement?.closest?.('[data-calendar-day]')?.dataset.calendarDay;$('reset-calendar').innerHTML=markup;lastCalendarMarkup=markup;localeDirty=true;if(focused){const next=[...$('reset-calendar').querySelectorAll('[data-calendar-day]')].find(node=>node.dataset.calendarDay===focused&&!node.disabled);next?.focus({preventScroll:true});}}
 if($('calendar-selected').value!==(calendarDate||''))$('calendar-selected').value=calendarDate||'';
 setText($('calendar-current'),pace.available?`指定时间 · ${full(pace.end)}`:'');
 let valid=false;
 if(!calendarDate)setText($('calendar-preview'),'请先选择未来日期');
 else try{
  const value=$('calendar-hour').value,hour=value.trim()===''?NaN:Number(value);
  const result=ResetCalendar.daysForTarget(PaceTiming.hypotheticalPace(state.consensus,1,now,state.history,{quota:state.quotaDisplay,localReset:state.localReset}).anchor,calendarDate,hour,now,zone);valid=true;
  setText($('calendar-preview'),`目标 ${full(result.targetAt)} · 日历节奏`);
 }catch(error){setText($('calendar-preview'),error.reason==='NONEXISTENT_HOUR'?'此时区没有这个整点，请选择其他小时':error.code==='NO_ANCHOR'?'等待已核对的全局重置，以设置假设时间':error.code==='INVALID_PERIOD'?'假设天数须大于0且不超过365':'请选择未来一周的日期及0—23点');}
 $('calendar-confirm').disabled=calendarSaving||!valid;
}
function calendarCheckingMessage(){calendarCheckingNotice=true;setText($('calendar-result'),'正在核实账号，完成后可修改日历预测。');applyLocale();}
$('reset-calendar').addEventListener('click',event=>{if(state.quotaCacheChecking){calendarCheckingMessage();return;}const day=event.target.closest('[data-calendar-day]');if(!day||day.disabled)return;calendarDate=day.dataset.calendarDay;calendarDraft=true;$('calendar-hour').value='12';setText($('calendar-result'),'');renderCalendar();renderCalendarPace();applyLocale();});
for(const id of ['calendar-hour','calendar-show-banked','calendar-show-limited'])$(id).addEventListener(id==='calendar-hour'?'input':'change',()=>{if(state.quotaCacheChecking){calendarCheckingMessage();return;}if(id==='calendar-hour')calendarDraft=true;setText($('calendar-result'),'');renderCalendar();renderCalendarPace();applyLocale();});
$('calendar-confirm').addEventListener('click',async()=>{
 if(state.quotaCacheChecking){calendarCheckingMessage();return;}
 if(calendarSaving||$('calendar-confirm').disabled)return;
 calendarSaving=true;renderCalendar();
 const saved=await call(()=>window.dashboard.saveSettings({calendarTarget:{day:calendarDate,hour:Number($('calendar-hour').value)}}));
 calendarSaving=false;if(saved){calendarDraft=false;render(saved);setText($('calendar-result'),'已更新日历节奏');}renderCalendar();renderCalendarPace();applyLocale();
});

$('calendar-clear').addEventListener('click',async()=>{const saved=await call(()=>window.dashboard.saveSettings({clearCalendarTarget:true}));if(saved){calendarDraft=false;calendarDate=null;render(saved);setText($('calendar-result'),'日期假设已清除');applyLocale();}});
$('clear-hypothetical').addEventListener('click',async()=>{const saved=await call(()=>window.dashboard.saveSettings({clearHypothetical:true}));if(saved)render(saved);});
function renderCalendarPace(now=Date.now()){
 if(state?.quotaCacheChecking)return;
 let target=state.settings.calendarTarget;
 if(calendarDraft){
  target=null;
  try{const raw=$('calendar-hour').value,hour=raw.trim()===''?NaN:Number(raw),anchorPace=PaceTiming.hypotheticalPace(state.consensus,1,now,state.history,{quota:state.quotaDisplay,localReset:state.localReset}),anchor=anchorPace.anchor;
   const selected=ResetCalendar.daysForTarget(anchor,calendarDate,hour,now,zone),account=['local','cycle'].includes(anchorPace.origin);target={at:selected.targetAt,anchor,anchorScope:account?'account':'public',...(account&&state.quotaDisplay?.accountFingerprint?{accountFingerprint:state.quotaDisplay.accountFingerprint}:{})};
  }catch{}
 }
 const pace=PaceTiming.calendarPace(target,now,{quota:state.quotaDisplay,localReset:state.localReset,localHistory:state.localQuotaHistory}),progress=pace.available?pace.progress:null;
 setText($('calendar-target-label'),pace.available?`日历预测 ${dateFormat.format(date(pace.end))}${calendarDraft?' · 预览':''}`:'日历预测');
 setWidth($('calendar-fill'),`${(progress??0)*100}%`);
 const percent=progress===null?'—':progress===0?'0%':progress===1?'100%':progress<.0001?'<0.01%':`${(progress*100).toFixed(2)}%`;
 setAttribute($('calendar-track'),'aria-valuenow',Number(((progress??0)*100).toFixed(4)));
 setAttribute($('calendar-track'),'aria-valuetext',percent);
 setText($('calendar-percent'),percent);
 const note=pace.available?`${pace.origin==='receipt'?'从本机补充记录时间起算 · ':pace.origin==='local'?'从本机最近补充起算 · ':pace.origin==='cycle'?'从本机额度周期起算 · ':''}起点 ${full(pace.anchor)} · 指定时间 · ${full(pace.end)} · 已过时间占所选周期${calendarDraft?' · 预览，点击确定保存':''}`:calendarDraft?'请选择有效日期和小时':'未设置日历预测';
 setText($('calendar-pace-note'),note);
 setLocalizedAttribute($('calendar-track'),'title',note);
 $('calendar-clear').disabled=!state.settings.calendarTarget&&!calendarDraft;
}
function renderHypothetical(now=Date.now(),warning=null) {
 if(state?.quotaCacheChecking)return;
 const days=state.settings.hypotheticalDays||3,pace=PaceTiming.hypotheticalPace(state.consensus,days,now,state.history,{quota:state.quotaDisplay,localReset:state.localReset});
 const at=Date.parse(pace.anchor),known=pace.available;
 const progress=known&&state.settings.hypotheticalEnabled!==false?pace.progress:null;
 setText($('hypothetical-days-label'),dayLabel(days));
 setWidth($('hypothetical-fill'),`${(progress??0)*100}%`);
 setAttribute($('hypothetical-track'),'aria-valuenow',Math.round((progress??0)*100));
 setText($('hypothetical-percent'),progress===null?'—':`${Math.round(progress*100)}%`);
 const base=state.settings.hypotheticalEnabled===false?'天数假设已清除':known?progress>=1?'假设周期已到期 · 等待实际重置':`假设 ${dayLabel(days)} 天 · ${pace.origin==='local'?'从本机最近补充起算':pace.origin==='cycle'?'从本机额度周期起算':'从最近全局重置起算'} · 参考到期 ${full(new Date(at+days*86400000).toISOString())}`:'等待已核对的全局重置，以显示假设节奏';
 const w=warning||PaceTiming.warning(state.sources,state.quotaDisplay,state.consensus,days,now,state.localReset);
 setText($('hypothetical-note'),base+(w.active?` · 红线：${w.mapped?'预告消耗节奏，从'+w.axisLabel+'起算':'等待可靠起点'}（预告优先）`:''));
}
function renderForecastWarning(now=Date.now(),warning=null) {
 if(state?.quotaCacheChecking)return;
 const w=warning||PaceTiming.warning(state.sources,state.quotaDisplay,state.consensus,state.settings.hypotheticalDays||3,now,state.localReset);
 document.body.classList.toggle('reset-alert',w.active);
 $('forecast-warning').hidden=!w.active; $('forecast-markers').hidden=!w.active||!w.mapped;
 const markers=$('forecast-markers');
 if(!w.active){if(markers.childElementCount)markers.replaceChildren();markers.dataset.shape='none';return;}
 const when=full(new Date(w.earliest).toISOString())+(w.range?` — ${full(new Date(w.latest).toISOString())}`:'');
 const hours=Math.max(0,(w.earliest-now)/3600000);
 const countdown=w.earliest<=now?'已进入预告窗口':`最早约 ${hours.toFixed(1)} 小时后`;
 const pace=w.mapped?` · 目标消耗 ${w.range? w.left.toFixed(1)+'%—'+w.right.toFixed(1)+'%':w.right.toFixed(1)+'%'}`:' · 等待可靠起点';
 setText($('forecast-warning'),`加速提醒 · ${when} · ${countdown}${pace} · ${w.sourceCount} 站预告`);
 setLocalizedAttribute($('forecast-warning'),'title',`红线从${w.axisLabel}起算，随时间推进，按预告时刻用完100%额度；多时刻显示目标节奏范围。预告截止不表示已完成，实际到账以本机额度为准。`);
 const shape=w.mapped?(w.range?'range':'point'):'none';
 if(markers.dataset.shape!==shape){const nodes=[];if(shape==='range'){const band=document.createElement('div');band.className='forecast-band';nodes.push(band);}if(shape!=='none'){const first=document.createElement('i');first.className='forecast-line';nodes.push(first);if(shape==='range'){const last=document.createElement('i');last.className='forecast-line';nodes.push(last);}}markers.replaceChildren(...nodes);markers.dataset.shape=shape;}
 if(w.mapped){const lines=markers.querySelectorAll('.forecast-line'),left=`${w.left}%`;if(lines[0].style.left!==left)lines[0].style.left=left;if(w.range){const right=`${w.right}%`,band=markers.querySelector('.forecast-band'),width=`${w.right-w.left}%`;if(lines[1].style.left!==right)lines[1].style.left=right;if(band.style.left!==left)band.style.left=left;if(band.style.width!==width)band.style.width=width;}}
}
function tick() {
  const now=new Date();
  setMarkup($('local-date'),'<span></span><strong></strong>');
  setText($('local-date').querySelector('span'),new Intl.DateTimeFormat(DashboardI18n.locale(state?.settings.language),{timeZone:zone,month:'long',day:'numeric',weekday:'long'}).format(now));
  setText($('local-date').querySelector('strong'),timeFormat.format(now));
  if (!state) return;
  renderWeeklyAccounts(now.getTime());
  const elapsed=$('reset-elapsed');if(elapsed&&state.consensus?.at){const hours=Math.max(0,(Date.now()-Date.parse(state.consensus.at))/3600000);setMarkup(elapsed,'<span>距今</span><strong><span><span data-elapsed-hours></span><small>小时</small></span><span class="elapsed-days"><small>=</small><span data-elapsed-days></span><small>天</small></span></strong>');setText(elapsed.querySelector('[data-elapsed-hours]'),hours.toFixed(2));setText(elapsed.querySelector('[data-elapsed-days]'),(hours/24).toFixed(2));}
  const warning=state.quotaCacheChecking?null:PaceTiming.warning(state.sources,state.quotaDisplay,state.consensus,state.settings.hypotheticalDays||3,now.getTime(),state.localReset);
  renderQuota(false);renderHypothetical(now.getTime(),warning);renderCalendarPace(now.getTime());renderCalendar(now.getTime());renderForecastWarning(now.getTime(),warning);
  const newsDeadlines=(state.sources||[]).map(s=>{const news=PaceTiming.latestNews(s,now.getTime());return Date.parse(news?.end||news?.start)<=now.getTime();}).join(',');
  const key=(state.sources||[]).map(s=>`${s.id}:${isFresh(s)}:${[s.forecast,...(s.additionalForecasts||[])].map(f=>PaceTiming.forecastState(f)+':'+!!PaceTiming.remainingSchedule(f).clippedStart).join(',')}`).join('|')+newsDeadlines+PaceTiming.historyStart(now.getTime());
  if(!state.quotaCacheChecking&&key!==temporalKey){temporalKey=key;renderSources(state.sources||[]);renderHistory(now.getTime());
   const ok=(state.sources||[]).filter(isFresh).length;setMarkup($('live-state'),`<i></i>${state.paused?'监控已暂停':state.refreshing?'正在检查':`${ok}/${state.sources.length} 信源在线`}`);
   if(state.consensus?.state==='confirmed'&&!state.consensus.sources?.some(proof=>isFresh(state.sources.find(s=>s.id===proof.id)))){setText($('consensus-status'),'上次核对 · 待更新');$('consensus-status').className='pill warn';setText($('consensus-note'),'信源信息已过期，保留上次核对的时间');}
  }
  let countdown=state.nextPollAt?Math.max(0,Math.ceil((Date.parse(state.nextPollAt)-Date.now())/1000)):30;
  setLiveLocalizedText($('poll-status'),state.paused?'监控已暂停':state.refreshing?'正在获取信源信息…':`每 30 秒检查 · ${countdown || 30} 秒后再次检查`);
  setText($('notification-status'),Date.parse(state.resetQuietUntil)>Date.now()?`重置系统通知已静默至 ${full(state.resetQuietUntil)}（${zoneName()}）`:state.notificationStatus || '系统勿扰模式可能将通知收进通知中心。');
  applyLocale();
}
function populateTimeZones(){
 const select=$('setting-timezone'),language=state.settings.language||'zh-CN';if(select.dataset.language===language)return;
 const zones=[...new Set(['Asia/Shanghai','UTC',...Intl.supportedValuesOf('timeZone')])];
 setMarkup(select,zones.map(z=>{const name=new Intl.DateTimeFormat(DashboardI18n.locale(language),{timeZone:z,timeZoneName:'long'}).formatToParts(new Date()).find(p=>p.type==='timeZoneName')?.value||z;return `<option value="${esc(z)}">${esc(z+' · '+name)}</option>`;}).join(''));select.dataset.language=language;
}
function syncSettings() {
  if (!state) return;
  $('setting-language').value=state.settings.language||'zh-CN';
  populateTimeZones();$('setting-timezone').value=zone;
  $('setting-notify').checked=state.settings.notify; $('setting-sound').checked=state.settings.sound;
  $('setting-tray').checked=state.settings.closeToTray; $('setting-autostart').checked=state.settings.autoStart; $('setting-dark').checked=state.settings.theme==='dark';
  $('setting-hypothetical-days').value=state.settings.hypotheticalDays||3;
  $('setting-body-font').value=state.settings.bodyFontSize||13;setText($('body-font-value'),`${state.settings.bodyFontSize||13} px`);
  $('quota-limit-field').hidden=!(state.quota?.limits?.length>1);
  setMarkup($('quota-limit-select'),(state.quota?.limits || []).map(q=>`<option value="${esc(q.id)}">${esc(q.name)}</option>`).join(''));
  $('quota-limit-select').value=state.settings.quotaLimitId;
}
function openSettings() { syncSettings();setText($('settings-error'),'');$('settings-dialog').showModal();applyLocale(); }
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
 if(saved){render(saved);setText($('bar-sort-status'),'横条顺序已保存');applyLocale();}
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
function renderEvents() {
  const events=state.events || [];
  setMarkup($('events-list'),events.length?events.map(e=>`<div class="event-row"><h3>${esc(e.title)}</h3>${['quota_reset','quota_refill','quota_denied'].includes(e.kind)&&!e.accountFingerprint?'<p class="history-evidence">账号未核实</p>':''}<p>${esc(e.body)}</p><time>${esc(full(e.at))}</time>${e.evidence?.length?[...new Map(e.evidence.filter(p=>p.url).map(p=>[p.url,p])).values()].map(p=>`<button class="text-button" data-link="${esc(p.url)}">${esc(state.sources.find(s=>s.id===p.sourceId)?.name||'查看来源')} ↗</button>`).join(''):e.url?`<button class="text-button" data-link="${esc(e.url)}">查看来源 ↗</button>`:''}</div>`).join(''):'<div class="events-empty">还没有新的关键变化。<br>有新预告或确认重置时，提醒会保留在这里。</div>');
}
async function openEvents() {
  renderEvents();$('events-dialog').showModal();applyLocale(); await call(()=>window.dashboard.readEvents());
}
document.addEventListener('click',event=>{
  const close=event.target.closest('[data-close]'); if(close) $(close.dataset.close).close();
  const link=event.target.closest('[data-link]'); if(link?.dataset.link) call(()=>window.dashboard.openLink(link.dataset.link));
  const control=event.target.closest('[data-window]'); if(control) call(()=>window.dashboard.window(control.dataset.window));
  const connect=event.target.closest('[data-connect-quota]');if(connect&&connect.getAttribute('aria-disabled')!=='true') call(()=>window.dashboard.connectQuota());
  if(event.target.closest('[data-cancel-quota-login]')) call(()=>window.dashboard.cancelQuotaLogin());
  if(event.target.closest('[data-refresh-quota]')) call(()=>window.dashboard.refreshQuota());
  const quotaChoice=event.target.closest('[data-quota-bucket]');
  if(quotaChoice) call(()=>window.dashboard.saveSettings({quotaLimitId:quotaChoice.dataset.quotaBucket,quotaWindow:quotaChoice.dataset.quotaWindow}));
});
$('refresh').addEventListener('click',()=>call(()=>window.dashboard.refresh()));
$('pause').addEventListener('click',()=>call(()=>window.dashboard.pause()));
$('settings-button').addEventListener('click',openSettings);
$('events-button').addEventListener('click',openEvents);
$('quota-settings').addEventListener('click',openQuota);
$('hypothetical-settings').addEventListener('click',()=>{openSettings();$('setting-hypothetical-days').focus();});

$('settings-refresh-quota').addEventListener('click',()=>call(()=>window.dashboard.refreshQuota()));
$('quota-details-refresh').addEventListener('click',()=>call(()=>window.dashboard.refreshQuota()));
$('quota-open').addEventListener('click',()=>call(()=>window.dashboard.refreshQuota()));
$('original-post').addEventListener('click',()=>state.consensus?.url && call(()=>window.dashboard.openLink(state.consensus.url)));

for (const [id,key] of [['setting-notify','notify'],['setting-sound','sound'],['setting-tray','closeToTray'],['setting-autostart','autoStart']]) $(id).addEventListener('change',async()=>{
  try { await window.dashboard.saveSettings({[key]:$(id).checked});setText($('settings-error'),''); } catch(error) { setText($('settings-error'),error.message.replace(/^Error invoking remote method '[^']+': Error: /,''));$(id).checked=state.settings[key]; }applyLocale();
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
$('setting-hypothetical-days').addEventListener('change',async()=>{const days=Number($('setting-hypothetical-days').value);if(!Number.isFinite(days)||days<=0||days>365){setText($('settings-error'),'假设天数须大于0且不超过365');applyLocale();return;}await call(()=>window.dashboard.saveSettings({hypotheticalDays:days}));setText($('settings-error'),'');applyLocale();});
$('setting-body-font').addEventListener('input',()=>{const size=Number($('setting-body-font').value);document.body.style.setProperty('--body-font-size',`${size}px`);setText($('body-font-value'),`${size} px`);});
$('setting-body-font').addEventListener('change',()=>call(()=>window.dashboard.saveSettings({bodyFontSize:Number($('setting-body-font').value)})));
window.dashboard.onState(render);
window.dashboard.get().then(render).then(()=>window.dashboard.ready()).catch(()=>toast('看板初始化失败，请重新打开软件'));
setInterval(tick,1000);

$('setting-language').addEventListener('change',()=>call(()=>window.dashboard.saveSettings({language:$('setting-language').value})));
