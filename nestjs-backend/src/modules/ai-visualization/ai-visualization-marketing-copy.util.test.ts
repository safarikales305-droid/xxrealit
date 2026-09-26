import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFacebookReelCaption,
  resolveCopyVariant,
  type MarketingReelContext,
} from './ai-visualization-marketing-copy.util';

describe('ai-visualization-marketing-copy', () => {
  const base: MarketingReelContext = {
    hasEstimate: false,
    estimateMin: null,
    estimateMax: null,
    contractorCount: 0,
    showEstimate: true,
    showContractors: true,
    ctaUrl: 'https://www.xxrealit.cz/ai-vizualizace?utm_content=test',
  };

  it('uses variant A without estimate or contractors', () => {
    assert.equal(resolveCopyVariant(base), 'A');
    const caption = buildFacebookReelCaption(base);
    assert.match(caption, /AI proměna/);
    assert.doesNotMatch(caption, /oslovil \d+ stavebních/);
  });

  it('uses variant C with contractor count in caption', () => {
    const ctx = { ...base, contractorCount: 7, hasEstimate: true, estimateMin: 1, estimateMax: 2 };
    assert.equal(resolveCopyVariant(ctx), 'C');
    const caption = buildFacebookReelCaption(ctx);
    assert.match(caption, /7 stavebních firem/);
  });
});
