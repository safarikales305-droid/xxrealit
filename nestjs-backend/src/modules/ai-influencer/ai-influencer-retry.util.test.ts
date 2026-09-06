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

  it('VIDEO_AGENT error code maps to VIDEO_AGENT stage', () => {
    assert.equal(
      resolveFailedStage('AVATAR', 'Video Agent selhal', 'HEYGEN_VIDEO_AGENT_PROCESSING_FAILED'),
      'VIDEO_AGENT',
    );
  });

  it('RENDER_INPUT_MISSING for missing Video Agent master maps to VIDEO_AGENT', () => {
    assert.equal(
      resolveFailedStage('RENDER', 'Video Agent master video chybí pro render.', 'RENDER_INPUT_MISSING'),
      'VIDEO_AGENT',
    );
  });

  it('OpenAI disabled at evaluation maps to SCRIPT, not RENDER', () => {
    assert.equal(
      resolveFailedStage('RENDER', 'OpenAI je vypnuto v nastavení.', 'AI_PROVIDER_DISABLED'),
      'SCRIPT',
    );
    assert.equal(
      resolveFailedStage('RENDER', 'Není dostupný aktivní AI provider.', null),
      'SCRIPT',
    );
  });
});

describe('resumeJobStatus', () => {
  it('VIDEO_AGENT retry resumes at AVATAR_GENERATING when external id exists', () => {
    const next = resumeJobStatus(
      AiInfluencerReelJobStatus.FAILED,
      'VIDEO_AGENT',
      {
        avatarExternalJobId: 'va:session-1',
        generationMode: 'VIDEO_AGENT',
      },
      'Video Agent processing failed',
      'HEYGEN_VIDEO_AGENT_PROCESSING_FAILED',
    );
    assert.equal(next, AiInfluencerReelJobStatus.AVATAR_GENERATING);
  });
  it('VIDEO_AGENT render retry without master resumes at SCRIPT_READY', () => {
    const next = resumeJobStatus(
      AiInfluencerReelJobStatus.FAILED,
      'RENDER',
      {
        generationMode: 'VIDEO_AGENT',
        spokenText: 'text',
      },
      'Video Agent master video chybí pro render.',
      'RENDER_INPUT_MISSING',
    );
    assert.equal(next, AiInfluencerReelJobStatus.SCRIPT_READY);
  });

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

  it('legacy ElevenLabs failure at RENDER resumes at VOICE_GENERATING for AVATAR mode', () => {
    const next = resumeJobStatus(
      AiInfluencerReelJobStatus.FAILED,
      'RENDER',
      { spokenText: 'text', generationMode: 'AVATAR' },
      'ElevenLabs API key není nakonfigurován.',
      'ELEVENLABS_NOT_CONFIGURED',
    );
    assert.equal(next, AiInfluencerReelJobStatus.VOICE_GENERATING);
  });

  it('legacy ElevenLabs failure on VIDEO_AGENT job resumes at AVATAR_GENERATING', () => {
    const next = resumeJobStatus(
      AiInfluencerReelJobStatus.FAILED,
      'VOICE',
      { spokenText: 'text', generationMode: 'VIDEO_AGENT' },
      'ElevenLabs API key není nakonfigurován.',
      'ELEVENLABS_NOT_CONFIGURED',
    );
    assert.equal(next, AiInfluencerReelJobStatus.AVATAR_GENERATING);
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
