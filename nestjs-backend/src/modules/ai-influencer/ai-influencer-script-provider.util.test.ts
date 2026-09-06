import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getScriptProviderReadiness } from './ai-influencer-script-provider.util';

describe('getScriptProviderReadiness', () => {
  it('fails when OpenAI is disabled and not configured', () => {
    const r = getScriptProviderReadiness({ enabled: false, configured: false, connected: null });
    assert.equal(r.ready, false);
    assert.equal(r.code, 'SCRIPT_PROVIDER_DISABLED');
  });

  it('allows script generation when enabled and configured even without prior connection test', () => {
    const r = getScriptProviderReadiness({ enabled: true, configured: true, connected: null });
    assert.equal(r.ready, true);
    assert.equal(r.label, 'CONFIGURED');
  });

  it('fails when last connection test failed', () => {
    const r = getScriptProviderReadiness({
      enabled: true,
      configured: true,
      connected: false,
      lastError: '401 invalid key',
    });
    assert.equal(r.ready, false);
  });

  it('passes when connection test succeeded', () => {
    const r = getScriptProviderReadiness({ enabled: true, configured: true, connected: true });
    assert.equal(r.ready, true);
    assert.equal(r.label, 'READY');
  });
});
