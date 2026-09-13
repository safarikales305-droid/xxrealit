import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  hasPersistedVideoAgentProviderId,
  isVideoAgentSubmitStale,
  shouldBlockVideoAgentResubmit,
  shouldResumeVideoAgentPolling,
  VIDEO_AGENT_SUBMIT_STALE_MS,
} from './ai-influencer-video-agent-persist.util';

describe('ai-influencer-video-agent-persist', () => {
  it('detects persisted provider id from meta', () => {
    assert.equal(
      hasPersistedVideoAgentProviderId({ providerJobId: 'sess-123' }),
      true,
    );
    assert.equal(hasPersistedVideoAgentProviderId({}), false);
    assert.equal(
      hasPersistedVideoAgentProviderId({}, 'va:sess-abc'),
      true,
    );
  });

  it('blocks resubmit while submit is in flight and not stale', () => {
    const meta = {
      videoAgentSubmitInFlight: true,
      videoAgentSubmitStartedAt: new Date().toISOString(),
    };
    assert.equal(shouldBlockVideoAgentResubmit(meta), true);
  });

  it('allows recovery polling when provider id exists', () => {
    const meta = { providerJobId: 'sess-1', videoAgentSubmittedAt: new Date().toISOString() };
    assert.equal(shouldResumeVideoAgentPolling(meta), true);
    assert.equal(shouldBlockVideoAgentResubmit(meta), true);
  });

  it('marks stale in-flight submit without provider id', () => {
    const meta = {
      videoAgentSubmitInFlight: true,
      videoAgentSubmitStartedAt: new Date(Date.now() - VIDEO_AGENT_SUBMIT_STALE_MS - 1).toISOString(),
    };
    assert.equal(isVideoAgentSubmitStale(meta), true);
    assert.equal(shouldBlockVideoAgentResubmit(meta), false);
  });
});
