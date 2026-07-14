import test from 'node:test';
import assert from 'node:assert/strict';
import {
  META_CATALOG_CONVERSION_LOCATION,
  buildCatalogAdSet,
  validateUnsupportedDestinationType,
} from './meta-catalog-adset.util';

const dsaLabels = { beneficiary: 'Page', payor: 'Page' };
const targeting = {
  geo_locations: {
    custom_locations: [
      { latitude: 50.0755, longitude: 14.4378, radius: 17, distance_unit: 'kilometer' },
    ],
  },
};

test('buildCatalogAdSet uses WEBSITE conversion model without destination_type', () => {
  const built = buildCatalogAdSet({
    campaignId: 'camp_1',
    adSetName: 'Catalog — sada',
    publishStatus: 'PAUSED',
    dailyBudgetMinor: 50000,
    targeting,
    catalogId: '123456789',
    pixelId: 'pixel_1',
    dsaLabels,
    isAdsetBudgetSharingEnabled: false,
  });

  assert.equal(built.conversionLocation, META_CATALOG_CONVERSION_LOCATION);
  assert.equal(built.payload.optimization_goal, 'OFFSITE_CONVERSIONS');
  assert.equal(built.payload.billing_event, 'IMPRESSIONS');
  assert.equal(built.payload.bid_strategy, 'LOWEST_COST_WITHOUT_CAP');
  assert.equal(built.payload.destination_type, undefined);
  assert.deepEqual(built.promotedObject, {
    pixel_id: 'pixel_1',
    custom_event_type: 'PURCHASE',
    catalog_id: '123456789',
  });
});

test('validateUnsupportedDestinationType rejects SHOP_AUTOMATIC', () => {
  const blockers = validateUnsupportedDestinationType({ destination_type: 'SHOP_AUTOMATIC' });
  assert.equal(blockers.length, 1);
  assert.match(blockers[0].message, /Unsupported Meta field/);
});

test('validateUnsupportedDestinationType allows missing destination_type', () => {
  assert.deepEqual(validateUnsupportedDestinationType({}), []);
});
