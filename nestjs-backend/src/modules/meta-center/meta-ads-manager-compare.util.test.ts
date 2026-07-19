import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildClonedPayloadFromAdsManager,
  compareMetaAdsManagerLayers,
  deepCompareMetaPayloads,
  normalizeXxrealitLayerPayloads,
} from './meta-ads-manager-compare.util';

test('deepCompareMetaPayloads detects match, different and missing fields', () => {
  const diff = deepCompareMetaPayloads(
    { name: 'Test', objective: 'OUTCOME_TRAFFIC', daily_budget: 10000 },
    { name: 'Test', objective: 'OUTCOME_SALES', billing_event: 'IMPRESSIONS' },
  );
  assert.equal(diff.find((d) => d.path === 'name')?.status, 'match');
  assert.equal(diff.find((d) => d.path === 'objective')?.status, 'different');
  assert.equal(diff.find((d) => d.path === 'daily_budget')?.status, 'missing');
  assert.equal(diff.find((d) => d.path === 'billing_event')?.missingSide, 'xxrealit');
});

test('normalizeXxrealitLayerPayloads strips XXREALIT custom keys in safe mode', () => {
  const normalized = normalizeXxrealitLayerPayloads(
    {
      campaign: { name: 'K', objective: 'OUTCOME_TRAFFIC', id: '123' },
      housingGeoDebug: { foo: 1 },
      adSet: { optimization_goal: 'LINK_CLICKS', targeting: { geo_locations: { cities: [] } } },
      targeting: { geo_locations: { cities: [{ key: 'x' }] } },
    },
    true,
  );
  assert.equal(normalized.campaign?.name, 'K');
  assert.equal('id' in (normalized.campaign ?? {}), false);
  assert.ok(normalized.adSet?.targeting);
});

test('buildClonedPayloadFromAdsManager builds cloned payload', () => {
  const cloned = buildClonedPayloadFromAdsManager({
    safeMode: true,
    campaign: { name: 'C', objective: 'OUTCOME_TRAFFIC', id: '1' },
    adSet: {
      name: 'AS',
      optimization_goal: 'LINK_CLICKS',
      targeting: { geo_locations: { countries: ['CZ'] } },
      id: '2',
    },
    creative: { name: 'CR', product_set_id: 'ps1', id: '3' },
    ad: { name: 'AD', status: 'PAUSED', creative: { creative_id: '3' }, id: '4' },
  });
  assert.deepEqual(cloned.campaign, { name: 'C', objective: 'OUTCOME_TRAFFIC' });
  assert.equal('id' in (cloned.adSet as object), false);
  assert.equal(cloned.launchPhase, 'cloned_from_ads_manager');
});

test('compareMetaAdsManagerLayers summarizes layer comparison', () => {
  const layers = compareMetaAdsManagerLayers({
    xxrealit: {
      campaign: { name: 'A' },
      adSet: { optimization_goal: 'X' },
      creative: null,
      ad: null,
    },
    adsManager: {
      campaign: { name: 'A' },
      adSet: { optimization_goal: 'Y' },
      creative: { name: 'C' },
      ad: null,
    },
  });
  assert.equal(layers.length, 4);
  assert.ok(layers[0].matchCount > 0);
  assert.ok(layers[1].differentCount > 0);
  assert.ok(layers[2].missingCount > 0);
});
