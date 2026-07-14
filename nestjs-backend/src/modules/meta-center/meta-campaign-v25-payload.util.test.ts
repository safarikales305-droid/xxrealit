import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPromotedObjectForSpec,
  getMetaCampaignPayloadSpec,
  normalizeAdSetPayloadForMetaV25,
  normalizeTargetingForMetaV25,
  resolveDsaDisclosureLabels,
  serializePayloadForMetaApi,
  validateAdSetPayloadCombination,
} from './meta-campaign-payload-map.util';
import { buildCatalogAdSet } from './meta-catalog-adset.util';

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

const dsa = { beneficiary: 'XXrealit.cz', payor: 'XXrealit.cz' };

test('traffic v25: LINK_CLICKS without catalog_id in promoted_object', () => {
  const trafficCtx = {
    goal: 'traffic',
    creativeType: 'listing',
    targetingMode: 'map',
    catalogId: null,
    pixelId: null,
    datasetId: null,
    pageId: 'page_1',
    leadFormId: null,
    selectedProductIds: ['sku-1'],
  };
  const spec = getMetaCampaignPayloadSpec('traffic', trafficCtx);
  assert.equal(spec.campaignObjective, 'OUTCOME_TRAFFIC');
  assert.equal(spec.optimizationGoal, 'LINK_CLICKS');
  assert.equal(spec.usesCatalog, false);
  const promoted = buildPromotedObjectForSpec(spec, trafficCtx);
  assert.equal(promoted, null);
});

test('catalog_sales v25: WEBSITE conversion location without destination_type', () => {
  const spec = getMetaCampaignPayloadSpec('catalog_sales', catalogCtx);
  assert.equal(spec.campaignObjective, 'OUTCOME_SALES');
  assert.equal(spec.optimizationGoal, 'OFFSITE_CONVERSIONS');
  assert.equal(spec.destinationType, null);
  assert.equal(spec.conversionLocation, 'WEBSITE');
  assert.equal(spec.advantageAudience, 1);
});

test('catalog promoted_object: catalog_id + pixel_id + PURCHASE only (no page_id)', () => {
  const spec = getMetaCampaignPayloadSpec('catalog_sales', catalogCtx);
  const promoted = buildPromotedObjectForSpec(spec, catalogCtx);
  assert.deepEqual(promoted, {
    catalog_id: '123456789',
    pixel_id: 'pixel_1',
    custom_event_type: 'PURCHASE',
  });
  assert.equal('page_id' in (promoted ?? {}), false);
});

test('SHOP_AUTOMATIC destination_type is rejected', () => {
  const spec = getMetaCampaignPayloadSpec('catalog_sales', catalogCtx);
  const blockers = validateAdSetPayloadCombination(
    {
      optimization_goal: 'OFFSITE_CONVERSIONS',
      billing_event: 'IMPRESSIONS',
      destination_type: 'SHOP_AUTOMATIC',
      promoted_object: JSON.stringify({
        pixel_id: 'pixel_1',
        custom_event_type: 'PURCHASE',
        catalog_id: '123456789',
      }),
    },
    spec,
  );
  assert.ok(blockers.some((b) => b.key === 'adset.destination_type.unsupported'));
});

test('legacy product_catalog_id without catalog_id is rejected for catalog sales', () => {
  const spec = getMetaCampaignPayloadSpec('catalog_sales', catalogCtx);
  const blockers = validateAdSetPayloadCombination(
    {
      optimization_goal: 'OFFSITE_CONVERSIONS',
      billing_event: 'IMPRESSIONS',
      promoted_object: JSON.stringify({
        page_id: 'page_1',
        pixel_id: 'pixel_1',
        custom_event_type: 'PURCHASE',
        product_catalog_id: '123456789',
      }),
    },
    spec,
  );
  assert.ok(blockers.some((b) => b.key === 'adset.promoted_object.page_id_forbidden'));
  assert.ok(blockers.some((b) => b.key === 'adset.promoted_object.product_catalog_id_deprecated'));
});

test('catalog targeting uses advantage_audience=1 per v25 ODAX', () => {
  const targeting = normalizeTargetingForMetaV25(
    { geo_locations: { cities: [{ key: '777934' }] } },
    1,
  );
  assert.deepEqual(targeting.targeting_automation, { advantage_audience: 1 });
});

