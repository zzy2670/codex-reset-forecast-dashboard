'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const PaceTiming=require('../app/ui/pace-timing.js'),I18n=require('../app/ui/i18n.js');
const renderer=fs.readFileSync(path.join(__dirname,'../app/ui/renderer.js'),'utf8');
const start=Date.parse('2026-11-03T03:16:37Z'),end=Date.parse('2026-11-06T04:00:00Z');
function display(now,target={at:new Date(end).toISOString(),anchor:new Date(start).toISOString()}){
 const elements=new Map(),$=id=>{if(!elements.has(id))elements.set(id,{style:{},attrs:{},setAttribute(k,v){this.attrs[k]=v;}});return elements.get(id);};
 const state={settings:{calendarTarget:target},quotaDisplay:{source:'local-codex',state:'ok',bucketId:'codex',key:'primary',durationMins:10080,resetsAt:new Date(start+7*86400000).toISOString(),fetchedAt:new Date(now).toISOString()},localReset:{kind:'observed-cycle'}};
 const setText=(element,value)=>{element.textContent=String(value??'');},setWidth=(element,value)=>{element.style.width=value;},setAttribute=(element,name,value)=>element.setAttribute(name,String(value));
 const sandbox={PaceTiming,state,$,calendarDraft:false,setText,setWidth,setAttribute,setLocalizedAttribute:setAttribute,Date,dateFormat:{format:()=> '11/6'},date:x=>new Date(x),full:x=>new Date(x).toISOString()};vm.createContext(sandbox);
 vm.runInContext(renderer.slice(renderer.indexOf('function renderCalendarPace('),renderer.indexOf('function renderHypothetical(')),sandbox);
 sandbox.renderCalendarPace(now);return {elements,state};
}
test('calendar pacing shortly after refill retains its exact positive value instead of rounding to empty zero',()=>{
 const now=Date.parse('2026-11-03T03:19:21.421Z'),{elements,state}=display(now),p=PaceTiming.calendarPace(state.settings.calendarTarget,now,{quota:state.quotaDisplay,localReset:state.localReset});
 assert.ok(p.progress>0&&p.progress<.005);assert.equal(elements.get('calendar-percent').textContent,'0.06%');
 assert.equal(parseFloat(elements.get('calendar-fill').style.width),p.progress*100);
 assert.match(elements.get('calendar-pace-note').textContent,/2026-11-03T03:16:37.000Z/);assert.match(elements.get('calendar-pace-note').textContent,/2026-11-06T04:00:00.000Z/);
 assert.ok(Number(elements.get('calendar-track').attrs['aria-valuenow'])>0);assert.equal(elements.get('calendar-track').attrs['aria-valuetext'],'0.06%');
});
test('calendar pacing distinguishes exact zero, tiny positive, normal percentage and an unset target',()=>{
 assert.equal(display(start).elements.get('calendar-percent').textContent,'0%');
 assert.equal(display(start+1).elements.get('calendar-percent').textContent,'<0.01%');
 assert.equal(display((start+end)/2).elements.get('calendar-percent').textContent,'50.00%');
 assert.equal(display(end).elements.get('calendar-percent').textContent,'100%');
 const empty=display(start,undefined); // Default parameter creates the normal target.
 assert.equal(empty.elements.get('calendar-percent').textContent,'0%');
 const absent=display(start,null);assert.equal(absent.elements.get('calendar-percent').textContent,'—');assert.equal(absent.elements.get('calendar-pace-note').textContent,'未设置日历预测');
});
test('calendar pace uses the matching locally observed refill, and ignores unrelated cycles',()=>{
 const now=Date.parse('2026-11-03T04:00:00Z'),receipt=Date.parse('2026-11-03T03:18:19.477Z');
 const accountFingerprint='a'.repeat(64);
 const quota={source:'local-codex',bucketId:'codex',key:'primary',durationMins:10080,resetsAt:new Date(start+7*86400000).toISOString(),fetchedAt:new Date(now).toISOString(),accountFingerprint};
 const target={at:new Date(end).toISOString(),anchor:new Date(start).toISOString()};
 const localHistory=[{type:'plan_upgrade',bucketId:'codex',windowKey:'primary',resetsAt:new Date(start+7*86400000+1000).toISOString(),at:new Date(receipt).toISOString(),accountFingerprint},{type:'local',bucketId:'other',windowKey:'primary',resetsAt:quota.resetsAt,at:new Date(now-1000).toISOString(),accountFingerprint}];
 const pace=PaceTiming.calendarPace(target,now,{quota,localHistory});
 assert.equal(pace.origin,'receipt');assert.equal(Date.parse(pace.anchor),receipt);assert.equal(pace.progress,(now-receipt)/(end-receipt));
 assert.equal(PaceTiming.calendarPace(target,now,{quota,localHistory:localHistory.slice(1)}).origin,'cycle');
 for(const fingerprint of ['b'.repeat(64),undefined]){
  const unrelated=[{...localHistory[0],accountFingerprint:fingerprint}];
  assert.equal(PaceTiming.calendarPace(target,now,{quota,localHistory:unrelated}).origin,'cycle');
 }
});
test('plan upgrade history renders as a distinct pale-yellow local row with its pre-refill value and tier change',()=>{
 const elements={'history-range':{},'history-list':{}},row={id:'upgrade-proof',at:new Date(start).toISOString(),type:'plan_upgrade',beforeRemainingPercent:0,afterRemainingPercent:100,beforeMultiplier:5,afterMultiplier:20,bucketId:'codex',windowKey:'primary',sources:[]};
 const sandbox={$:id=>elements[id],setText:(element,value)=>{element.textContent=String(value);},reconcile:(element,items)=>{element.innerHTML=items.map(item=>item.markup).join('');},historyNodes:new Map(),identityPending:()=>false,PaceTiming:{historyStart:()=>0},HistoryGroups:{rows:()=>[row]},state:{history:[],localQuotaHistory:[]},zone:'Asia/Shanghai',zoneName:()=> '北京时间',dateFormat:{format:()=> '11/3'},date:x=>new Date(x),clock:()=> '11:16:37',precise:x=>x,esc:x=>String(x??'')};vm.createContext(sandbox);
 vm.runInContext(renderer.slice(renderer.indexOf('function historyRowMarkup('),renderer.indexOf('let calendarDate=')),sandbox);sandbox.renderHistory(start);
 const html=elements['history-list'].innerHTML;assert.match(html,/history-local history-banked/);assert.match(html,/data-history-type="plan_upgrade"/);assert.match(html,/套餐升级补充/);assert.match(html,/5x → 20x/);assert.match(html,/<strong>0%<\/strong>/);assert.doesNotMatch(html,/个人重置卡|全局重置/);
 assert.equal(I18n.text('套餐升级补充','en'),'Plan upgrade refill');assert.equal(I18n.text('起点 11/3','en'),'Start 11/3');
});

