import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPromotedObject,
  validatePromotedObjectRules,
} from './meta-promoted-object.util';

const catalogId = '123456789';
const pixelId = 'pixel_1';

test('CATALOG SALES must contain catalog_id', () => {
  const promoted = buildPromotedObject({
    campaignObjective: 'OUTCOME_SALES',
    optimizationGoal: 'OFFSITE_CONVERSIONS',
    creativeSource: 'catalog_products',
    catalogId,
    pixelId,
    customEventType: 'PURCHASE',
  });
  assert.ok(promoted);
  assert.equal(promoted!.catalog_id, catalogId);
  assert.equal(promoted!.pixel_id, pixelId);
  assert.equal(promoted!.custom_event_type, 'PURCHASE');
  assert.deepEqual(
    validatePromotedObjectRules({
      campaignObjective: 'OUTCOME_SALES',
      optimizationGoal: 'OFFSITE_CONVERSIONS',
      creativeSource: 'catalog_products',
      promotedObject: promoted,
    }),
    [],
  );
});

test('REACH must not contain catalog_id', () => {
  const promoted = buildPromotedObject({
    campaignObjective: 'OUTCOME_AWARENESS',
    optimizationGoal: 'REACH',
    creativeSource: 'catalog_products',
    catalogId,
  });
  assert.equal(promoted, null);
  assert.notEqual(
    validatePromotedObjectRules({
      campaignObjective: 'OUTCOME_AWARENESS',
      optimizationGoal: 'REACH',
      creativeSource: 'catalog_products',
      promotedObject: { catalog_id: catalogId },
    }).length,
    0,
  );
});

test('TRAFFIC must not contain catalog_id', () => {
  const promoted = buildPromotedObject({
    campaignObjective: 'OUTCOME_TRAFFIC',
    optimizationGoal: 'LINK_CLICKS',
    creativeSource: 'listing',
    catalogId,
    pixelId,
  });
  assert.equal(promoted, null);
  assert.notEqual(
    validatePromotedObjectRules({
      campaignObjective: 'OUTCOME_TRAFFIC',
      optimizationGoal: 'LINK_CLICKS',
      promotedObject: { catalog_id: catalogId },
    }).length,
    0,
  );
});

test('AWARENESS must not contain catalog_id', () => {
  const promoted = buildPromotedObject({
    campaignObjective: 'OUTCOME_AWARENESS',
    optimizationGoal: 'REACH',
    creativeSource: 'custom_image',
    catalogId,
  });
  assert.equal(promoted, null);
});

test('WEBSITE_CONVERSIONS sends pixel_id and custom_event_type only', () => {
  const promoted = buildPromotedObject({
    campaignObjective: 'OUTCOME_SALES',
    optimizationGoal: 'WEBSITE_CONVERSIONS',
    creativeSource: 'listing',
    catalogId,
    pixelId,
    customEventType: 'PURCHASE',
  });
  assert.deepEqual(promoted, {
    pixel_id: pixelId,
    custom_event_type: 'PURCHASE',
  });
  assert.ok(!('catalog_id' in (promoted ?? {})));
});

test('remarketing OFFSITE_CONVERSIONS uses pixel without catalog', () => {
  const promoted = buildPromotedObject({
    campaignObjective: 'OUTCOME_SALES',
    optimizationGoal: 'OFFSITE_CONVERSIONS',
    creativeSource: 'listing',
    pixelId,
    customEventType: 'VIEW_CONTENT',
  });
  assert.deepEqual(promoted, {
    pixel_id: pixelId,
    custom_event_type: 'VIEW_CONTENT',
  });
});
