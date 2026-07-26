import test from 'node:test';
import assert from 'node:assert/strict';
import { SeoContentStatus } from '@prisma/client';
import {
  computeIndexability,
  getRobotsMetadata,
  isSelfCanonical,
  normalizeCanonicalUrl,
} from './seo-indexability.util';

test('getRobotsMetadata returns noindex,follow with follow true', () => {
  const r = getRobotsMetadata({ noindex: true });
  assert.equal(r.robots, 'noindex,follow');
  assert.equal(r.follow, true);
  assert.equal(r.index, false);
});

test('getRobotsMetadata returns index,follow for indexable page', () => {
  const r = getRobotsMetadata({ indexable: true, noindex: false });
  assert.equal(r.robots, 'index,follow');
  assert.equal(r.index, true);
});

test('self canonical matches www production URL', () => {
  const path = '/prodej-bytu/pardubice';
  const canonical = normalizeCanonicalUrl(path);
  assert.equal(canonical, 'https://www.xxrealit.cz/prodej-bytu/pardubice');
  assert.equal(isSelfCanonical(canonical, path), true);
});

test('published page with quality content is indexable without listings', () => {
  const body = `${'Kvalitní obsah o lokalitě. '.repeat(40)}`;
  const result = computeIndexability({
    title: 'Prodej bytů Pardubice | XXREALIT',
    description:
      'Kompletní průvodce prodejem bytů v Pardubicích. Trh, ceny, tipy a aktuální nabídky s fotografiemi a videem na XXREALIT.',
    h1: 'Prodej bytů Pardubice',
    bodyText: body,
    faq: [
      { question: 'Q1', answer: 'A1' },
      { question: 'Q2', answer: 'A2' },
      { question: 'Q3', answer: 'A3' },
    ],
    internalLinks: [{ label: 'A', path: '/a' }, { label: 'B', path: '/b' }],
    relatedLocations: [{ slug: 'chrudim', name: 'Chrudim' }],
    canonical: 'https://www.xxrealit.cz/prodej-bytu/pardubice',
    publicPath: '/prodej-bytu/pardubice',
    status: SeoContentStatus.PUBLISHED,
    locationActive: true,
    hasLocalityData: true,
    listingCount: 0,
    minScore: 70,
    reviewScore: 50,
  });
  assert.equal(result.indexable, true);
  assert.equal(result.indexabilityReason, 'INDEXABLE');
  assert.equal(result.robots, 'index,follow');
});

test('thin content stays noindex', () => {
  const result = computeIndexability({
    title: 'Prodej bytů Test | XXREALIT',
    description: 'Krátký popis bez dostatečné délky pro SEO metadata a uživatele na portálu XXREALIT.',
    h1: 'Prodej bytů Test',
    bodyText: 'Krátký text.',
    canonical: 'https://www.xxrealit.cz/prodej-bytu/test',
    publicPath: '/prodej-bytu/test',
    status: SeoContentStatus.PUBLISHED,
    minScore: 70,
    reviewScore: 50,
  });
  assert.equal(result.indexable, false);
  assert.equal(result.indexabilityReason, 'THIN_CONTENT');
});

test('draft page is not indexable', () => {
  const body = `${'Obsah. '.repeat(200)}`;
  const result = computeIndexability({
    title: 'Prodej bytů Pardubice | XXREALIT',
    description:
      'Kompletní průvodce prodejem bytů v Pardubicích. Trh, ceny, tipy a aktuální nabídky s fotografiemi a videem na XXREALIT.',
    h1: 'Prodej bytů Pardubice',
    bodyText: body,
    canonical: 'https://www.xxrealit.cz/prodej-bytu/pardubice',
    publicPath: '/prodej-bytu/pardubice',
    status: SeoContentStatus.DRAFT,
    minScore: 70,
    reviewScore: 50,
  });
  assert.equal(result.indexable, false);
  assert.equal(result.indexabilityReason, 'DRAFT_PAGE');
});
