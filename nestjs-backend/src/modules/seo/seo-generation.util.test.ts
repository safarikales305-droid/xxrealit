import test from 'node:test';
import assert from 'node:assert/strict';
import { findCzGeoLocation } from './cz-geo-locations.data';
import { getProgrammaticSeoIntent } from './programmatic-seo-intents';
import { buildProgrammaticSeoCopy } from './programmatic-seo.util';
import { buildProgrammaticSeoPageKey } from './seo-location.util';
import {
  clampBatchSize,
  computeContentChecksum,
  cursorToPair,
  getLocationQualityTier,
  intentToOfferProperty,
  resolveIndexability,
  shouldFilterByQualityTier,
} from './seo-generation.util';
import { incrementSkipReason } from './seo-skip-reasons';
import { SeoContentStatus } from '@prisma/client';

test('clampBatchSize keeps batch between 50 and 200', () => {
  assert.equal(clampBatchSize(), 100);
  assert.equal(clampBatchSize(10), 50);
  assert.equal(clampBatchSize(500), 200);
  assert.equal(clampBatchSize(120), 120);
});

test('computeContentChecksum is stable for same input', () => {
  const a = computeContentChecksum({
    pageKey: 'prodej-bytu:praha',
    title: 'Title',
    description: 'Desc',
    h1: 'H1',
    bodyText: 'Body',
  });
  const b = computeContentChecksum({
    pageKey: 'prodej-bytu:praha',
    title: 'Title',
    description: 'Desc',
    h1: 'H1',
    bodyText: 'Body',
  });
  assert.equal(a, b);
  assert.equal(a.length, 16);
});

test('cursorToPair maps linear cursor to location/intent', () => {
  const intents = ['prodej-bytu', 'prodej-domu'] as const;
  assert.deepEqual(cursorToPair(0, [...intents]), { locationOffset: 0, intentIndex: 0 });
  assert.deepEqual(cursorToPair(1, [...intents]), { locationOffset: 0, intentIndex: 1 });
  assert.deepEqual(cursorToPair(2, [...intents]), { locationOffset: 1, intentIndex: 0 });
});

test('getLocationQualityTier classifies cities as HIGH', () => {
  assert.equal(getLocationQualityTier({ kind: 'MESTO', population: 100 }), 'HIGH');
  assert.equal(getLocationQualityTier({ kind: 'OBEC', population: 6000 }), 'HIGH');
});

test('LOW tier with quality content can be indexable via score', () => {
  const r = resolveIndexability(
    'LOW',
    {
      title: 'Prodej bytů Malá obec | XXREALIT',
      description:
        'Kompletní průvodce prodejem bytů v malé obci. Trh, ceny, tipy a aktuální nabídky s fotografiemi a videem na XXREALIT.',
      bodyText: `${'Kvalitní obsah. '.repeat(80)}`,
      h1: 'Prodej bytů Malá obec',
      faq: [
        { question: 'Q1', answer: 'A1' },
        { question: 'Q2', answer: 'A2' },
        { question: 'Q3', answer: 'A3' },
      ],
      internalLinks: [{ label: 'A', path: '/a' }, { label: 'B', path: '/b' }],
      relatedLocations: [{ slug: 'okoli', name: 'Okolí' }],
    },
    {
      publicPath: '/prodej-bytu/mala-obec',
      canonical: 'https://www.xxrealit.cz/prodej-bytu/mala-obec',
      status: SeoContentStatus.PUBLISHED,
      hasLocalityData: true,
      minScore: 70,
      reviewScore: 50,
    },
  );
  assert.equal(r.indexable, true);
  assert.equal(r.noindex, false);
  assert.equal(r.robots, 'index,follow');
});

test('buildProgrammaticSeoPageKey is unique per intent and location', () => {
  assert.equal(buildProgrammaticSeoPageKey('prodej-bytu', 'praha'), 'prodej-bytu:praha');
  assert.notEqual(
    buildProgrammaticSeoPageKey('prodej-bytu', 'praha'),
    buildProgrammaticSeoPageKey('prodej-domu', 'praha'),
  );
});

test('meta description length is within recommended range', () => {
  const intent = getProgrammaticSeoIntent('prodej-bytu')!;
  const loc = findCzGeoLocation('praha')!;
  const copy = buildProgrammaticSeoCopy(intent, loc);
  assert.ok(copy.description.length >= 80);
  assert.ok(copy.description.length <= 200);
});

test('HIGH tier published page is indexable when content is complete', () => {
  const intent = getProgrammaticSeoIntent('prodej-bytu')!;
  const loc = findCzGeoLocation('pardubice')!;
  const copy = buildProgrammaticSeoCopy(intent, loc);
  const r = resolveIndexability('HIGH', copy, {
    publicPath: copy.path,
    canonical: `https://www.xxrealit.cz${copy.path}`,
    status: SeoContentStatus.PUBLISHED,
    h1: copy.h1,
    faq: copy.faq,
    internalLinks: [{ label: 'A', path: '/a' }, { label: 'B', path: '/b' }],
    relatedLocations: [{ slug: 'chrudim', name: 'Chrudim' }],
    hasLocalityData: true,
    minScore: 70,
    reviewScore: 50,
  });
  assert.equal(r.indexable, true);
  assert.equal(r.noindex, false);
  assert.equal(r.robots, 'index,follow');
});

test('shouldFilterByQualityTier skips only when tiers explicitly set', () => {
  assert.equal(shouldFilterByQualityTier('LOW', undefined), false);
  assert.equal(shouldFilterByQualityTier('LOW', []), false);
  assert.equal(shouldFilterByQualityTier('LOW', ['HIGH', 'MEDIUM']), true);
  assert.equal(shouldFilterByQualityTier('HIGH', ['HIGH', 'MEDIUM']), false);
});

test('intentToOfferProperty maps prodej-bytu', () => {
  assert.deepEqual(intentToOfferProperty('prodej-bytu'), { offerType: 'PRODEJ', propertyType: 'BYT' });
  assert.deepEqual(intentToOfferProperty('pronajem-bytu'), { offerType: 'PRONAJEM', propertyType: 'BYT' });
});

test('incrementSkipReason counts skip reasons', () => {
  const next = incrementSkipReason({ ALREADY_EXISTS: 2 }, 'ALREADY_EXISTS');
  assert.equal(next.ALREADY_EXISTS, 3);
  const added = incrementSkipReason({}, 'MISSING_LOCALITY');
  assert.equal(added.MISSING_LOCALITY, 1);
});
