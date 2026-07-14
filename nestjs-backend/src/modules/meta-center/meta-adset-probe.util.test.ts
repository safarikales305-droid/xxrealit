import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMetaAdSetProbeSteps,
  buildSupportedCatalogAdSetPayload,
  catalogSalesV25Validation,
  summarizeProbeResult,
} from './meta-adset-probe.util';
import { getMetaCampaignPayloadSpec } from './meta-campaign-payload-map.util';

const catalogCtx = {
  goal: 'catalog',
  creativeType: 'catalog_products',
  targetingMode: 'map',
  catalogId: '123456789',
  pixelId: 'pixel_1',
  datasetId: null,
  pageId: 'page_1',
  leadFormId: null,
  remarketingConversionEvent: 'PURCHASE' as const,
  selectedProductIds: ['sku-1'],
};

test('buildMetaAdSetProbeSteps returns 7 incremental steps', () => {
  const spec = getMetaCampaignPayloadSpec('catalog_sales', catalogCtx);
  const steps = buildMetaAdSetProbeSteps({
    campaignId: 'camp_1',
    adSetName: 'Probe',
    publishStatus: 'PAUSED',
    dailyBudgetMinor: 50000,
    billingEvent: spec.billingEvent,
    optimizationGoal: spec.optimizationGoal,
    bidStrategy: spec.bidStrategy,
    destinationType: spec.destinationType,
    advantageAudience: spec.advantageAudience,
    targeting: { geo_locations: { cities: [{ key: '777934' }] } },
    catalogId: '123456789',
    pixelId: 'pixel_1',
    dsaLabels: { beneficiary: 'XX', payor: 'XX' },
    isAdsetBudgetSharingEnabled: false,
  });
  assert.equal(steps.length, 7);
  assert.equal(steps[0].key, 'minimal');
  assert.equal(steps[6].key, 'targeting_automation');
  for (const step of steps) {
    step.buildPayload();
  }
  const finalPayload = steps[5].buildPayload();
  assert.equal(finalPayload.destination_type, undefined);
  const automationPayload = steps[6].buildPayload();
  const promoted = JSON.parse(String(automationPayload.promoted_object)) as Record<string, unknown>;
  assert.equal(promoted.custom_event_type, 'PURCHASE');
  assert.equal(promoted.pixel_id, 'pixel_1');
  assert.equal(promoted.catalog_id, '123456789');
});

test('buildSupportedCatalogAdSetPayload matches v25 catalog sales spec', () => {
  const spec = getMetaCampaignPayloadSpec('catalog_sales', catalogCtx);
  const payload = buildSupportedCatalogAdSetPayload({
    campaignId: 'camp_1',
    adSetName: 'Test — sada',
    publishStatus: 'PAUSED',
    dailyBudgetMinor: 50000,
    spec,
    targeting: { geo_locations: { cities: [{ key: '777934' }] } },
    catalogId: '123456789',
    pixelId: 'pixel_1',
    dsaLabels: { beneficiary: 'XXrealit.cz', payor: 'XXrealit.cz' },
    isAdsetBudgetSharingEnabled: false,
  });
  assert.equal(payload.optimization_goal, 'OFFSITE_CONVERSIONS');
  assert.equal(payload.destination_type, undefined);
  const promoted = JSON.parse(String(payload.promoted_object)) as Record<string, unknown>;
  assert.deepEqual(promoted, {
    catalog_id: '123456789',
    pixel_id: 'pixel_1',
    custom_event_type: 'PURCHASE',
  });
  assert.ok(String(payload.targeting).includes('"advantage_audience":1'));
});

test('catalogSalesV25Validation documents supported catalog fields', () => {
  const spec = getMetaCampaignPayloadSpec('catalog_sales', catalogCtx);
  const rows = catalogSalesV25Validation(spec);
  assert.ok(rows.every((r) => r.supported));
  assert.ok(rows.some((r) => r.field === 'optimization_goal' && r.value === 'OFFSITE_CONVERSIONS'));
  assert.ok(rows.some((r) => r.field === 'conversion_location' && r.value === 'WEBSITE'));
});

test('summarizeProbeResult flags code=2 failure step', () => {
  const spec = getMetaCampaignPayloadSpec('catalog_sales', catalogCtx);
  const summary = summarizeProbeResult(
    'camp_1',
    'v25.0',
    '/act_1/adsets',
    [
      {
        step: 1,
        key: 'minimal',
        label: 'Min',
        fieldAdded: 'minimal',
        payload: {},
        metaForm: {},
        graphUrl: 'https://graph.facebook.com/v25.0/act_1/adsets',
        httpStatus: 200,
        ok: true,
        errorCode: null,
        errorType: null,
        errorMessage: null,
        requestId: 'req1',
        fbtraceId: null,
        traceId: null,
        response: { id: 'adset_1' },
        createdAdSetId: 'adset_1',
        isCode2: false,
      },
      {
        step: 7,
        key: 'catalog_id',
        label: 'Catalog id',
        fieldAdded: 'promoted_object.catalog_id',
        payload: { promoted_object: JSON.stringify({ catalog_id: '123' }) },
        metaForm: {},
        graphUrl: 'https://graph.facebook.com/v25.0/act_1/adsets',
        httpStatus: 500,
        ok: false,
        errorCode: '2',
        errorType: 'OAuthException',
        errorMessage: 'An unexpected error has occurred.',
        requestId: 'req2',
        fbtraceId: 'trace_abc',
        traceId: 'trace_abc',
        response: { error: { code: 2 } },
        createdAdSetId: null,
        isCode2: true,
      },
    ],
    spec,
    null,
  );
  assert.equal(summary.ok, false);
  assert.equal(summary.failureStep?.key, 'catalog_id');
  assert.match(summary.message, /Code=2/);
});
