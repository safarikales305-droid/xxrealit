import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  resolveVideoAgentCanonicalReady,
} from './ai-influencer-provider-readiness.util';

describe('ai-influencer-provider-readiness', () => {
  it('requires HEYGEN_API_KEY for Video Agent readiness', () => {
    const result = resolveVideoAgentCanonicalReady({
      videoAgentAvailable: true,
      heygenApiKeyPresence: 'MISSING',
      heygenGenerationReady: true,
    });
    assert.equal(result.ready, false);
    assert.match(result.message ?? '', /HEYGEN_API_KEY/i);
  });

  it('requires Video Agent availability when HeyGen key is configured', () => {
    const result = resolveVideoAgentCanonicalReady({
      videoAgentAvailable: false,
      heygenApiKeyPresence: 'CONFIGURED',
      heygenGenerationReady: true,
    });
    assert.equal(result.ready, false);
    assert.match(result.message ?? '', /Video Agent/i);
  });

  it('is ready when key, agent and avatar are ready', () => {
    const result = resolveVideoAgentCanonicalReady({
      videoAgentAvailable: true,
      heygenApiKeyPresence: 'CONFIGURED',
      heygenGenerationReady: true,
    });
    assert.equal(result.ready, true);
    assert.equal(result.message, null);
  });
});
