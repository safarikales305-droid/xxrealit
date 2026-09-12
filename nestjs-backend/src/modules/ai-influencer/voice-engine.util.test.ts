import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_AI_INFLUENCER_SETTINGS } from './ai-influencer.types';
import {
  isElevenLabsRequiredForJob,
  isElevenLabsRequiredForProduction,
  resolveVoiceEngine,
  shouldSkipVoicePhaseForVideoAgent,
} from './voice-engine.util';

describe('voice-engine.util', () => {
  it('TEST A: VIDEO_AGENT + HEYGEN voice does not require ElevenLabs when key missing', () => {
    const settings = {
      ...DEFAULT_AI_INFLUENCER_SETTINGS,
      videoGenerationMode: 'VIDEO_AGENT' as const,
      allowVideoAgentFallback: false,
    };
    const meta = {
      generationModeUsed: 'VIDEO_AGENT' as const,
      voiceEngine: 'HEYGEN' as const,
    };
    assert.equal(isElevenLabsRequiredForProduction(settings), false);
    assert.equal(isElevenLabsRequiredForJob(meta, settings), false);
    assert.equal(shouldSkipVoicePhaseForVideoAgent(meta, settings), true);
    assert.equal(resolveVoiceEngine(meta, settings), 'HEYGEN');
  });

  it('TEST B: VIDEO_AGENT + explicit ELEVENLABS voice requires ElevenLabs', () => {
    const settings = {
      ...DEFAULT_AI_INFLUENCER_SETTINGS,
      videoGenerationMode: 'VIDEO_AGENT' as const,
      allowVideoAgentFallback: false,
    };
    const meta = {
      generationModeUsed: 'VIDEO_AGENT' as const,
      voiceEngine: 'ELEVENLABS' as const,
    };
    assert.equal(isElevenLabsRequiredForJob(meta, settings), true);
    assert.equal(shouldSkipVoicePhaseForVideoAgent(meta, settings), false);
  });

  it('TEST C: AVATAR mode always requires ElevenLabs', () => {
    const settings = {
      ...DEFAULT_AI_INFLUENCER_SETTINGS,
      videoGenerationMode: 'AVATAR' as const,
    };
    const meta = { generationModeUsed: 'AVATAR' as const };
    assert.equal(isElevenLabsRequiredForJob(meta, settings), true);
    assert.equal(isElevenLabsRequiredForProduction(settings), true);
  });

  it('defaults VIDEO_AGENT jobs to HEYGEN voice when voiceEngine unset', () => {
    const settings = {
      ...DEFAULT_AI_INFLUENCER_SETTINGS,
      videoGenerationMode: 'VIDEO_AGENT' as const,
    };
    assert.equal(resolveVoiceEngine({ generationModeUsed: 'VIDEO_AGENT' }, settings), 'HEYGEN');
  });
});
