import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  dedupeSrealityImageUrls,
  imageDedupeKey,
  normalizeSrealityImageUrl,
  upgradeSrealityImageQuality,
  buildSrealityImageFetchCandidates,
} from './sreality-image.util';

describe('sreality-image.util', () => {
  it('normalizes protocol-relative URL', () => {
    const url = normalizeSrealityImageUrl('//img.sreality.cz/normal/abc.jpg');
    assert.match(url ?? '', /^https:\/\/img\.sreality\.cz\/full\//);
  });

  it('upgrades thumbnail path to full quality', () => {
    const url = upgradeSrealityImageQuality('https://img.sreality.cz/normal/abc.jpg');
    assert.match(url, /\/full\/abc\.jpg$/);
  });

  it('does not double full segment on full/normal paths', () => {
    const url = upgradeSrealityImageQuality('https://img.sreality.cz/full/normal/abc.jpg');
    assert.doesNotMatch(url, /\/full\/full\//);
    assert.match(url, /\/full\/abc\.jpg$/);
  });

  it('builds fetch candidates with normal fallback', () => {
    const candidates = buildSrealityImageFetchCandidates(
      'https://img.sreality.cz/full/normal/a.jpg',
    );
    assert.ok(candidates.length >= 2);
    assert.ok(candidates.some((u) => u.includes('/normal/')));
  });

  it('dedupes equivalent gallery URLs', () => {
    const urls = dedupeSrealityImageUrls([
      'https://img.sreality.cz/full/normal/a.jpg',
      'https://img.sreality.cz/normal/a.jpg',
    ]);
    assert.equal(urls.length, 1);
  });

  it('imageDedupeKey ignores full vs normal segment', () => {
    const a = imageDedupeKey('https://img.sreality.cz/full/normal/a.jpg');
    const b = imageDedupeKey('https://img.sreality.cz/normal/a.jpg');
    assert.equal(a, b);
  });
});