test('public reset-card issuance has its own purple row and never invents local usage or a before balance',()=>{
 const elements={'history-range':{},'history-list':{}},row={id:'public-credit',at:new Date(start).toISOString(),type:'banked',text:'A reset card was issued',url:'https://example.test/post',beforeRemainingPercent:0,sources:[]};
 const sandbox={$:id=>elements[id],setText:(element,value)=>{element.textContent=String(value);},reconcile:(element,items)=>{element.innerHTML=items.map(item=>item.markup).join('');},historyNodes:new Map(),identityPending:()=>false,PaceTiming:{historyStart:()=>0},HistoryGroups:{rows:()=>[row]},state:{history:[],localQuotaHistory:[]},zone:'Asia/Shanghai',zoneName:()=> '北京时间',dateFormat:{format:()=> '11/3'},date:x=>new Date(x),clock:()=> '11:16:37',precise:x=>x,esc:x=>String(x??'')};vm.createContext(sandbox);
 vm.runInContext(renderer.slice(renderer.indexOf('function historyRowMarkup('),renderer.indexOf('let calendarDate=')),sandbox);sandbox.renderHistory(start);
 const html=elements['history-list'].innerHTML;assert.match(html,/history-row history-issued/);assert.match(html,/data-history-type="banked"/);assert.match(html,/发卡公告/);assert.match(html,/仅发放重置卡，未表示本机额度已补充/);assert.match(html,/data-original>A reset card was issued/);assert.doesNotMatch(html,/history-banked|补充前剩余|个人重置卡|补充后剩余/);
 assert.equal(I18n.text('发卡公告','en'),'Reset-card issuance');assert.equal(I18n.text('仅发放重置卡，未表示本机额度已补充','en'),'Reset cards were issued; this does not indicate a local quota refill');
 const css=fs.readFileSync(path.join(__dirname,'../app/ui/dashboard-v12.css'),'utf8');
 const color=selector=>css.match(new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\{background:(#[a-f0-9]+)'))?.[1];
 assert.equal(color('.history-row.history-issued'),'#f1ebff');assert.equal(color('.dark .history-row.history-issued'),'#302a3d');assert.notEqual(color('.history-row.history-issued'),color('.history-row.history-banked'));assert.notEqual(color('.dark .history-row.history-issued'),color('.dark .history-row.history-banked'));
});
