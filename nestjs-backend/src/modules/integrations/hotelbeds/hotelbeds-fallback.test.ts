import test from 'node:test';
import assert from 'node:assert/strict';
import { HotelbedsMetricsService } from './hotelbeds-metrics.service';
import {
  isQuotaExceededMessage,
  parseCatalogQueryParam,
  resolveContentApiAccessStatus,
  shouldBlockContentApiRequest,
} from './hotelbeds-content-api-status.util';
import { tracePublicCatalogFilters } from './hotelbeds-public-catalog.util';
import type { NormalizedAccommodation } from './hotelbeds-normalized.types';

function sampleHotel(overrides: Partial<NormalizedAccommodation> = {}): NormalizedAccommodation {
  return {
    id: 'hb-6741',
    provider: 'HOTELBEDS',
    providerId: '6741',
    name: 'Hotel Duo',
    slug: 'hotel-6741-hotel-duo',
    description: 'Desc',
    shortDescription: 'Short',
    category: 'HOTEL',
    type: 'HOTEL',
    stars: 4,
    rating: null,
    reviewCount: 0,
    address: 'Teplicka 492',
    city: 'Praha',
    region: null,
    country: 'CZ',
    latitude: 50.12,
    longitude: 14.48,
    photos: [],
    facilities: [],
    rooms: [],
    boardTypes: [],
    priceFrom: null,
    priceFromOriginal: null,
    currency: 'CZK',
    originalCurrency: 'EUR',
    priceUnit: 'PER_NIGHT',
    available: false,
    cancellationPolicy: null,
    checkIn: '2026-01-01',
    checkOut: '2026-01-03',
    checkInFrom: '15:00',
    checkOutUntil: '11:00',
    sourceEnvironment: 'TEST',
    amenities: [],
    tags: [],
    wifi: false,
    parking: false,
    breakfast: false,
    wellness: false,
    pool: false,
    seoTitle: null,
    seoDescription: null,
    coverPhoto: null,
    xxrealitCategory: 'hotely',
    contentEnriched: true,
    petsAllowed: false,
    accessible: false,
    catalogOnly: true,
    availabilityStatus: 'unknown',
    ...overrides,
  };
}

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

test('catalog hotels without price are not removed by priceMax', () => {
  const traced = tracePublicCatalogFilters([sampleHotel()], { priceMax: 1000, catalog: true });
  assert.equal(traced.items.length, 1);
});

test('default catalog browse does not filter by implicit destination', () => {
  const traced = tracePublicCatalogFilters([sampleHotel({ city: 'Brno' })], { catalog: true });
  assert.equal(traced.items.length, 1);
});

test('explicit destination filter can remove hotels outside city', () => {
  const traced = tracePublicCatalogFilters([sampleHotel({ city: 'Brno' })], {
    catalog: true,
    destination: 'Praha',
    filterDestination: true,
  });
  assert.equal(traced.items.length, 0);
});
