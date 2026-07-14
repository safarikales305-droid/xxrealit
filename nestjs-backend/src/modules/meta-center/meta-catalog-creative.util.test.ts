import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildCatalogCreativePayload,
  planMetaLaunchResume,
  validateCatalogCreativeBodyBeforeMetaApi,
  validateCatalogCreativeTemplateData,
} from './meta-catalog-creative.util';

const baseInput = {
  name: 'Test — kreativa',
  pageId: 'page_123',
  productSetId: 'ps_456',
  link: 'https://www.xxrealit.cz/nemovitost/1',
  message: 'Nabídka nemovitosti',
  headline: 'Byt 3+1 Brno',
  description: 'Brno',
  ctaType: 'LEARN_MORE',
};

test('buildCatalogCreativePayload: template_data without catalog_id or product_set_id', () => {
  const built = buildCatalogCreativePayload(baseInput);
  const spec = JSON.parse(built.body.object_story_spec) as {
    page_id: string;
    template_data: Record<string, unknown>;
  };

  assert.equal(built.body.product_set_id, 'ps_456');
  assert.equal(spec.page_id, 'page_123');
  assert.equal(spec.template_data.link, baseInput.link);
  assert.equal(spec.template_data.message, baseInput.message);
  assert.equal(spec.template_data.name, baseInput.headline);
  assert.equal(spec.template_data.description, baseInput.description);
  assert.equal(
    (spec.template_data.call_to_action as { type: string }).type,
    'LEARN_MORE',
  );
  assert.equal(spec.template_data.catalog_id, undefined);
  assert.equal(spec.template_data.product_catalog_id, undefined);
  assert.equal(spec.template_data.product_set_id, undefined);
  assert.equal(spec.template_data.pixel_id, undefined);
  assert.equal(spec.template_data.dataset_id, undefined);
  assert.equal(built.diagnostics.forbiddenFields.catalogIdInTemplateData, false);
  assert.equal(built.diagnostics.forbiddenFields.productCatalogIdInTemplateData, false);
});

test('validateCatalogCreativeTemplateData rejects catalog_id in template_data', () => {
  assert.throws(
    () => validateCatalogCreativeTemplateData({ catalog_id: '123' }),
    /catalog_id must not be inside object_story_spec\.template_data/,
  );
});

test('validateCatalogCreativeTemplateData rejects product_catalog_id in template_data', () => {
  assert.throws(
    () => validateCatalogCreativeTemplateData({ product_catalog_id: '123' }),
    /product_catalog_id must not be inside object_story_spec\.template_data/,
  );
});

test('validateCatalogCreativeBodyBeforeMetaApi rejects legacy creative payload', () => {
  assert.throws(() =>
    validateCatalogCreativeBodyBeforeMetaApi({
      name: 'Legacy',
      product_set_id: 'ps_1',
      object_story_spec: JSON.stringify({
        page_id: 'page_1',
        template_data: {
          catalog_id: 'cat_1',
          product_set_id: 'ps_1',
          link: 'https://example.com',
        },
      }),
    }),
  );
});

test('planMetaLaunchResume skips campaign and ad set when IDs exist', () => {
  const plan = planMetaLaunchResume({
    metaCampaignId: 'camp_1',
    metaAdSetId: 'adset_1',
    metaCreativeId: null,
    metaAdId: null,
  });
  assert.equal(plan.createCampaign, false);
  assert.equal(plan.createAdSet, false);
  assert.equal(plan.createCreative, true);
  assert.equal(plan.createAd, false);
});

test('planMetaLaunchResume creates ad after creative exists', () => {
  const plan = planMetaLaunchResume({
    metaCampaignId: 'camp_1',
    metaAdSetId: 'adset_1',
    metaCreativeId: 'creative_1',
    metaAdId: null,
  });
  assert.equal(plan.createCampaign, false);
  assert.equal(plan.createAdSet, false);
  assert.equal(plan.createCreative, false);
  assert.equal(plan.createAd, true);
});
