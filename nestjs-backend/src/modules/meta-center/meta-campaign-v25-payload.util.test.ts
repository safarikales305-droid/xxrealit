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

test('catalog_traffic v25: LINK_CLICKS without pixel in promoted_object', () => {
  const spec = getMetaCampaignPayloadSpec('catalog_traffic', catalogCtx);
  assert.equal(spec.campaignObjective, 'OUTCOME_TRAFFIC');
  assert.equal(spec.optimizationGoal, 'LINK_CLICKS');
  assert.equal(spec.usesPixel, false);
  const promoted = buildPromotedObjectForSpec(spec, catalogCtx);
  assert.deepEqual(promoted, { product_catalog_id: '123456789' });
});

test('catalog_sales v25: SHOP_AUTOMATIC + OFFSITE_CONVERSIONS (not WEBSITE)', () => {
  const spec = getMetaCampaignPayloadSpec('catalog_sales', catalogCtx);
  assert.equal(spec.campaignObjective, 'OUTCOME_SALES');
  assert.equal(spec.optimizationGoal, 'OFFSITE_CONVERSIONS');
  assert.equal(spec.destinationType, 'SHOP_AUTOMATIC');
  assert.equal(spec.advantageAudience, 1);
});

test('catalog promoted_object: product_catalog_id + pixel_id + PURCHASE only (no page_id)', () => {
  const spec = getMetaCampaignPayloadSpec('catalog_sales', catalogCtx);
  const promoted = buildPromotedObjectForSpec(spec, catalogCtx);
  assert.deepEqual(promoted, {
    product_catalog_id: '123456789',
    pixel_id: 'pixel_1',
    custom_event_type: 'PURCHASE',
  });
  assert.equal('page_id' in (promoted ?? {}), false);
});

test('legacy invalid combo WEBSITE + page_id in promoted_object is rejected', () => {
  const spec = getMetaCampaignPayloadSpec('catalog_sales', catalogCtx);
  const blockers = validateAdSetPayloadCombination(
    {
      optimization_goal: 'OFFSITE_CONVERSIONS',
      billing_event: 'IMPRESSIONS',
      destination_type: 'WEBSITE',
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
  assert.ok(blockers.some((b) => b.key === 'adset.destination_type.website_forbidden'));
});

test('catalog targeting uses advantage_audience=1 per v25 ODAX', () => {
  const targeting = normalizeTargetingForMetaV25(
    { geo_locations: { cities: [{ key: '777934' }] } },
    1,
  );
  assert.deepEqual(targeting.targeting_automation, { advantage_audience: 1 });
});

test('normalizeAdSetPayloadForMetaV25 builds valid catalog ad set payload', () => {
  const spec = getMetaCampaignPayloadSpec('catalog_sales', catalogCtx);
  const targeting = normalizeTargetingForMetaV25(
    { geo_locations: { cities: [{ key: '777934' }] } },
    spec.advantageAudience,
  );
  const dsa = resolveDsaDisclosureLabels({ pageName: 'XXrealit.cz' });
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

  assert.equal(normalized.payload.destination_type, 'SHOP_AUTOMATIC');
  assert.equal(normalized.payload.dsa_beneficiary, 'XXrealit.cz');
  const promoted = JSON.parse(String(normalized.payload.promoted_object)) as Record<string, unknown>;
  assert.equal(promoted.product_catalog_id, '123456789');
  assert.equal(promoted.pixel_id, 'pixel_1');
  assert.equal(promoted.custom_event_type, 'PURCHASE');
  assert.equal(promoted.page_id, undefined);

  const metaForm = serializePayloadForMetaApi(normalized.payload);
  assert.ok(metaForm.targeting.includes('"advantage_audience":1'));
  assert.ok(!metaForm.promoted_object.includes('page_id'));
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
  const targeting = normalizeTargetingForMetaV25(
    { geo_locations: { cities: [{ key: '777934' }] } },
    spec.advantageAudience,
  );
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
  assert.equal(adSetForm.destination_type, 'SHOP_AUTOMATIC');
  assert.ok(serializePayloadForMetaApi(campaignPayload).objective);
  assert.ok(adSetForm.promoted_object);
  assert.ok(serializePayloadForMetaApi(creativePayload).object_story_spec);
  assert.ok(serializePayloadForMetaApi(adPayload).creative);
});