test('buildCatalogAdSet builds valid catalog ad set payload', () => {
  const built = buildCatalogAdSet({
    campaignId: 'camp_1',
    adSetName: 'Test — sada',
    publishStatus: 'PAUSED',
    dailyBudgetMinor: 50000,
    targeting: { geo_locations: { cities: [{ key: '777934' }] } },
    catalogId: '123456789',
    pixelId: 'pixel_1',
    dsaLabels: dsa,
    isAdsetBudgetSharingEnabled: false,
  });

  assert.equal(built.payload.destination_type, undefined);
  assert.equal(built.conversionLocation, 'WEBSITE');
  assert.deepEqual(built.promotedObject, {
    catalog_id: '123456789',
    pixel_id: 'pixel_1',
    custom_event_type: 'PURCHASE',
  });
});

test('normalizeAdSetPayloadForMetaV25 strips destination_type from catalog ad set', () => {
  const spec = getMetaCampaignPayloadSpec('catalog_sales', catalogCtx);
  const targeting = normalizeTargetingForMetaV25(
    { geo_locations: { cities: [{ key: '777934' }] } },
    spec.advantageAudience,
  );

  const normalized = normalizeAdSetPayloadForMetaV25({
    payload: {
      name: 'Test — sada',
      campaign_id: 'camp_1',
      billing_event: 'IMPRESSIONS',
      optimization_goal: 'OFFSITE_CONVERSIONS',
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      destination_type: 'SHOP_AUTOMATIC',
      targeting: JSON.stringify(targeting),
      status: 'PAUSED',
      daily_budget: '50000',
      is_adset_budget_sharing_enabled: false,
    },
    spec,
    payloadContext: catalogCtx,
    targeting,
    dsaLabels: dsa,
  });

  assert.equal(normalized.payload.destination_type, undefined);
  assert.ok(normalized.corrections.some((c) => c.includes('destination_type odstraněno')));
  const promoted = JSON.parse(String(normalized.payload.promoted_object)) as Record<string, unknown>;
  assert.equal(promoted.catalog_id, '123456789');
});

test('full launch chain: campaign → adset → creative → ad serializes for Meta API v25', () => {
  const spec = getMetaCampaignPayloadSpec('catalog_sales', catalogCtx);
  const campaignPayload = {
    name: 'Test',
    objective: spec.campaignObjective,
    status: 'PAUSED',
    special_ad_categories: JSON.stringify(['HOUSING']),
    is_adset_budget_sharing_enabled: false,
  };
  const adSet = buildCatalogAdSet({
    campaignId: 'PREVIEW_CAMPAIGN_ID',
    adSetName: 'Test — sada',
    publishStatus: 'PAUSED',
    dailyBudgetMinor: 50000,
    targeting: normalizeTargetingForMetaV25(
      { geo_locations: { cities: [{ key: '777934' }] } },
      spec.advantageAudience,
    ),
    catalogId: '123456789',
    pixelId: 'pixel_1',
    dsaLabels: dsa,
    isAdsetBudgetSharingEnabled: false,
  });
  const creativePayload = {
    name: 'Test — kreativa',
    product_set_id: 'ps_1',
    object_story_spec: JSON.stringify({
      page_id: 'page_1',
      template_data: {
        catalog_id: '123456789',
        product_set_id: 'ps_1',
        link: 'https://www.xxrealit.cz',
      },
    }),
  };
  const adPayload = {
    name: 'Test — reklama',
    adset_id: 'PREVIEW_ADSET_ID',
    creative: JSON.stringify({ creative_id: 'PREVIEW_CREATIVE_ID' }),
    status: 'PAUSED',
  };

  const adSetForm = serializePayloadForMetaApi(adSet.payload);
  assert.equal(adSetForm.destination_type, undefined);
  assert.ok(serializePayloadForMetaApi(campaignPayload).objective);
  assert.ok(adSetForm.promoted_object.includes('catalog_id'));
  assert.ok(serializePayloadForMetaApi(creativePayload).object_story_spec);
  assert.ok(serializePayloadForMetaApi(adPayload).creative);
});
