'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),BarOrder=require('../app/ui/bar-order.js');
test('saved row order migrates missing rows and ignores repeated or unknown IDs without losing a bar',()=>{
 assert.deepEqual(BarOrder.normalize(undefined),['actual','hypothetical','calendar','theory']);
 assert.deepEqual(BarOrder.normalize(['theory','theory','obsolete']),['theory','actual','hypothetical','calendar']);
 assert.deepEqual(BarOrder.normalize(['theory','actual','hypothetical']),['theory','actual','hypothetical','calendar']);
 assert.deepEqual(BarOrder.normalize(['actual','hypothetical','theory']),['actual','hypothetical','calendar','theory']);
 assert.equal(BarOrder.valid(['theory','actual','hypothetical','calendar']),true);
 assert.equal(BarOrder.valid(['theory','actual','hypothetical']),false);
 assert.equal(BarOrder.valid(['actual','actual','theory']),false);
 assert.equal(BarOrder.valid(['actual','theory']),false);
 assert.equal(BarOrder.valid(['actual','theory','unrecognized']),false);
});
test('row movement preserves each bar exactly once and clamps top and bottom',()=>{
 assert.deepEqual(BarOrder.move(BarOrder.defaults,'actual',2),['hypothetical','calendar','actual','theory']);
 assert.deepEqual(BarOrder.move(BarOrder.defaults,'theory',-1),['theory','actual','hypothetical','calendar']);
 assert.deepEqual(BarOrder.move(BarOrder.defaults,'hypothetical',50),['actual','calendar','theory','hypothetical']);
 assert.deepEqual(BarOrder.move(BarOrder.defaults,'calendar',0),['calendar','actual','hypothetical','theory']);
 assert.deepEqual(BarOrder.move(BarOrder.defaults,'missing',1),BarOrder.defaults);
});
