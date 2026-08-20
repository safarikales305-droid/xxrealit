import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  newsContentHash,
  newsTitleFingerprint,
  scoreNewsRelevance,
  slugifyNewsTitle,
  titleSimilarity,
  parsePublishTimeSlot,
  runQualityGate,
} from './news-editorial.util';

describe('news editorial util', () => {
  it('creates stable content hash', () => {
    const a = newsContentHash('Ceny bytů rostou', 'https://example.com/a', new Date('2026-08-01'));
    const b = newsContentHash('Ceny bytů rostou', 'https://example.com/a', new Date('2026-08-01'));
    assert.equal(a, b);
    assert.equal(a.length, 32);
  });

  it('creates title fingerprint', () => {
    const fp = newsTitleFingerprint('Hypotéky zdražily v Praze');
    assert.ok(fp.length >= 20);
  });

  it('scores relevant real estate content higher', () => {
    const high = scoreNewsRelevance('Ceny bytů v Praze rostou', 'hypotéky a nájmy');
    const low = scoreNewsRelevance('Fotbalový zápas skončil remízou', 'sport');
    assert.ok(high > low);
    assert.equal(low, 0);
  });

  it('detects similar titles', () => {
    const sim = titleSimilarity(
      'Ceny bytů v Praze rostou',
      'V Praze rostou ceny bytů',
    );
    assert.ok(sim >= 0.8);
  });

  it('slugifies titles', () => {
    const slug = slugifyNewsTitle('České hypotéky: nový vývoj');
    assert.match(slug, /^ceske-hypoteky/);
  });

  it('parses publish time slots', () => {
    assert.deepEqual(parsePublishTimeSlot('09:00'), { hour: 9, minute: 0 });
    assert.equal(parsePublishTimeSlot('25:00'), null);
  });

  it('runs quality gate on complete article', () => {
    const result = runQualityGate({
      title: 'Dostatečně dlouhý titulek článku',
      seoTitle: 'SEO titulek s dostatečnou délkou pro vyhledávače',
      seoDescription:
        'Popisek článku s dostatečnou délkou pro SEO a srozumitelným shrnutím obsahu pro čtenáře portálu XXREALIT.',
      perex:
        'Perex článku popisuje hlavní téma a poskytuje čtenáři rychlý přehled o tom, co se na trhu děje a proč je to důležité.',
      bodyMarkdown: 'x'.repeat(500),
      sourcesFooterHtml: '<ul><li><a href="https://example.com">Zdroj</a></li></ul>',
    });
    assert.ok(result.qualityScore >= 70);
  });
});
