import type { AiInfluencerAutomationSettings, AiInfluencerVideoGenerationMode } from './ai-influencer.types';
import { resolveVideoGenerationMode } from './ai-influencer-video-agent.util';

export type ProductionReadinessInput = {
  settings: Pick<AiInfluencerAutomationSettings, 'videoGenerationMode' | 'allowVideoAgentFallback'>;
  storageConfigured: boolean;
  heygenReady: boolean;
  videoAgentAvailable: boolean;
  elevenReady: boolean;
  elevenTtsReady: boolean;
};

export type ProductionReadinessResult = {
  ready: boolean;
  reasons: string[];
  mode: AiInfluencerVideoGenerationMode;
  elevenRequired: boolean;
  aiRequiredForNewScripts: boolean;
};

/** Jednotná production readiness logika pro admin karty i worker diagnostiku. */
export function computeProductionReadiness(
  input: ProductionReadinessInput,
): ProductionReadinessResult {
  const mode = resolveVideoGenerationMode(input.settings);
  const reasons: string[] = [];

  if (!input.storageConfigured) {
    reasons.push('Chybí Cloudinary storage');
  }

  const elevenRequired =
    mode === 'AVATAR' || (mode === 'VIDEO_AGENT' && input.settings.allowVideoAgentFallback);

  if (mode === 'VIDEO_AGENT') {
    if (!input.heygenReady) {
      reasons.push('HeyGen není připraven (Video Agent vyžaduje avatar ID)');
    }
    if (!input.videoAgentAvailable) {
      reasons.push('HeyGen Video Agent není dostupný');
    }
  } else {
    if (!input.heygenReady) {
      reasons.push('HeyGen není připraven');
    }
  }

  if (elevenRequired) {
    if (!input.elevenReady) {
      reasons.push('ElevenLabs není připraven');
    } else if (!input.elevenTtsReady) {
      reasons.push('ElevenLabs TTS není dostupné');
    }
  }

  return {
    ready: reasons.length === 0,
    reasons,
    mode,
    elevenRequired,
    aiRequiredForNewScripts: true,
  };
}
