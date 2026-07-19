import { describe, expect, it } from 'vitest';
import {
  buildClonedPayloadFromAdsManager,
  compareMetaAdsManagerLayers,
  deepCompareMetaPayloads,
  normalizeXxrealitLayerPayloads,
} from './meta-ads-manager-compare.util';

describe('meta-ads-manager-compare.util', () => {
  it('detects match, different and missing fields', () => {
    const diff = deepCompareMetaPayloads(
      { name: 'Test', objective: 'OUTCOME_TRAFFIC', daily_budget: 10000 },
      { name: 'Test', objective: 'OUTCOME_SALES', billing_event: 'IMPRESSIONS' },
    );
    expect(diff.find((d) => d.path === 'name')?.status).toBe('match');
    expect(diff.find((d) => d.path === 'objective')?.status).toBe('different');
    expect(diff.find((d) => d.path === 'daily_budget')?.status).toBe('missing');
    expect(diff.find((d) => d.path === 'billing_event')?.missingSide).toBe('xxrealit');
  });

  it('strips XXREALIT custom keys in safe mode', () => {
    const normalized = normalizeXxrealitLayerPayloads(
      {
        campaign: { name: 'K', objective: 'OUTCOME_TRAFFIC', id: '123' },
        housingGeoDebug: { foo: 1 },
        adSet: { optimization_goal: 'LINK_CLICKS', targeting: { geo_locations: { cities: [] } } },
        targeting: { geo_locations: { cities: [{ key: 'x' }] } },
      },
      true,
    );
    expect(normalized.campaign?.name).toBe('K');
    expect(normalized.campaign).not.toHaveProperty('id');
    expect(normalized.adSet?.targeting).toBeDefined();
  });

  it('builds cloned payload from ads manager layers', () => {
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
    expect(cloned.campaign).toMatchObject({ name: 'C', objective: 'OUTCOME_TRAFFIC' });
    expect(cloned.adSet).not.toHaveProperty('id');
    expect(cloned.launchPhase).toBe('cloned_from_ads_manager');
  });

  it('summarizes layer comparison', () => {
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
    expect(layers).toHaveLength(4);
    expect(layers[0].matchCount).toBeGreaterThan(0);
    expect(layers[1].differentCount).toBeGreaterThan(0);
    expect(layers[2].missingCount).toBeGreaterThan(0);
  });
});
