import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isVideoAgentExternalJobId,
  parseVideoAgentSessionId,
  resolveVideoGenerationMode,
  toVideoAgentExternalJobId,
} from './ai-influencer-video-agent.util';
import { DEFAULT_AI_INFLUENCER_SETTINGS } from './ai-influencer.types';

describe('ai-influencer-video-agent.util', () => {
  it('defaults to VIDEO_AGENT mode', () => {
    assert.equal(resolveVideoGenerationMode(DEFAULT_AI_INFLUENCER_SETTINGS), 'VIDEO_AGENT');
  });

  it('maps external job id prefix', () => {
    const session = 'sess-abc';
    const external = toVideoAgentExternalJobId(session);
    assert.ok(isVideoAgentExternalJobId(external));
    assert.equal(parseVideoAgentSessionId(external), session);
  });
});
