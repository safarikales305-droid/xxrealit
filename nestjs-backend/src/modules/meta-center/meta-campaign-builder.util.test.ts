import test from 'node:test';
import assert from 'node:assert/strict';
import {
  META_UNSUPPORTED_COMBINATION_MESSAGE,
  buildCatalogSalesCampaign,
  buildEngagementCampaign,
  buildLeadCampaign,
  buildReachCampaign,
  buildTrafficCampaign,
  migrateInvalidDraftCombination,
  validateMetaCampaignCombination,
} from './meta-campaign-builder.util';
import {
  getMetaCampaignPayloadSpec,
  type MetaCampaignPayloadContext,
} from './meta-campaign-payload-map.util';

const dsaLabels = { beneficiary: 'Test Page', payor: 'Test Page' };

const catalogCtx: MetaCampaignPayloadContext = {
  goal: 'catalog',
  creativeType: 'catalog_products',
  targetingMode: 'map',
  catalogId: '123456789',
  pixelId: 'pixel_1',
  datasetId: null,
  pageId: 'page_1',
  leadFormId: null,
  remarketingConversionEvent: 'PURCHASE',
  selectedProductIds: ['sku-1'],
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

const leadCtx: MetaCampaignPayloadContext = {
  goal: 'lead',
  creativeType: 'listing',
  targetingMode: 'map',
  catalogId: null,
  pixelId: null,
  datasetId: null,
  pageId: 'page_1',
  leadFormId: 'form_1',
  selectedProductIds: [],
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

const engagementCtx: MetaCampaignPayloadContext = {
  goal: 'traffic',
  creativeType: 'custom_video',
  targetingMode: 'map',
  catalogId: null,
  pixelId: null,
  datasetId: null,
  pageId: 'page_1',
  selectedProductIds: [],
};

const targeting = { geo_locations: { cities: [{ key: '777934' }] } };

function builderInput(
  spec: ReturnType<typeof getMetaCampaignPayloadSpec>,
  ctx: MetaCampaignPayloadContext,
) {
  return {
    name: 'Test kampaň',
    campaignId: 'camp_1',
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

test('catalog sales builder: valid OUTCOME_SALES + OFFSITE_CONVERSIONS + catalog', () => {
  const spec = getMetaCampaignPayloadSpec('catalog_sales', catalogCtx);
  const result = buildCatalogSalesCampaign(builderInput(spec, catalogCtx));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.campaignPayload.objective, 'OUTCOME_SALES');
  assert.equal(result.adSetPayload.optimization_goal, 'OFFSITE_CONVERSIONS');
  assert.equal(result.adSetPayload.destination_type, 'SHOP_AUTOMATIC');
  const promoted = JSON.parse(String(result.adSetPayload.promoted_object)) as Record<string, unknown>;
  assert.equal(promoted.product_catalog_id, '123456789');
  assert.equal(promoted.pixel_id, 'pixel_1');
  assert.equal(result.diagnostics.validationOk, true);
});

test('traffic builder: valid OUTCOME_TRAFFIC without catalog', () => {
  const spec = getMetaCampaignPayloadSpec('traffic', trafficCtx);
  const result = buildTrafficCampaign(builderInput(spec, trafficCtx));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.campaignPayload.objective, 'OUTCOME_TRAFFIC');
  assert.equal(result.adSetPayload.optimization_goal, 'LINK_CLICKS');
  assert.equal(result.adSetPayload.promoted_object, undefined);
  assert.equal(result.diagnostics.validationOk, true);
});

test('lead builder: valid OUTCOME_LEADS without catalog_products', () => {
  const spec = getMetaCampaignPayloadSpec('leads', leadCtx);
  const result = buildLeadCampaign(builderInput(spec, leadCtx));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.campaignPayload.objective, 'OUTCOME_LEADS');
  assert.equal(result.adSetPayload.optimization_goal, 'LEAD_GENERATION');
  assert.equal(result.diagnostics.validationOk, true);
});

test('reach builder: valid OUTCOME_AWARENESS without catalog', () => {
  const spec = getMetaCampaignPayloadSpec('reach', reachCtx);
  const result = buildReachCampaign(builderInput(spec, reachCtx));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.campaignPayload.objective, 'OUTCOME_AWARENESS');
  assert.equal(result.adSetPayload.optimization_goal, 'REACH');
  assert.equal(result.diagnostics.validationOk, true);
});

test('engagement builder: valid OUTCOME_ENGAGEMENT without catalog_products', () => {
  const spec = getMetaCampaignPayloadSpec('video', engagementCtx);
  const result = buildEngagementCampaign(builderInput(spec, engagementCtx));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.campaignPayload.objective, 'OUTCOME_ENGAGEMENT');
  assert.equal(result.adSetPayload.optimization_goal, 'THRUPLAY');
  assert.equal(result.diagnostics.validationOk, true);
});

test('invalid combo OUTCOME_TRAFFIC + catalog_products is rejected before API', () => {
  const invalidCtx: MetaCampaignPayloadContext = {
    ...trafficCtx,
    goal: 'traffic',
    creativeType: 'catalog_products',
    catalogId: '123456789',
  };
  const spec = getMetaCampaignPayloadSpec('catalog_sales', {
    ...catalogCtx,
    goal: 'catalog',
    creativeType: 'catalog_products',
  });
  const trafficSpec = {
    ...spec,
    mode: 'traffic' as const,
    modeLabel: 'Návštěvnost',
    campaignObjective: 'OUTCOME_TRAFFIC',
    optimizationGoal: 'LINK_CLICKS',
    creativeSource: 'catalog_products' as const,
    usesCatalog: false,
    destinationType: 'WEBSITE',
  };
  const blockers = validateMetaCampaignCombination({
    spec: trafficSpec,
    ctx: invalidCtx,
    adSetPayload: {
      optimization_goal: 'LINK_CLICKS',
      promoted_object: JSON.stringify({ product_catalog_id: '123456789' }),
    },
  });
  assert.ok(blockers.length > 0);
  assert.ok(blockers.some((b) => b.message.includes(META_UNSUPPORTED_COMBINATION_MESSAGE)));
});

test('migrateInvalidDraftCombination converts traffic + catalog_products to catalog sales', () => {
  const migrated = migrateInvalidDraftCombination({
    goal: 'traffic',
    creativeType: 'catalog_products',
    storedObjective: 'OUTCOME_TRAFFIC',
  });
  assert.equal(migrated.migrated, true);
  assert.equal(migrated.goal, 'catalog');
  assert.equal(migrated.creativeType, 'catalog_products');
  assert.ok(migrated.warning?.includes('Meta'));
});

test('catalog sales without pixel is blocked', () => {
  const noPixelCtx = { ...catalogCtx, pixelId: null, datasetId: null };
  const spec = getMetaCampaignPayloadSpec('catalog_sales', noPixelCtx);
  const result = buildCatalogSalesCampaign(builderInput(spec, noPixelCtx));
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.blockers.some((b) => b.message.includes(META_UNSUPPORTED_COMBINATION_MESSAGE)));
});
