import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCatalogSalesCampaign,
  buildCatalogTrafficCampaign,
  buildReachCampaign,
  buildTrafficCampaign,
  validateMetaCampaignCombination,
} from './meta-campaign-builder.util';
import { getMetaCampaignPayloadSpec } from './meta-campaign-payload-map.util';
import type { MetaCampaignPayloadContext } from './meta-campaign-payload-map.util';

const dsaLabels = { beneficiary: 'Test Page', payor: 'Test Page' };
const targeting = {
  geo_locations: {
    custom_locations: [
      { latitude: 50.0755, longitude: 14.4378, radius: 17, distance_unit: 'kilometer' },
    ],
  },
};

function builderInput(
  spec: ReturnType<typeof getMetaCampaignPayloadSpec>,
  ctx: MetaCampaignPayloadContext,
) {
  return {
    name: 'Integration test',
    campaignId: 'camp_integration',
    publishStatus: 'PAUSED' as const,
    dailyBudgetMinor: 50000,
    useCampaignBudgetOptimization: false,
    isAdsetBudgetSharingEnabled: false,
    targeting,
    dsaLabels,
    spec,
    payloadContext: ctx,
  };
}

const catalogSalesCtx: MetaCampaignPayloadContext = {
  goal: 'catalog',
  creativeType: 'catalog_products',
  targetingMode: 'map',
  catalogId: '123456789',
  pixelId: 'pixel_1',
  datasetId: null,
  pageId: 'page_1',
  selectedProductIds: ['sku-1'],
  catalogLaunchMode: 'sales',
};

const catalogTrafficCtx: MetaCampaignPayloadContext = {
  ...catalogSalesCtx,
  pixelId: null,
  catalogLaunchMode: 'traffic',
};

const reachCtx: MetaCampaignPayloadContext = {
  goal: 'reach',
  creativeType: 'custom_image',
  targetingMode: 'map',
  catalogId: null,
  pixelId: null,
  datasetId: null,
  pageId: 'page_1',
  selectedProductIds: [],
};

const trafficCtx: MetaCampaignPayloadContext = {
  goal: 'traffic',
  creativeType: 'listing',
  targetingMode: 'map',
  catalogId: null,
  pixelId: null,
  datasetId: null,
  pageId: 'page_1',
  selectedProductIds: ['sku-1'],
};

/**
 * Integrační test Meta Ad Set promoted_object — prevence error_subcode 1815229.
 */
test('Meta integration: catalog sales Ad Set has product_catalog_id', () => {
  const spec = getMetaCampaignPayloadSpec('catalog_sales', catalogSalesCtx);
  const result = buildCatalogSalesCampaign(builderInput(spec, catalogSalesCtx));
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const promoted = JSON.parse(String(result.adSetPayload.promoted_object)) as Record<string, unknown>;
  assert.equal(promoted.product_catalog_id, '123456789');
  assert.equal(promoted.pixel_id, 'pixel_1');
  assert.equal(result.adSetPayload.optimization_goal, 'OFFSITE_CONVERSIONS');
  assert.equal(result.adSetPayload.destination_type, 'SHOP_AUTOMATIC');
  assert.equal(result.diagnostics.validationOk, true);
});

test('Meta integration: catalog traffic fallback has no product_catalog_id in promoted_object', () => {
  const spec = getMetaCampaignPayloadSpec('catalog_traffic', catalogTrafficCtx);
  const result = buildCatalogTrafficCampaign(builderInput(spec, catalogTrafficCtx));
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.adSetPayload.promoted_object, undefined);
  assert.equal(result.campaignPayload.objective, 'OUTCOME_AWARENESS');
  assert.equal(result.adSetPayload.optimization_goal, 'REACH');
  assert.equal(validateMetaCampaignCombination({ spec, ctx: catalogTrafficCtx, adSetPayload: result.adSetPayload }).length, 0);
});

test('Meta integration: REACH campaign has no product_catalog_id', () => {
  const spec = getMetaCampaignPayloadSpec('reach', reachCtx);
  const result = buildReachCampaign(builderInput(spec, reachCtx));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.adSetPayload.promoted_object, undefined);
});

test('Meta integration: TRAFFIC campaign has no product_catalog_id', () => {
  const spec = getMetaCampaignPayloadSpec('traffic', trafficCtx);
  const result = buildTrafficCampaign(builderInput(spec, trafficCtx));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.adSetPayload.promoted_object, undefined);
});

test('Meta integration: diagnostics expose objective, optimization, destination, promoted object', () => {
  const spec = getMetaCampaignPayloadSpec('catalog_sales', catalogSalesCtx);
  const result = buildCatalogSalesCampaign(builderInput(spec, catalogSalesCtx));
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.diagnostics.objective, 'OUTCOME_SALES');
  assert.equal(result.diagnostics.optimizationGoal, 'OFFSITE_CONVERSIONS');
  assert.equal(result.diagnostics.destinationType, 'SHOP_AUTOMATIC');
  assert.ok(result.diagnostics.promotedObject);
  assert.equal(result.diagnostics.promotedObject?.product_catalog_id, '123456789');
});
