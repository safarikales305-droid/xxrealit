import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildSeoPageSearchContext, mergeSeoContextIntoCriteria } from './ai-property-finder-seo-context.util';
import { dedupePropertyResults, filterResultsWithRequiredUrl } from './ai-property-finder-dedupe.util';
import { rankPropertyResult } from './ai-property-finder-ranking.util';
import type { PropertySearchResult } from './ai-property-finder.types';

describe('ai-property-finder-seo-context', () => {
  it('builds sale + house context for prodej-domu', () => {
    const ctx = buildSeoPageSearchContext({
      intentSlug: 'prodej-domu',
      locationSlug: 'pardubice',
      locationName: 'Pardubice',
      intentLabel: 'Prodej domů',
      path: '/prodej-domu/pardubice',
    });
    assert.ok(ctx);
    assert.equal(ctx!.transaction, 'sale');
    assert.equal(ctx!.propertyTypeKey, 'dum');
    assert.equal(ctx!.locationName, 'Pardubice');
  });

  it('merges SEO context into parsed criteria', () => {
    const ctx = buildSeoPageSearchContext({
      intentSlug: 'prodej-bytu',
      locationSlug: 'pardubice-viii',
      locationName: 'Pardubice VIII',
      intentLabel: 'Prodej bytů',
      path: '/prodej-bytu/pardubice-viii',
    });
    const merged = mergeSeoContextIntoCriteria(ctx, { priceMax: 5_000_000 });
    assert.equal(merged.propertyTypeKey, 'byt');
    assert.equal(merged.location, 'Pardubice VIII');
    assert.equal(merged.priceMax, 5_000_000);
  });
});

describe('ai-property-finder-dedupe', () => {
  const base = (id: string, url: string, score: number): PropertySearchResult => ({
    id,
    source: 'test',
    sourceType: 'EXTERNAL_SEARCH',
    sourceUrl: url,
    canonicalUrl: url,
    title: 'Test',
    currency: 'CZK',
    imageUsageAllowed: false,
    contactDisplayAllowed: false,
    discoveredAt: new Date().toISOString(),
    isInternal: false,
    isExternal: true,
    matchScore: score,
    matchReasons: [],
  });

  it('dedupes same canonical URL keeping higher score', () => {
    const rows = dedupePropertyResults([
      base('1', 'https://example.cz/a?utm=1', 70),
      base('2', 'https://example.cz/a', 90),
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].matchScore, 90);
  });

  it('requires http URL for external listings', () => {
    const rows = filterResultsWithRequiredUrl([
      base('1', 'not-a-url', 80),
      { ...base('2', 'https://example.cz/o', 80), isInternal: true, isExternal: false, sourceUrl: '/nemovitost/1' },
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].sourceUrl, '/nemovitost/1');
  });
});

describe('ai-property-finder-ranking', () => {
  it('boosts internal listing and price match', () => {
    const { matchScore, matchReasons } = rankPropertyResult(
      {
        id: 'x',
        source: 'XXREALIT',
        sourceType: 'XXREALIT',
        sourceUrl: '/nemovitost/1',
        canonicalUrl: '/nemovitost/1',
        title: 'Dům',
        price: 4_800_000,
        currency: 'CZK',
        location: 'Pardubice',
        imageUsageAllowed: true,
        contactDisplayAllowed: false,
        discoveredAt: new Date().toISOString(),
        isInternal: true,
        isExternal: false,
      },
      { location: 'Pardubice', priceMax: 5_000_000, garden: true },
    );
    assert.ok(matchScore >= 80);
    assert.ok(matchReasons.includes('cena odpovídá'));
  });
});
