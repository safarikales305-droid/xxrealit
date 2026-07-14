import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPromotedObjectForSpec,
  getMetaCampaignPayloadSpec,
  normalizeAdSetPayloadForMetaV25,
  normalizeTargetingForMetaV25,
  resolveDsaDisclosureLabels,
  serializePayloadForMetaApi,
} from './meta-campaign-payload-map.util';

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

test('catalog_sales spec maps OUTCOME_SALES + OFFSITE_CONVERSIONS + WEBSITE', () => {
  const spec = getMetaCampaignPayloadSpec('catalog_sales', catalogCtx);
  assert.equal(spec.campaignObjective, 'OUTCOME_SALES');
  assert.equal(spec.optimizationGoal, 'OFFSITE_CONVERSIONS');
  assert.equal(spec.billingEvent, 'IMPRESSIONS');
  assert.equal(spec.destinationType, 'WEBSITE');
});

test('catalog promoted_object includes page_id, pixel_id, catalog and PURCHASE', () => {
  const spec = getMetaCampaignPayloadSpec('catalog_sales', catalogCtx);
  const promoted = buildPromotedObjectForSpec(spec, catalogCtx);
  assert.deepEqual(promoted, {
    page_id: 'page_1',
    pixel_id: 'pixel_1',
    custom_event_type: 'PURCHASE',
    product_catalog_id: '123456789',
  });
});

test('normalizeTargetingForMetaV25 sets advantage_audience to 0', () => {
  const targeting = normalizeTargetingForMetaV25({
    geo_locations: { cities: [{ key: '777934' }] },
  });
  assert.deepEqual(targeting.targeting_automation, { advantage_audience: 0 });
});

test('normalizeAdSetPayloadForMetaV25 adds DSA, destination_type and promoted_object', () => {
  const spec = getMetaCampaignPayloadSpec('catalog_sales', catalogCtx);
  const targeting = normalizeTargetingForMetaV25({
    geo_locations: { cities: [{ key: '777934' }] },
  });
  const dsa = resolveDsaDisclosureLabels({
    pageName: 'XXrealit.cz',
    campaignName: 'Test kampaň',
  });
  assert.ok(dsa);

  const normalized = normalizeAdSetPayloadForMetaV25({
    payload: {
      name: 'Test — sada',
      campaign_id: 'camp_1',
      billing_event: 'IMPRESSIONS',
      optimization_goal: 'OFFSITE_CONVERSIONS',
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
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

  assert.equal(normalized.payload.destination_type, 'WEBSITE');
  assert.equal(normalized.payload.dsa_beneficiary, 'XXrealit.cz');
  assert.equal(normalized.payload.dsa_payor, 'XXrealit.cz');
  const promoted = JSON.parse(String(normalized.payload.promoted_object)) as Record<string, unknown>;
  assert.equal(promoted.page_id, 'page_1');
  assert.equal(promoted.product_catalog_id, '123456789');

  const metaForm = serializePayloadForMetaApi(normalized.payload);
  assert.ok(metaForm.targeting.includes('advantage_audience'));
  assert.ok(metaForm.promoted_object.includes('page_id'));
});

test('full launch payload chain serializes campaign → adset → creative → ad', () => {
  const spec = getMetaCampaignPayloadSpec('catalog_sales', catalogCtx);
  const campaignPayload = {
    name: 'Test',
    objective: spec.campaignObjective,
    status: 'PAUSED',
    special_ad_categories: JSON.stringify(['HOUSING']),
    is_adset_budget_sharing_enabled: false,
  };
  const targeting = normalizeTargetingForMetaV25({
    geo_locations: { cities: [{ key: '777934' }] },
  });
  const adSet = normalizeAdSetPayloadForMetaV25({
    payload: {
      name: 'Test — sada',
      campaign_id: 'PREVIEW_CAMPAIGN_ID',
      billing_event: spec.billingEvent,
      optimization_goal: spec.optimizationGoal,
      bid_strategy: spec.bidStrategy,
      targeting: JSON.stringify(targeting),
      status: 'PAUSED',
      daily_budget: '50000',
      is_adset_budget_sharing_enabled: false,
    },
    spec,
    payloadContext: catalogCtx,
    targeting,
    dsaLabels: resolveDsaDisclosureLabels({ pageName: 'XXrealit.cz' }),
  });
  const creativePayload = {
    name: 'Test — kreativa',
    product_set_id: 'ps_1',
    object_story_spec: JSON.stringify({
      page_id: 'page_1',
      template_data: { catalog_id: '123456789', product_set_id: 'ps_1' },
    }),
  };
  const adPayload = {
    name: 'Test — reklama',
    adset_id: 'PREVIEW_ADSET_ID',
    creative: JSON.stringify({ creative_id: 'PREVIEW_CREATIVE_ID' }),
    status: 'PAUSED',
  };

  assert.ok(serializePayloadForMetaApi(campaignPayload).objective);
  assert.ok(serializePayloadForMetaApi(adSet.payload).promoted_object);
  assert.ok(serializePayloadForMetaApi(creativePayload).object_story_spec);
  assert.ok(serializePayloadForMetaApi(adPayload).creative);
});
