'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {REQUEST_TIMEOUT_MS,VISIBLE_FAILURES,buildFailure}=require('../app/source-retry.cjs');
const spec={id:'source',interval:30000};
const at=Date.parse('2026-10-15T08:00:00Z');
const cached={...spec,status:'ok',fetchedAt:'2026-10-15T07:59:00Z',forecast:{state:'scheduled',start:'2026-10-15T10:00:00Z'},notes:['evidence'],probabilities:[{value:70}],signals:[{id:'post'}]};

test('temporary failures remain quiet twice then show an error on the third attempt',()=>{
  assert.equal(REQUEST_TIMEOUT_MS,30000);assert.equal(VISIBLE_FAILURES,3);
  let old=cached;
  for(let n=1;n<=3;n++){
    const next=buildFailure(spec,old,Object.assign(new Error('private endpoint detail'),{name:'AbortError'}),at);
    assert.equal(next.status,n<3?'retrying':'error');
    assert.equal(next.error,n<3?null:'获取失败，保留上次信息；稍后自动重试。');
    assert.equal(next.failures,n);assert.equal(next.lastFailureCode,'TIMEOUT');
    assert.equal(Date.parse(next.nextCheckAt)-at,30000*2**n);
    assert.equal(next.fetchedAt,cached.fetchedAt);
    assert.equal(next.forecast,cached.forecast);assert.equal(next.notes,cached.notes);
    assert.equal(next.probabilities,cached.probabilities);assert.equal(next.signals,cached.signals);
    assert.equal(JSON.stringify(next).includes('private endpoint detail'),false);
    old=next;
  }
  assert.equal(cached.status,'ok');assert.equal(cached.failures,undefined);
});

test('network and server failures use bounded provider-aware backoff',()=>{
  for(const error of [new TypeError('fetch failed'),{code:'ECONNRESET'},{status:503},{status:500},{status:408}]){
    const result=buildFailure(spec,cached,error,at);
    assert.equal(result.status,'retrying');assert.equal(result.error,null);
    assert.match(result.lastFailureCode,/^(NETWORK|HTTP_503|HTTP_500|HTTP_408)$/);
  }
  const result=buildFailure({...spec,interval:185000},{...cached,failures:20,transientFailures:20,lastFailureCode:'HTTP_503'},{status:502},at);
  assert.equal(Date.parse(result.nextCheckAt)-at,900000);
  assert.equal(result.lastFailureCode,'HTTP_502');assert.equal(result.status,'error');
});

test('abort and timeout categories do not save exception details',()=>{
  for(const error of [{name:'TimeoutError'},{code:'ETIMEDOUT'},{code:'UND_ERR_HEADERS_TIMEOUT'},{message:'net::ERR_TIMED_OUT at private endpoint'}]){
    const result=buildFailure(spec,cached,error,at);
    assert.equal(result.lastFailureCode,'TIMEOUT');assert.equal(result.status,'retrying');
    assert.equal(JSON.stringify(result).includes('private endpoint'),false);
  }
});

test('no-cache retry neither claims success nor invents fetch freshness or forecast',()=>{
  const result=buildFailure(spec,undefined,{code:'ECONNRESET'},at);
  assert.equal(result.status,'retrying');assert.equal(result.error,null);
  assert.equal(Object.hasOwn(result,'fetchedAt'),false);
  assert.deepEqual(result.forecast,{state:'none'});
  assert.deepEqual(result.notes,[]);assert.deepEqual(result.signals,[]);assert.deepEqual(result.probabilities,[]);
  assert.equal(result.lastAttemptAt,new Date(at).toISOString());
});

test('invalid JSON, schema, oversized and missing-timestamp responses are immediately visible',()=>{
  for(const error of [new SyntaxError('secret JSON contents'),{code:'INVALID_JSON'},{code:'SCHEMA'},{message:'站方数据格式已变化'},{message:'未返回有效 JSON，可能需要在原站核查'},{message:'响应超出预期大小'},{message:'缺少数据更新时间，暂不作为实时证据'}]){
    const result=buildFailure(spec,cached,error,at);
    assert.equal(result.status,'error');assert.equal(result.lastFailureCode,'FORMAT');
    assert.equal(result.error,'站方数据格式已变化，请打开原站核查。');
    assert.equal(result.fetchedAt,cached.fetchedAt);
    assert.equal(JSON.stringify(result).includes('secret JSON contents'),false);
  }
});

test('401 and 403 remain blocked without automatic retry',()=>{
  for(const status of [401,403]){
    const result=buildFailure(spec,cached,{status},at);
    assert.equal(result.status,'blocked');assert.equal(result.nextCheckAt,null);
    assert.equal(result.lastFailureCode,`HTTP_${status}`);
    assert.equal(result.error,'站点暂时拒绝访问，点击立即检查可重试；也可打开原站核查。');
  }
});

test('429 preserves Retry-After and never retries earlier than provider interval',()=>{
  for(const [retryMs,expected] of [[7200000,7200000],[1000,30000],[null,3600000],[0,3600000],[NaN,3600000],[Infinity,3600000]]){
    const result=buildFailure(spec,cached,{status:429,retryMs},at);
    assert.equal(result.status,'error');assert.equal(result.lastFailureCode,'HTTP_429');
    assert.equal(Date.parse(result.nextCheckAt)-at,expected);
    assert.equal(result.error,'站方限流，已延后请求。');
  }
});

test('404 and other client failures are visible on the first attempt',()=>{
  const missing=buildFailure(spec,cached,{status:404,message:'HTTP 404'},at);
  assert.equal(missing.status,'error');assert.equal(missing.lastFailureCode,'HTTP_404');
  assert.equal(missing.error,'接口暂不可用，请打开原站核查。');
  const invalid=buildFailure(spec,cached,{status:400,message:'private URL'},at);
  assert.equal(invalid.status,'error');assert.equal(invalid.lastFailureCode,'HTTP_400');
  assert.equal(invalid.error,'站方请求未成功，请打开原站核查。');
});


test('non-transient failures break the temporary-failure streak and retries cannot extend freshness',()=>{
 const format=buildFailure(spec,cached,{code:'INVALID_JSON'},at);
 const first=buildFailure(spec,format,{name:'TimeoutError'},at+60000),second=buildFailure(spec,first,{status:503},at+120000),third=buildFailure(spec,second,{code:'ECONNRESET'},at+180000);
 assert.equal(first.transientFailures,1);assert.equal(second.status,'retrying');assert.equal(third.status,'error');
 const {isFresh}=require('../app/ui/pace-timing.js');
 const success={...cached,status:'ok',updatedAt:new Date(at).toISOString(),fetchedAt:new Date(at).toISOString(),maxAge:900000};
 const retry=buildFailure(spec,success,{name:'TimeoutError'},at+30000);
 assert.equal(isFresh(retry,at+30000),true);assert.equal(isFresh(retry,at+900001),false);
 assert.equal(isFresh(buildFailure(spec,null,{name:'TimeoutError'},at),at),false);
 const afterSuccess=buildFailure(spec,success,{name:'TimeoutError'},at+30000);assert.equal(afterSuccess.transientFailures,1);
});
