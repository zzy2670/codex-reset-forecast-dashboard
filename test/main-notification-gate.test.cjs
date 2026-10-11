'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {mergeMessage,shouldNotify}=require('../app/notification-policy.cjs');
test('actual main event path merges near messages, stays quiet without a time and sends after unmuting',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../app/main.cjs'),'utf8'),code=source.slice(source.indexOf('function addEvent('),source.indexOf('\nfunction notifyUser('));
 const state={seen:[],events:[],settings:{notify:false}},popups=[];
 const sandbox={state,Date,mergeMessage,shouldNotify,quotaView:()=>({planType:'pro'}),safeWrite:()=>{},publish:()=>{},smoke:false,notifyUser:(title,body,key)=>{popups.push({title,body,key});const g=state.notificationGroups.find(g=>g.id===key);g.delivered=true;g.pending=false;}};
 vm.createContext(sandbox);vm.runInContext(code,sandbox);
 const end=new Date(Date.now()+3600000).toISOString();const e=id=>({key:id,kind:'forecast',resetType:'global',timingKind:'announcement',end,sourceId:id,title:'Reset',body:'Timed reset'});
 sandbox.addEvent(e('a'));assert.equal(popups.length,0);
 state.settings.notify=true;sandbox.addEvent(e('b'));assert.equal(popups.length,1);assert.equal(state.events.length,1);assert.ok(popups[0].body.includes('北京时间'));
 state.events[0].read=true;sandbox.addEvent(e('c'));assert.equal(popups.length,1);assert.equal(state.events.length,1);assert.equal(state.events[0].read,true);assert.equal(state.events[0].sources.length,3);
 sandbox.addEvent({...e('no-time'),end:null});sandbox.addEvent({...e('quota'),kind:'quota_denied'});assert.equal(popups.length,1);
});
