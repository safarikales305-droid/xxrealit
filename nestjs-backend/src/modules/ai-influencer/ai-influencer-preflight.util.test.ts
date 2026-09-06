import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeProductionReadiness } from './ai-influencer-preflight.util';

describe('ai-influencer-preflight', () => {
  it('VIDEO_AGENT mode does not require ElevenLabs without fallback', () => {
    const result = computeProductionReadiness({
      settings: { videoGenerationMode: 'VIDEO_AGENT', allowVideoAgentFallback: false },
      storageConfigured: true,
      heygenReady: true,
      videoAgentAvailable: true,
      elevenReady: false,
      elevenTtsReady: false,
    });
    assert.equal(result.ready, true);
    assert.equal(result.elevenRequired, false);
  });

  it('VIDEO_AGENT with fallback requires ElevenLabs', () => {
    const result = computeProductionReadiness({
      settings: { videoGenerationMode: 'VIDEO_AGENT', allowVideoAgentFallback: true },
      storageConfigured: true,
      heygenReady: true,
      videoAgentAvailable: true,
      elevenReady: false,
      elevenTtsReady: false,
    });
    assert.equal(result.ready, false);
    assert.ok(result.reasons.some((r) => /ElevenLabs/i.test(r)));
  });
});
