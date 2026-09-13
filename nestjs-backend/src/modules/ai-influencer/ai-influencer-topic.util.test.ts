import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildTopicFingerprint,
  computeTotalTopicScore,
  normalizeTopicUrl,
  sanitizeAbsoluteClaim,
  titleSimilarity,
} from './ai-influencer-topic.util';

describe('ai-influencer-topic.util', () => {
  it('normalizeTopicUrl strips tracking params and trailing slash', () => {
    const normalized = normalizeTopicUrl(
      'https://example.cz/clanek/?utm_source=fb&fbclid=abc/',
    );
    assert.equal(normalized, 'https://example.cz/clanek');
  });

  it('buildTopicFingerprint is stable for same canonical URL', () => {
    const a = buildTopicFingerprint({
      canonicalUrl: 'https://example.cz/nemovitost/1',
      title: 'Titulek A',
    });
    const b = buildTopicFingerprint({
      canonicalUrl: 'https://example.cz/nemovitost/1?utm_source=x',
      title: 'Titulek B',
    });
    assert.equal(a, b);
  });

  it('titleSimilarity detects near-duplicate titles', () => {
    const score = titleSimilarity(
      'Nejdražší vila v Česku právě teď na prodej',
      'Nejdražší vila v Česku právě teď',
    );
    assert.ok(score >= 0.78);
  });

  it('sanitizeAbsoluteClaim softens superlatives at low confidence', () => {
    const safe = sanitizeAbsoluteClaim('Toto je nejdražší dům v České republice.', 50);
    assert.match(safe, /jedna z nejdražších/i);
  });

  it('sanitizeAbsoluteClaim keeps text at high confidence', () => {
    const text = 'Nejdražší nabídka podle zdroje.';
    assert.equal(sanitizeAbsoluteClaim(text, 90), text);
  });

  it('computeTotalTopicScore caps at 100 with trend boost', () => {
    const score = computeTotalTopicScore({
      viralScore: 100,
      relevanceScore: 100,
      freshnessScore: 100,
      confidenceScore: 100,
      videoPotentialScore: 100,
      trendBoost: 8,
    });
    assert.equal(score, 100);
  });
});
