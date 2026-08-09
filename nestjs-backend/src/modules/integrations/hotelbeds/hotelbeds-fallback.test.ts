import test from 'node:test';
import assert from 'node:assert/strict';
import { HotelbedsMetricsService } from './hotelbeds-metrics.service';
import {
  isQuotaExceededMessage,
  parseCatalogQueryParam,
  resolveContentApiAccessStatus,
  shouldBlockContentApiRequest,
} from './hotelbeds-content-api-status.util';

test('parseCatalogQueryParam defaults to catalog mode', () => {
  assert.equal(parseCatalogQueryParam(undefined), true);
  assert.equal(parseCatalogQueryParam('1'), true);
  assert.equal(parseCatalogQueryParam('true'), true);
  assert.equal(parseCatalogQueryParam('0'), false);
  assert.equal(parseCatalogQueryParam('false'), false);
});

test('scenario A: content and booking available', () => {
  const status = resolveContentApiAccessStatus({
    contentApiOk: true,
    permissionDenied: false,
    quotaBlocked: false,
  });
  assert.equal(status, 'AUTHORIZED');
  assert.equal(
    shouldBlockContentApiRequest({ quotaBlocked: false, permissionDenied: false }),
    false,
  );
});

test('scenario B: quota exceeded with DB fallback still allows public catalog', () => {
  const status = resolveContentApiAccessStatus({
    contentApiOk: false,
    permissionDenied: false,
    quotaBlocked: true,
    lastFailedStatus: 403,
    lastFailedMessage: '{"error":"Quota exceeded"}',
  });
  assert.equal(status, 'QUOTA_EXCEEDED');
  assert.equal(
    shouldBlockContentApiRequest({ quotaBlocked: true, permissionDenied: false }),
    true,
  );
  assert.equal(isQuotaExceededMessage('{"error":"Quota exceeded"}'), true);
});

test('scenario C: quota exceeded does not imply unauthorized', () => {
  const metrics = new HotelbedsMetricsService();
  metrics.markContentApiQuotaExceeded(60_000);
  assert.equal(metrics.isContentApiQuotaBlocked(), true);
  assert.equal(metrics.contentDiagnostics().contentApiPermissionDenied, false);
  assert.equal(metrics.getContentApiAccessStatus(), 'QUOTA_EXCEEDED');
});

test('scenario D: content API blocked during quota cooldown', () => {
  const metrics = new HotelbedsMetricsService();
  metrics.markContentApiQuotaExceeded(60_000);
  assert.equal(metrics.isContentApiDisabled(), true);

  const beforeCalls = metrics.contentDiagnostics().contentApiQuotaExceeded;
  assert.equal(beforeCalls, true);

  metrics.recordRequest({
    method: 'GET',
    endpoint: 'content/hotels',
    status: 403,
    responseTimeMs: 12,
    errorBody: '{"error":"Quota exceeded"}',
  });
  assert.equal(metrics.isContentApiQuotaBlocked(), true);
});

test('scenario E: unauthorized is separate from quota exceeded', () => {
  const status = resolveContentApiAccessStatus({
    contentApiOk: false,
    permissionDenied: true,
    quotaBlocked: false,
    lastFailedStatus: 403,
    lastFailedMessage: 'Forbidden',
  });
  assert.equal(status, 'UNAUTHORIZED');
});

test('temporary server errors map to TEMPORARY_ERROR', () => {
  const status = resolveContentApiAccessStatus({
    contentApiOk: false,
    permissionDenied: false,
    quotaBlocked: false,
    lastFailedStatus: 503,
    lastFailedMessage: 'Service unavailable',
  });
  assert.equal(status, 'TEMPORARY_ERROR');
});
