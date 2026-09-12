import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  resolveVideoAgentCanonicalReady,
} from './ai-influencer-provider-readiness.util';
import {
  buildWorkerRuntimeDiagnostics,
  getHeyGenRuntimeConfig,
} from './ai-influencer-runtime-config.util';

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

  it('is ready when key and Video Agent are available', () => {
    const result = resolveVideoAgentCanonicalReady({
      videoAgentAvailable: true,
      heygenApiKeyPresence: 'CONFIGURED',
    });
    assert.equal(result.ready, true);
    assert.equal(result.message, null);
  });

  it('preflight and worker share the same HeyGen runtime config source', () => {
    process.env.HEYGEN_API_KEY = 'shared-key';
    const runtime = getHeyGenRuntimeConfig();
    const worker = buildWorkerRuntimeDiagnostics({
      generationMode: 'VIDEO_AGENT',
      elevenRequired: false,
      storageConfigured: true,
    });
    assert.equal(runtime.apiKeyPresence, 'CONFIGURED');
    assert.equal(worker.heygenApiKey, 'CONFIGURED');
  });
});
