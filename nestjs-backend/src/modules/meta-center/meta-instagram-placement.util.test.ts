import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCatalogCreativePayload, planMetaLaunchResume } from './meta-catalog-creative.util';
import {
  applyPlacementModeToTargeting,
  creativeHasInstagramIdentity,
  resolvePlacementMode,
  validatePlacementInstagramIdentity,
} from './meta-instagram-placement.util';

const baseTargeting = {
  geo_locations: { cities: [{ key: '777934' }] },
  targeting_automation: { advantage_audience: 1 },
};

test('Instagram ID exists: creative has instagram_user_id and dual publisher platforms', () => {
  const mode = resolvePlacementMode('ig_123');
  const targeting = applyPlacementModeToTargeting(baseTargeting, mode);
  const creative = buildCatalogCreativePayload({
    name: 'Test',
    pageId: 'page_1',
    instagramBusinessId: 'ig_123',
    productSetId: 'ps_1',
    link: 'https://www.xxrealit.cz',
    message: 'msg',
    headline: 'head',
    description: 'desc',
    ctaType: 'LEARN_MORE',
  });
  const spec = JSON.parse(creative.body.object_story_spec) as Record<string, unknown>;
  assert.equal(spec.instagram_user_id, 'ig_123');
  assert.deepEqual(targeting.publisher_platforms, ['facebook', 'instagram']);
  assert.ok(creativeHasInstagramIdentity(creative.body));
});

test('Instagram ID missing: Facebook-only placements and creative without instagram_user_id', () => {
  const mode = resolvePlacementMode(null);
  assert.equal(mode, 'FACEBOOK_ONLY');
  const targeting = applyPlacementModeToTargeting(baseTargeting, mode);
  const creative = buildCatalogCreativePayload({
    name: 'Test',
    pageId: 'page_1',
    productSetId: 'ps_1',
    link: 'https://www.xxrealit.cz',
    message: 'msg',
    headline: 'head',
    description: 'desc',
    ctaType: 'LEARN_MORE',
  });
  const spec = JSON.parse(creative.body.object_story_spec) as Record<string, unknown>;
  assert.equal(spec.instagram_user_id, undefined);
  assert.deepEqual(targeting.publisher_platforms, ['facebook']);
  assert.equal(targeting.instagram_positions, undefined);
  assert.equal(creativeHasInstagramIdentity(creative.body), false);
  validatePlacementInstagramIdentity({ targeting, instagramBusinessId: null });
});

test('validatePlacementInstagramIdentity rejects instagram without business id', () => {
  const targeting = applyPlacementModeToTargeting(
    baseTargeting,
    'FACEBOOK_AND_INSTAGRAM',
  );
  assert.throws(() =>
    validatePlacementInstagramIdentity({ targeting, instagramBusinessId: null }),
  );
});

test('existing Campaign, Ad Set and Creative: resume only creates Ad', () => {
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
