import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AiInfluencerReelJobStatus } from '@prisma/client';
import { resumeJobStatus, resolveFailedStage } from './ai-influencer-retry.util';

describe('resolveFailedStage', () => {
  it('legacy RENDER + ElevenLabs message maps to VOICE', () => {
    assert.equal(
      resolveFailedStage('RENDER', 'ElevenLabs API key není nakonfigurován.', null),
      'VOICE',
    );
  });

  it('ELEVENLABS error code maps to VOICE', () => {
    assert.equal(resolveFailedStage('RENDER', 'selhalo', 'ELEVENLABS_NOT_CONFIGURED'), 'VOICE');
  });
});

describe('resumeJobStatus', () => {
  it('retry od avataru bez externího jobu pokračuje od VOICE_READY', () => {
    const next = resumeJobStatus(AiInfluencerReelJobStatus.FAILED, 'AVATAR', {
      spokenText: 'text',
      voiceStorageUrl: 'https://cdn/voice.mp3',
    });
    assert.equal(next, AiInfluencerReelJobStatus.VOICE_READY);
  });

  it('retry od avataru s externím jobem pokračuje od AVATAR_GENERATING', () => {
    const next = resumeJobStatus(AiInfluencerReelJobStatus.FAILED, 'AVATAR', {
      avatarExternalJobId: 'hg-123',
      voiceStorageUrl: 'https://cdn/voice.mp3',
    });
    assert.equal(next, AiInfluencerReelJobStatus.AVATAR_GENERATING);
  });

  it('retry od renderu pokračuje od AVATAR_READY', () => {
    const next = resumeJobStatus(AiInfluencerReelJobStatus.FAILED, 'RENDER', {
      avatarStorageUrl: 'https://cdn/avatar.mp4',
      voiceStorageUrl: 'https://cdn/voice.mp3',
    });
    assert.equal(next, AiInfluencerReelJobStatus.AVATAR_READY);
  });

  it('legacy ElevenLabs failure at RENDER resumes at VOICE_GENERATING', () => {
    const next = resumeJobStatus(
      AiInfluencerReelJobStatus.FAILED,
      'RENDER',
      { spokenText: 'text' },
      'ElevenLabs API key není nakonfigurován.',
      'ELEVENLABS_NOT_CONFIGURED',
    );
    assert.equal(next, AiInfluencerReelJobStatus.VOICE_GENERATING);
  });

  it('retry od brandingu pokračuje od AVATAR_READY', () => {
    const next = resumeJobStatus(AiInfluencerReelJobStatus.FAILED, 'BRANDING_RENDER', {
      avatarStorageUrl: 'https://cdn/avatar.mp4',
    });
    assert.equal(next, AiInfluencerReelJobStatus.AVATAR_READY);
  });

  it('failed s existujícím avatarem pokračuje od AVATAR_READY', () => {
    const next = resumeJobStatus(AiInfluencerReelJobStatus.FAILED, null, {
      spokenText: 't',
      voiceStorageUrl: 'v',
      avatarStorageUrl: 'a',
    });
    assert.equal(next, AiInfluencerReelJobStatus.AVATAR_READY);
  });
});
