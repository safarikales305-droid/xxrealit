import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_AD_PLACEMENT_SETTINGS,
  isMetaDeprecatedPlacementGraphError,
  normalizeAdPlacementSettings,
  sanitizeTargetingPlacements,
} from './meta-placements.util';

test('normalizeAdPlacementSettings disables deprecated video_feeds', () => {
  const settings = normalizeAdPlacementSettings({
    facebook: { feed: true, marketplace: true, video_feeds: true },
    instagram: { stream: true, story: true, reels: true },
  });
  assert.equal(settings.facebook.video_feeds, false);
});

test('sanitizeTargetingPlacements removes video_feeds and logs warning', () => {
  const warnings: string[] = [];
  const result = sanitizeTargetingPlacements({
    targeting: {
      publisher_platforms: ['facebook'],
      facebook_positions: ['feed', 'video_feeds', 'marketplace'],
    },
    placementSettings: DEFAULT_AD_PLACEMENT_SETTINGS,
    placementMode: 'FACEBOOK_ONLY',
    onWarning: (message) => warnings.push(message),
  });
  assert.deepEqual(result.targeting.facebook_positions, ['feed', 'marketplace']);
  assert.ok(result.removedPositions.includes('facebook:video_feeds'));
  assert.ok(warnings.some((line) => line.includes('video_feeds')));
});

test('isMetaDeprecatedPlacementGraphError detects subcode 2490562', () => {
  assert.equal(
    isMetaDeprecatedPlacementGraphError({
      errorCode: '100',
      errorSubcode: '2490562',
      message: 'Invalid parameter',
    }),
    true,
  );
});
