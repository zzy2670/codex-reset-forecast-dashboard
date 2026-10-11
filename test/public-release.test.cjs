'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const I18n=require('../app/ui/i18n.js'),{resetHistory}=require('../app/dashboard-model.cjs'),{toastXml}=require('../app/notification-policy.cjs');
test('language translation preserves original Chinese and produces an English native receipt',()=>{
 assert.equal(I18n.text('确认收到','zh-CN'),'确认收到');assert.equal(I18n.text('确认收到','en'),'Acknowledge');
 assert.match(toastXml('Reset','Forecast','id',true,I18n.text('确认收到','en')),/content="Acknowledge"/);
 assert.equal(I18n.text('从上次全局重置起算','en'),'from the last global reset');
 for(const message of ['已合并 2 个信源的同类消息','完成公告已更新，个人额度请看本机数据。','时间未注明','上次核对 · 待更新','TIBO 暂未列出原预告，请查看后续确认；移除不等于取消。'])assert.doesNotMatch(I18n.text(message,'en'),/[\u4e00-\u9fff]/);
});
test('historical provenance retains individual times and flags disagreement across refreshes',()=>{
 const url='https://x.com/example/status/1000000000000000000',now=Date.parse('2026-10-11T00:00Z');
 const sources=['a','b'].map((id,i)=>({id,name:id,family:id,lastReset:{id:'post',at:`2026-10-10T00:0${i}:00Z`,url,type:'global',timeBasis:'announcement'}}));
 const rows=resetHistory(sources,[],now);assert.equal(rows.length,1);assert.equal(rows[0].timeConflict,true);assert.equal(rows[0].sources[1].at,'2026-10-10T00:01:00Z');
 assert.equal(resetHistory([],rows,now)[0].timeConflict,true);
});
