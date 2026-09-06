import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getScriptProviderReadiness } from '../ai-influencer/ai-influencer-script-provider.util';

describe('getScriptProviderReadiness aligned with OpenAiService.assertCanRun', () => {
  it('fails when provider disabled but API key exists (configured=true, enabled=false)', () => {
    const r = getScriptProviderReadiness({ enabled: false, configured: true, connected: null });
    assert.equal(r.ready, false);
    assert.equal(r.code, 'AI_PROVIDER_DISABLED');
    assert.match(r.message, /není povoleno/i);
  });

  it('passes when enabled and configured without prior connection test', () => {
    const r = getScriptProviderReadiness({ enabled: true, configured: true, connected: null });
    assert.equal(r.ready, true);
    assert.equal(r.label, 'CONFIGURED');
  });
});
