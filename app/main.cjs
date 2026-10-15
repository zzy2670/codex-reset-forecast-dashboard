'use strict';
const { app, BrowserWindow, ipcMain, Tray, Menu, Notification, nativeImage, shell, powerMonitor, screen, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { SOURCES, normalize, calibratedReset, changes, freshness, safeUrl } = require('./core.cjs');

const { LocalCodexQuota, quotaView,quotaChanges } = require('./codex-quota.cjs');
const {historyStart,hypotheticalPace,resetHistory}=require('./dashboard-model.cjs');
const {projectForecasts,projectAfterReset}=require('./ui/pace-timing.js');
const BarOrder=require('./ui/bar-order.js');
const {REQUEST_TIMEOUT_MS,buildFailure}=require('./source-retry.cjs');
const I18n=require('./ui/i18n.js');
const isolatedDeploymentHome=process.argv.includes('--deployment-check')?(process.argv.find(a=>a.startsWith('--deployment-isolated-home='))?.slice('--deployment-isolated-home='.length)||process.env.DASHBOARD_DEPLOYMENT_ISOLATED_HOME):null;
const connectionHome=isolatedDeploymentHome&&path.isAbsolute(isolatedDeploymentHome)?isolatedDeploymentHome:path.join(app.getPath('appData'),'Codex Reset Dashboard');
const localQuota = new LocalCodexQuota({managedHome:path.join(connectionHome,'codex-account')});
const activeNotifications = new Map();
const {mergeMessage,toastXml,shouldNotify,isQuiet,notificationId,acknowledgeReset,recoverLocalReset}=require('./notification-policy.cjs');

const verification=process.argv.includes('--verification-test');
const deploymentCheck=process.argv.includes('--deployment-check');
const smoke = process.argv.includes('--smoke-test')||verification||deploymentCheck;
let connection={checking:true},connectionFlight=null;
const APP_ID = 'local.codex.resetdashboard';
app.setPath('userData',path.join(app.getPath('appData'),'Codex Reset Dashboard'));
app.setName('codex重置预测看板');
app.setAppUserModelId(APP_ID);
if (smoke) {
  const profile=process.argv.find(a=>a.startsWith('--verification-profile='))?.split('=')[1];
  app.setPath('userData', verification||deploymentCheck?path.join(app.getPath('temp'),'CodexResetDashboard-verification',profile&&/^[a-zA-Z0-9-]+$/.test(profile)?profile:String(process.pid)):path.join(app.getPath('temp'),'CodexResetDashboard-smoke'));
}
const dataFile = path.join(app.getPath('userData'), 'dashboard-state.json');
let win, tray, quitting = false, running = false, quotaRunning = false, quotaFlight=null, refreshTimer, quotaTimer;
const defaults = { language:Intl.DateTimeFormat().resolvedOptions().locale.startsWith('zh')?'zh-CN':'en', notify: true, sound: false, closeToTray: true, autoStart: true, quotaLimitId: 'codex', quotaWindow: 'secondary', theme: 'dark', hypotheticalDays:3, bodyFontSize:13,barOrder:BarOrder.defaults };
let state = { settings: { ...defaults }, sources: [], quota: null, quotaOptions: [], events: [], seen: [], paused: false, lastPollAt: null, nextPollAt: null, notificationStatus: null, baseline: false, confirmedId: null };
try {
  const saved = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  state = { ...state, ...saved, settings: { ...defaults, ...saved.settings, language:saved.settings?.language||'zh-CN' }, paused: false };
} catch { /* First launch or incomplete state: obtain new observations. */ }
state.settings.barOrder=BarOrder.normalize(state.settings.barOrder);
// Backfill captured public completion records through the normal history merger.
// This never creates forecast signals, events or notifications.
state.history=resetHistory([], [...require('./history-seed.json'),...(state.history||[])]);
for(const group of state.notificationGroups||[])group.pending=false;
if (!state.schemaVersion || state.schemaVersion < 2) {
  state.settings = { ...defaults, ...state.settings, theme: 'dark', quotaLimitId: 'codex', quotaWindow: 'secondary' };
  delete state.settings.subscriptionId; delete state.settings.manualResetAt; delete state.settings.cycleDays;
  state.quota = null; delete state.quotaOptions; state.schemaVersion = 2;
}
if(state.schemaVersion < 3){state.settings.autoStart=true;delete state.settings.expandedSources;state.schemaVersion=3;}
// Seed future notices already delivered by older builds without sending anything.
if(!Array.isArray(state.notificationGroups)){
  state.notificationGroups=[];
  for(const e of [...state.events].reverse()){
    let candidate=e;
    if(!e.start&&!e.end&&e.key?.startsWith('forecast:')){
      const [,start,end,resetType,plans,timingKind]=e.key.split('|');
      candidate={...e,start:start||null,end:end||null,resetType,timingKind,scope:{plans:plans?plans.split(','):[]}};
    }
    const grouped=mergeMessage(state.notificationGroups,candidate,Date.now(),quotaView(state.quota,state.settings)?.planType);
    if(grouped){e.notificationGroup=grouped.group.id;grouped.group.delivered=state.settings.notify===true;}
  }
}
const tr=value=>I18n.text(value,state.settings.language);
recoverLocalReset(state,quotaView(state.quota,state.settings));
const checkedThisRun = new Set();
const safeWrite = () => {
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  const temp = `${dataFile}.tmp`;
  fs.writeFileSync(temp, JSON.stringify({ ...state, events: state.events.slice(0, 150), seen: state.seen.slice(-400) }, null, 2));
  try { fs.renameSync(temp, dataFile); }
  catch (error) {
    // Redirected Windows profile folders can reject even a same-directory rename.
    if (error.code !== 'EXDEV') throw error;
    fs.copyFileSync(temp, dataFile); fs.unlinkSync(temp);
  }
};
function snapshot() {
  const now = Date.now();
  let sources = SOURCES.map(s => {
    const cached = state.sources.find(x => x.id === s.id);
    if (!cached) return { ...s, status: 'loading', forecast: { state: 'none' }, notes: [], probabilities: [], signals: [] };
    const status = cached.status === 'ok' && !freshness(cached, now) ? 'stale' : cached.status;
    return projectForecasts({ ...cached, status },now);
  });
  const quotaDisplay=quotaView(state.quota,state.settings,now);
  sources=projectAfterReset(sources,quotaDisplay,state.localReset,now);
  const consensus=calibratedReset(sources,now);
  return { ...state, quotaConnection:smoke&&!deploymentCheck?{checking:false,authenticated:true,needsLogin:false}:connection, sources, consensus, history:resetHistory(sources,state.history||[],now),historyStart:new Date(historyStart()).toISOString(),hypothetical:hypotheticalPace(consensus,state.settings.hypotheticalDays,now), quotaDisplay, now: new Date(now).toISOString(), refreshing: running, version: app.getVersion(), notificationSupported: Notification.isSupported() };
}
function publish() { if (win && !win.isDestroyed()) win.webContents.send('dashboard:state', snapshot()); }
function showWindow() { if (!win || win.isDestroyed()) return; if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
function addEvent(e, notify = true) {
  if(e.transition){
    state.transitions=state.transitions||{};
    if(state.transitions[e.transition.entity]===e.transition.signature)return;
    state.transitions[e.transition.entity]=e.transition.signature;
    state.transitions=Object.fromEntries(Object.entries(state.transitions).slice(-400));
  }else if (state.seen.includes(e.key)) return;
  state.seen.push(e.key);
  if(e.kind==='quota_reset'&&e.bucketId&&e.windowKey&&e.resetsAt)state.localReset={key:e.key,bucketId:e.bucketId,windowKey:e.windowKey,resetsAt:e.resetsAt,observedAt:e.at,kind:'quota-reset'};
  state.notificationGroups=state.notificationGroups||[];
  const grouped=mergeMessage(state.notificationGroups,e,Date.now(),quotaView(state.quota,state.settings)?.planType);
  state.notificationGroups=state.notificationGroups.slice(-200);
  const existing=grouped&&state.events.findIndex(p=>p.notificationGroup===grouped.group.id);
  if(grouped&&existing>=0)state.events[existing]={...grouped.event,read:state.events[existing].read};
  else state.events.unshift({...grouped?.event||e,read:false});
  state.events = state.events.slice(0, 150);
  if(grouped&&isQuiet(state.resetQuietUntil)&&!grouped.group.delivered){grouped.group.suppressedAt=new Date().toISOString();grouped.group.pending=false;}
  if (notify && shouldNotify(grouped?.group,state.settings.notify,state.resetQuietUntil) && !smoke) {
    grouped.group.pending=true;
    notifyUser(grouped.event.title,grouped.event.body,grouped.group.id);
  }
  safeWrite(); publish();
}
async function notifyUser(title, body, key = `test:${Date.now()}`) {
  if(isQuiet(state.resetQuietUntil))return;
  const cached=quotaView(state.quota,state.settings);
  if(!cached||cached.stale)await refreshQuota();
  const delivery=state.notificationGroups?.find(g=>g.id===key);
  if(delivery&&!state.settings.notify){delivery.pending=false;safeWrite();publish();return;}
  if(isQuiet(state.resetQuietUntil)){
    if(delivery&&!delivery.delivered){delivery.pending=false;delivery.suppressedAt=new Date().toISOString();safeWrite();publish();}
    return;
  }
  title=tr(title);body=tr(body);
  if(delivery)delivery.localResetKeyAtDelivery=state.localReset?.key||null;
  try {
    const id = notificationId(key);
    const n = new Notification({ id, groupId: 'codex-resets', groupTitle: tr('codex重置预测看板'), title, body, icon: path.join(__dirname, 'assets', 'icon.png'), silent: !state.settings.sound, timeoutType: 'never',toastXml:toastXml(title,body,id,!state.settings.sound,tr('确认收到')) });
    activeNotifications.set(id, n);
    n.on('close', details => { if (details?.reason !== 'timedOut' && activeNotifications.get(id) === n) activeNotifications.delete(id); });
    n.on('click', showWindow);
    n.on('show', () => { if(delivery){delivery.pending=false;delivery.delivered=true;safeWrite();}state.notificationStatus = '已发送常驻通知 · 点击确认收到关闭'; publish(); });
    n.on('failed', () => {
      if(delivery){delivery.pending=false;safeWrite();}
      state.notificationStatus = 'Windows 通知不可用，已保留看板提醒';
      if (tray&&!isQuiet(state.resetQuietUntil)) tray.displayBalloon({ title, content: body, iconType: 'info', noSound: !state.settings.sound });
      publish();
    });
    n.show();
  } catch { if(delivery)delivery.pending=false;state.notificationStatus = '通知未送达，看板内记录已保留'; publish(); }
}
async function handleNotificationActivation(details) {
  if(details.type==='action'&&details.actionIndex===0){
    const clickedAt=Date.now();
    const tag=new URLSearchParams(details.arguments).get('tag');
    const group=state.notificationGroups?.find(g=>notificationId(g.id)===tag);
    if(!group?.delivered||group.acknowledgedAt)return;
    const cached=quotaView(state.quota,state.settings);
    if(!cached||cached.stale)await refreshQuota();
    const current=quotaView(state.quota,state.settings);
    if(!current||current.stale)return;
    const result=acknowledgeReset(state,tag,current,clickedAt);
    if(result.received){
      const notices=result.quietStarted?[...activeNotifications.entries()]:[[tag,activeNotifications.get(tag)]];
      for(const [id,n] of notices){activeNotifications.delete(id);n?.close();}
      safeWrite();publish();
    }
    return;
  }
  if(details.type==='click')showWindow();
}
async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await session.defaultSession.fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`); error.status = response.status;
      const retry = response.headers.get('retry-after');
      error.retryMs = retry && /^\d+$/.test(retry) ? Number(retry) * 1000 : retry ? Math.max(0,Date.parse(retry)-Date.now()) : null;
      throw error;
    }
    const body = await response.text();
    if (body.length > 2 * 1024 * 1024) throw new Error('响应超出预期大小');
    try { return JSON.parse(body); } catch { throw new Error('未返回有效 JSON，可能需要在原站核查'); }
  } finally { clearTimeout(timeout); }
}
async function refresh(manual=false) {
  if (running || state.paused) return snapshot();
  running = true; publish();
  const now = Date.now(), previous = state.sources;
  const due = SOURCES.filter(spec => {
    const old = previous.find(s => s.id === spec.id);
    if (old?.status === 'blocked') return manual&&(!old.lastAttemptAt||Date.parse(old.lastAttemptAt)<=now-spec.interval+150);
    return !old?.nextCheckAt || Date.parse(old.nextCheckAt) <= now + 150;
  });
  await Promise.all(due.map(async spec => {
    const old = previous.find(s => s.id === spec.id);
    let next;
    try {
      const raw = await fetchJson(spec.api);
      next = normalize(spec.id, raw, new Date().toISOString());
      next.nextCheckAt = new Date(now + spec.interval).toISOString();
      checkedThisRun.add(spec.id);
    } catch (error) {
      next=buildFailure(spec,old,error,Date.now());
    }
    state.sources = [...state.sources.filter(s => s.id !== spec.id), next];
    if (state.baseline) {
      const quota=quotaView(state.quota,state.settings);
      const visibleNext=projectAfterReset(state.sources,quota,state.localReset).find(s=>s.id===spec.id);
      const visibleOld=old&&projectAfterReset([...state.sources.filter(s=>s.id!==spec.id),old],quota,state.localReset).find(s=>s.id===spec.id);
      for (const e of changes(visibleOld,visibleNext)) addEvent(e,e.kind!=='removed');
    }
    publish();
  }));
  const consensus = calibratedReset(state.sources);
  state.history=resetHistory(state.sources,state.history||[]);
  if (consensus.state === 'confirmed') {
    if (state.baseline && state.confirmedId && state.confirmedId !== consensus.id) addEvent({ key: `confirmed:${consensus.id}`, kind: 'confirmed', title: '新一次全局重置已获多源核对', body: `${consensus.message}。完成公告已更新，个人额度请看本机数据。`,start:consensus.at,end:consensus.at,resetType:'global', at: new Date().toISOString(), sourceId: null, url: consensus.url });
    state.confirmedId = consensus.id;
  }
  if (state.sources.some(s => s.status === 'ok')) state.baseline = true;
  state.lastPollAt = new Date(now).toISOString(); state.nextPollAt = new Date(now+30000).toISOString();
  running = false; safeWrite(); publish();
  return snapshot();
}

async function refreshQuota() {
  if (smoke || state.paused) return;
  if(quotaRunning)return quotaFlight;
  quotaRunning = true;
  quotaFlight=(async()=>{
    try { const previous=state.quota;state.quota=await localQuota.read();for(const e of quotaChanges(previous,state.quota,state.settings))addEvent(e);recoverLocalReset(state,quotaView(state.quota,state.settings)); }
    catch (error) { state.quota = { ...state.quota, source: 'local-codex', state: 'error', message: error.message }; }
    finally { quotaRunning = false; safeWrite(); publish(); }
  })();
  return quotaFlight;
}
function trayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: tr('打开codex重置预测看板'), click: showWindow },
    { label: tr(state.paused ? '继续监控' : '暂停监控'), click: () => { state.paused = !state.paused; trayMenu(); publish(); if (!state.paused) { refresh(); refreshQuota(); } } },
    { label: tr('立即检查'), click: () => { refresh(true); refreshQuota(); } },
    { type: 'separator' }, { label: tr('退出'), click: () => { quitting = true; app.quit(); } }
  ]));
  tray.setToolTip(tr(state.paused ? 'codex重置预测看板 · 已暂停' : 'codex重置预测看板 · 每 30 秒检查'));
}
async function refreshConnection(){
  if(connectionFlight)return connectionFlight;
  connectionFlight=(async()=>{try{connection={...(await localQuota.setupStatus()),checking:false};}catch{connection={checking:false,errorCode:'CONNECTION_CLOSED'};}finally{connectionFlight=null;publish();}})();
  return connectionFlight;
}
async function beginQuotaLogin(){
  if(smoke)return snapshot();
  try{
    const result=await localQuota.login();
    if(result.alreadyConnected){await refreshQuota();await refreshConnection();return snapshot();}
    const url=new URL(result.authUrl);
    if(url.protocol!=='https:'||url.username||url.password||url.port&&!['443'].includes(url.port)||!['auth.openai.com','chatgpt.com'].includes(url.hostname))throw new Error('LOGIN_RESPONSE_INVALID');
    await refreshConnection();await shell.openExternal(url.href);return snapshot();
  }catch{connection={...connection,checking:false,loginPending:false,errorCode:'LOGIN_FAILED'};publish();return snapshot();}
}
localQuota.on('login-completed',async result=>{
  if(smoke)return;
  if(result.success)await refreshQuota();
  await refreshConnection();
  if(!result.success){connection={...connection,errorCode:'LOGIN_FAILED'};publish();}
});
localQuota.on('account-updated',()=>{if(!smoke)refreshConnection().then(()=>refreshQuota());});
function installShortcut() {
  if (smoke) return;
  const stableExecutable=process.env.PORTABLE_EXECUTABLE_FILE||process.execPath;
  const shortcut = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'codex重置预测看板.lnk');
  try {
    fs.mkdirSync(path.dirname(shortcut), { recursive: true });
    shell.writeShortcutLink(shortcut, fs.existsSync(shortcut)?'update':'create', { target: stableExecutable, args: app.isPackaged ? '' : `"${app.getAppPath()}"`, cwd: path.dirname(stableExecutable), description: 'Codex 重置预告与额度节奏', icon: app.isPackaged ? stableExecutable : path.join(__dirname,'assets','icon.ico'), iconIndex: 0, appUserModelId: APP_ID });
  } catch { /* A restricted Start Menu does not prevent in-app alerts. */ }
}
function createWindow() {
  const display = screen.getPrimaryDisplay().workArea;
  const saved = state.windowBounds;
  const intersects = saved && screen.getAllDisplays().some(d => saved.x < d.workArea.x+d.workArea.width && saved.x+saved.width > d.workArea.x && saved.y < d.workArea.y+d.workArea.height && saved.y+saved.height > d.workArea.y);
  win = new BrowserWindow({ width: Math.min(1440,display.width), height: Math.min(1020,display.height), ...(intersects ? saved : {}), minWidth: 860, minHeight: 650, show: false, frame: false, backgroundColor: state.settings.theme === 'dark' ? '#151719' : '#f5f5f7', title: tr('codex重置预测看板'), icon: path.join(__dirname,'assets','icon.ico'),
    webPreferences: { preload: path.join(__dirname,'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.loadFile(path.join(__dirname, 'ui', 'index.html'));
  win.on('close', e => {
    if (!quitting && state.settings.closeToTray && tray) { e.preventDefault(); win.hide(); }
    else if (!quitting) { quitting = true; app.quit(); }
  });
  let boundsTimer;
  const rememberBounds = () => { clearTimeout(boundsTimer); boundsTimer = setTimeout(() => { if (!win.isDestroyed() && !win.isMaximized() && !win.isMinimized()) { state.windowBounds = win.getBounds(); safeWrite(); } }, 350); };
  win.on('resize', rememberBounds); win.on('move', rememberBounds);
}
function registerIpc() {
  const trusted = event => win && event.sender === win.webContents;
  const handle = (name, fn) => ipcMain.handle(name, (e, ...args) => { if (!trusted(e)) throw new Error('来源不被允许'); return fn(...args); });
  handle('dashboard:get', snapshot);
  handle('dashboard:refresh', async () => { await Promise.all([refresh(true), refreshQuota()]); return snapshot(); });
  handle('dashboard:pause', () => { state.paused = !state.paused; trayMenu(); if (!state.paused) { refresh(); refreshQuota(); } safeWrite(); publish(); return snapshot(); });
  handle('dashboard:link', url => {
    const allowed = new Set(['codex-reset.com','didcodexreset.com','nextreset.ai','tibo.cc','codex-reset.today','x.com','twitter.com']);
    const checked = safeUrl(url); if (!checked || !allowed.has(new URL(checked).hostname)) throw new Error('仅允许打开已核对的信源网站');
    return shell.openExternal(checked);
  });
  handle('dashboard:quota', async () => { await refreshQuota();if(!smoke)await refreshConnection();return snapshot(); });
  handle('dashboard:connect-quota',beginQuotaLogin);
  handle('dashboard:cancel-quota-login',async()=>{if(!smoke){await localQuota.cancelLogin();await refreshConnection();}return snapshot();});
  handle('dashboard:test-notification', () => { if (!smoke) notifyUser('codex重置预测看板 · 测试通知', '这条测试提醒会一直挂着，直到你点击关闭。新预告和重置确认也采用此方式。'); return Notification.isSupported(); });
  handle('dashboard:read-events', () => { state.events.forEach(e => e.read = true); safeWrite(); publish(); });
  handle('dashboard:settings', patch => {
    if (!patch || typeof patch !== 'object') throw new Error('设置无效');
    const next = { ...state.settings };
    for (const key of ['notify','sound','closeToTray','autoStart']) if (typeof patch[key] === 'boolean') next[key] = patch[key];
    if('hypotheticalDays' in patch){if(!Number.isFinite(patch.hypotheticalDays)||patch.hypotheticalDays<0.25||patch.hypotheticalDays>365)throw new Error('假设天数须为 0.25—365');next.hypotheticalDays=patch.hypotheticalDays;}
    if('bodyFontSize' in patch){if(!Number.isInteger(patch.bodyFontSize)||patch.bodyFontSize<11||patch.bodyFontSize>22)throw new Error('正文大小须为 11—22 px');next.bodyFontSize=patch.bodyFontSize;}
    if('barOrder' in patch){if(!BarOrder.valid(patch.barOrder))throw new Error('横条顺序无效');next.barOrder=[...patch.barOrder];}
    if (['light','dark'].includes(patch.theme)) next.theme = patch.theme;
    if('language' in patch){if(!['zh-CN','en'].includes(patch.language))throw new Error('Invalid language');next.language=patch.language;}
    if (typeof patch.quotaLimitId === 'string') next.quotaLimitId = patch.quotaLimitId.slice(0,100);
    if (['primary','secondary'].includes(patch.quotaWindow)) next.quotaWindow = patch.quotaWindow;
    if (!smoke && next.autoStart !== state.settings.autoStart) {
      if (!app.isPackaged) throw new Error('请在打包后的软件中设置开机启动');
      app.setLoginItemSettings({ openAtLogin: next.autoStart, path: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath, args: ['--hidden'] });
    }
    state.settings = next; trayMenu();win.setTitle(tr('codex重置预测看板'));win.setBackgroundColor(next.theme === 'dark' ? '#151719' : '#f5f5f7'); safeWrite(); publish(); return snapshot();
  });
  handle('dashboard:window', action => { if (action === 'minimize') win.minimize(); else if (action === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize(); else if (action === 'close') win.close(); });
  handle('dashboard:quit',()=>{quitting=true;app.quit();});
  handle('dashboard:ready', async () => {
    if (smoke) return true;
    if (!process.argv.includes('--hidden')) win.show();
    return true;
  });
}


if(deploymentCheck){
  app.whenReady().then(async()=>{
    const {deploymentReport,writeDeploymentReport,stopClient}=require('./deployment-check.cjs');
    const output=process.argv.find(a=>a.startsWith('--deployment-result='))?.slice('--deployment-result='.length);
    let report=await deploymentReport(localQuota,app.getVersion());
    try{if(!output)throw new Error('RESULT_PATH_INVALID');writeDeploymentReport(output,report);}catch{report={version:app.getVersion(),status:'error',quotaConnected:false,reasonCode:'RESULT_WRITE_FAILED'};}
    await stopClient(localQuota);app.exit(report.status==='ready'?0:report.status==='login_required'?2:1);
  });
}else if (!smoke && !app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', (_e,args) => { if (!args.includes('--hidden')) showWindow();if(args.includes('--connect-quota'))beginQuotaLogin(); });
  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null); registerIpc(); createWindow();
    if (!smoke) {
      tray = new Tray(nativeImage.createFromPath(path.join(__dirname,'assets','icon.ico'))); tray.on('click',showWindow); trayMenu(); installShortcut();
      if(app.isPackaged)app.setLoginItemSettings({openAtLogin:state.settings.autoStart,path:process.env.PORTABLE_EXECUTABLE_FILE||process.execPath,args:['--hidden']});
      Notification.handleActivation(handleNotificationActivation);
      refresh(); refreshQuota();refreshConnection().then(()=>{if(process.argv.includes('--connect-quota')&&connection.needsLogin)beginQuotaLogin();});
      refreshTimer=setInterval(refresh,30000); quotaTimer=setInterval(refreshQuota,30000);
      powerMonitor.on('resume', () => { refresh(); refreshQuota(); });
      powerMonitor.on('unlock-screen', () => { refresh(); refreshQuota(); });
    }
  });
}
app.on('before-quit', () => { quitting=true; clearInterval(refreshTimer); clearInterval(quotaTimer); localQuota.stop(); if (!smoke) safeWrite(); });
app.on('window-all-closed', () => { if (quitting || !state.settings.closeToTray) app.quit(); });
