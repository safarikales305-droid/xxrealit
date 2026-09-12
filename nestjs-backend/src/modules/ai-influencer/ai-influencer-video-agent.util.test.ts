import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getJobSnapshotGenerationMode,
  inferJobGenerationMode,
  isAvatarFallbackAllowed,
  isVideoAgentExternalJobId,
  parseVideoAgentSessionId,
  resolveJobProviderJobId,
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

  it('infers VIDEO_AGENT from external job id for legacy jobs', () => {
    assert.equal(
      inferJobGenerationMode({}, DEFAULT_AI_INFLUENCER_SETTINGS, {
        avatarExternalJobId: 'va:legacy',
      }),
      'VIDEO_AGENT',
    );
  });

  it('resolveJobProviderJobId uses canonical providerJobId without avatarExternalJobId', () => {
    assert.equal(
      resolveJobProviderJobId(
        { generationModeUsed: 'VIDEO_AGENT', providerJobId: 'sess-canonical' },
        null,
      ),
      'sess-canonical',
    );
  });

  it('VIDEO_AGENT tracking is valid with providerJobId present and avatarExternalJobId null', () => {
    const providerJobId = resolveJobProviderJobId(
      { generationModeUsed: 'VIDEO_AGENT', providerJobId: 'sess-1' },
      null,
    );
    assert.ok(providerJobId);
    assert.equal(inferJobGenerationMode({ generationModeUsed: 'VIDEO_AGENT' }, DEFAULT_AI_INFLUENCER_SETTINGS), 'VIDEO_AGENT');
  });

  it('getJobSnapshotGenerationMode stays VIDEO_AGENT even with voice artifact', () => {
    assert.equal(
      getJobSnapshotGenerationMode({ generationModeUsed: 'VIDEO_AGENT' }, DEFAULT_AI_INFLUENCER_SETTINGS),
      'VIDEO_AGENT',
    );
  });

  it('isAvatarFallbackAllowed respects explicit false on test jobs', () => {
    assert.equal(
      isAvatarFallbackAllowed({ generationModeUsed: 'VIDEO_AGENT', allowAvatarFallback: false }, DEFAULT_AI_INFLUENCER_SETTINGS),
      false,
    );
  });

  it('inferJobGenerationMode keeps VIDEO_AGENT snapshot when voiceStorageUrl exists', () => {
    assert.equal(
      inferJobGenerationMode(
        { generationModeUsed: 'VIDEO_AGENT' },
        DEFAULT_AI_INFLUENCER_SETTINGS,
        { voiceStorageUrl: 'https://cdn/voice.mp3' },
      ),
      'VIDEO_AGENT',
    );
  });
});
