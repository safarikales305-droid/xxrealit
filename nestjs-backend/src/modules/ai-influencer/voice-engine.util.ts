import type {
  AiInfluencerAutomationSettings,
  AiInfluencerJobRenderMeta,
  AiInfluencerVoiceEngine,
} from './ai-influencer.types';
import {
  getJobSnapshotGenerationMode,
  isAvatarFallbackAllowed,
  resolveVideoGenerationMode,
} from './ai-influencer-video-agent.util';

/** Explicitní voice engine pro job — default VIDEO_AGENT → HEYGEN. */
export function resolveVoiceEngine(
  meta: AiInfluencerJobRenderMeta,
  settings: Pick<AiInfluencerAutomationSettings, 'videoGenerationMode'>,
): AiInfluencerVoiceEngine {
  if (meta.voiceEngine === 'HEYGEN' || meta.voiceEngine === 'ELEVENLABS') {
    return meta.voiceEngine;
  }
  const mode = getJobSnapshotGenerationMode(meta, settings);
  return mode === 'VIDEO_AGENT' ? 'HEYGEN' : 'ELEVENLABS';
}

/** Vyžaduje job v aktuální fázi ElevenLabs TTS? */
export function isElevenLabsRequiredForJob(
  meta: AiInfluencerJobRenderMeta,
  settings: Pick<AiInfluencerAutomationSettings, 'videoGenerationMode' | 'allowVideoAgentFallback'>,
): boolean {
  if (meta.usedVideoAgentFallback && isAvatarFallbackAllowed(meta, settings)) {
    return true;
  }
  if (resolveVoiceEngine(meta, settings) === 'ELEVENLABS') {
    return true;
  }
  return getJobSnapshotGenerationMode(meta, settings) === 'AVATAR';
}

/** Preflight / worker — ElevenLabs mandatory pro novou produkci? */
export function isElevenLabsRequiredForProduction(
  settings: Pick<AiInfluencerAutomationSettings, 'videoGenerationMode' | 'allowVideoAgentFallback'>,
): boolean {
  const mode = resolveVideoGenerationMode(settings);
  return mode === 'AVATAR' || (mode === 'VIDEO_AGENT' && settings.allowVideoAgentFallback === true);
}

export function shouldSkipVoicePhaseForVideoAgent(
  meta: AiInfluencerJobRenderMeta,
  settings: Pick<AiInfluencerAutomationSettings, 'videoGenerationMode' | 'allowVideoAgentFallback'>,
): boolean {
  return (
    getJobSnapshotGenerationMode(meta, settings) === 'VIDEO_AGENT' &&
    resolveVoiceEngine(meta, settings) === 'HEYGEN' &&
    !meta.usedVideoAgentFallback
  );
}

export function buildActivePipelineSteps(input: {
  mode: 'VIDEO_AGENT' | 'AVATAR';
  voiceEngine: AiInfluencerVoiceEngine;
  elevenRequired: boolean;
}): string[] {
  if (input.mode === 'VIDEO_AGENT' && input.voiceEngine === 'HEYGEN' && !input.elevenRequired) {
    return ['OpenAI', 'HeyGen Video Agent', 'HeyGen voice', 'Download', 'Renderer', 'Storage', 'Galerie'];
  }
  if (input.mode === 'VIDEO_AGENT' && input.voiceEngine === 'ELEVENLABS') {
    return ['OpenAI', 'ElevenLabs', 'HeyGen Video Agent', 'Download', 'Renderer', 'Storage', 'Galerie'];
  }
  if (input.mode === 'VIDEO_AGENT' && input.elevenRequired) {
    return ['OpenAI', 'ElevenLabs (fallback)', 'HeyGen Video Agent', 'Download', 'Renderer', 'Storage', 'Galerie'];
  }
  return ['OpenAI', 'ElevenLabs', 'Avatar', 'Renderer', 'Storage', 'Galerie'];
}
