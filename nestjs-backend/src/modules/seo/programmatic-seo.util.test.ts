import test from 'node:test';
import assert from 'node:assert/strict';
import { findCzGeoLocation } from './cz-geo-locations.data';
import { getProgrammaticSeoIntent } from './programmatic-seo-intents';
import {
  buildProgrammaticSeoCopy,
  buildProgrammaticSeoPath,
} from './programmatic-seo.util';

test('buildProgrammaticSeoPath builds clean URL path', () => {
  assert.equal(buildProgrammaticSeoPath('prodej-domu', 'pardubice'), '/prodej-domu/pardubice');
});

test('buildProgrammaticSeoCopy generates unique title and h1 for Pardubice houses', () => {
  const intent = getProgrammaticSeoIntent('prodej-domu')!;
  const loc = findCzGeoLocation('pardubice')!;
  const copy = buildProgrammaticSeoCopy(intent, loc);

  assert.equal(copy.h1, 'Prodej domů Pardubice');
  assert.ok(copy.title.includes('Prodej domů Pardubice'));
  assert.ok(copy.title.includes('XXREALIT'));
  assert.ok(copy.description.includes('Pardubicích'));
  assert.ok(copy.faq.length >= 3);
});

test('buildProgrammaticSeoCopy generates different body for Brno apartments', () => {
  const intent = getProgrammaticSeoIntent('prodej-bytu')!;
  const pardubice = findCzGeoLocation('pardubice')!;
  const brno = findCzGeoLocation('brno')!;
  const a = buildProgrammaticSeoCopy(intent, pardubice);
  const b = buildProgrammaticSeoCopy(intent, brno);

  assert.notEqual(a.bodyText, b.bodyText);
  assert.equal(a.h1, 'Prodej bytů Pardubice');
  assert.equal(b.h1, 'Prodej bytů Brno');
});

test('buildProgrammaticSeoCopy generates rich content with 1200+ words and 12+ FAQ', () => {
  const intent = getProgrammaticSeoIntent('prodej-domu')!;
  const loc = findCzGeoLocation('pardubice')!;
  const copy = buildProgrammaticSeoCopy(intent, loc);

  assert.ok(copy.wordCount >= 1200, `wordCount ${copy.wordCount}`);
  assert.ok(copy.faq.length >= 12);
  assert.ok(copy.sections.length >= 4);
  assert.ok(copy.heroSubtitle.length > 20);
  assert.ok(copy.heroImageUrl.startsWith('https://'));
});
