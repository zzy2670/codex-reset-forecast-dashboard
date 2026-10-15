'use strict';

const REQUEST_TIMEOUT_MS = 30000;
const VISIBLE_FAILURES = 3;

function failureCode(error) {
  const status = Number(error?.status);
  if (Number.isInteger(status) && status >= 400 && status <= 599) return `HTTP_${status}`;
  if (error?.name === 'AbortError' || error?.name === 'TimeoutError' ||
      /^(?:ABORT_ERR|ETIMEDOUT|ESOCKETTIMEDOUT|ERR_TIMED_OUT|UND_ERR_CONNECT_TIMEOUT|UND_ERR_HEADERS_TIMEOUT|UND_ERR_BODY_TIMEOUT)$/.test(error?.code || '') ||
      /\b(?:net::)?ERR_TIMED_OUT\b/.test(error?.message || '')) return 'TIMEOUT';
  if (error?.name === 'SyntaxError' ||
      /^(?:FORMAT|INVALID_JSON|SCHEMA|INVALID_SCHEMA|INVALID_RESPONSE|RESPONSE_TOO_LARGE)$/.test(error?.code || '') ||
      /^(?:站方数据格式已变化|未返回有效 JSON|响应超出预期大小|缺少数据更新时间)/.test(error?.message || '')) return 'FORMAT';
  return 'NETWORK';
}

function buildFailure(spec, old, error, now = Date.now()) {
  const failures = (Number.isSafeInteger(old?.failures) && old.failures >= 0 ? old.failures : 0) + 1;
  const code = failureCode(error);
  const blocked = code === 'HTTP_403' || code === 'HTTP_401';
  const limited = code === 'HTTP_429';
  const transient = code === 'TIMEOUT' || code === 'NETWORK' || /^HTTP_5\d\d$/.test(code) || code === 'HTTP_408';
  const priorTransient=/^(?:TIMEOUT|NETWORK|HTTP_408|HTTP_5\d\d)$/.test(old?.lastFailureCode||'');
  const transientFailures=transient?(priorTransient?(old?.transientFailures||0):0)+1:0;
  const retrying = transient && transientFailures < VISIBLE_FAILURES;
  const retryMs = Number.isFinite(error?.retryMs) && error.retryMs > 0 ? error.retryMs : 3600000;
  const wait = limited ? Math.max(retryMs, spec.interval) : Math.min(900000, spec.interval * 2 ** Math.min(failures, 4));
  let message = '获取失败，保留上次信息；稍后自动重试。';
  if (blocked) message = '站点暂时拒绝访问，点击立即检查可重试；也可打开原站核查。';
  else if (limited) message = '站方限流，已延后请求。';
  else if (code === 'HTTP_404') message = '接口暂不可用，请打开原站核查。';
  else if (code === 'FORMAT') message = '站方数据格式已变化，请打开原站核查。';
  else if (!transient) message = '站方请求未成功，请打开原站核查。';
  return {
    ...spec, ...old,
    status: blocked ? 'blocked' : retrying ? 'retrying' : 'error',
    error: retrying ? null : message,
    failures,
    transientFailures,
    lastFailureCode: code,
    lastAttemptAt: new Date(now).toISOString(),
    nextCheckAt: blocked ? null : new Date(Number(now) + wait).toISOString(),
    notes: old?.notes || [],
    probabilities: old?.probabilities || [],
    signals: old?.signals || [],
    forecast: old?.forecast || { state: 'none' }
  };
}

module.exports = { REQUEST_TIMEOUT_MS, VISIBLE_FAILURES, buildFailure };
