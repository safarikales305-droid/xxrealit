/**
 * Jednotné čtení ENV pro AI Influencer pipeline (status + worker).
 * Nikdy nelogovat hodnoty — pouze CONFIGURED / MISSING.
 */

import {
  readRuntimeEnv,
  readRuntimeEnvWithAliases,
} from '../../lib/runtime-env.util';
import { getOpenAiRuntimeConfig } from '../openai/openai-runtime-config.util';
import type { AiInfluencerVideoGenerationMode } from './ai-influencer.types';

export type EnvPresence = 'CONFIGURED' | 'MISSING';

export type HeyGenRuntimeConfig = {
  apiKey: string | undefined;
  avatarId: string | undefined;
  apiKeyPresence: EnvPresence;
};

export type CloudinaryRuntimeConfig = {
  configured: boolean;
  source: 'CLOUDINARY_URL' | 'CLOUDINARY_NAME_KEY_SECRET' | 'none';
  cloudNamePresent: boolean;
  apiKeyPresent: boolean;
  apiSecretPresent: boolean;
};

export type ElevenLabsRuntimeConfig = {
  apiKey: string | undefined;
  voiceId: string | undefined;
  modelId: string;
  apiKeyPresence: EnvPresence;
  voiceIdPresence: EnvPresence;
};

export function getHeyGenRuntimeConfig(): HeyGenRuntimeConfig {
  const apiKey = readRuntimeEnvWithAliases('HEYGEN_API_KEY', ['HEYGEN_KEY', 'HEYGEN_API_TOKEN']);
  const avatarId = readRuntimeEnvWithAliases('HEYGEN_AVATAR_ID', ['HEYGEN_AVATAR']);
  return {
    apiKey,
    avatarId,
    apiKeyPresence: apiKey ? 'CONFIGURED' : 'MISSING',
  };
}

/** Kanonické ENV pro ElevenLabs — aliasy XI_API_KEY / ELEVENLABS_KEY kvůli Railway deployům. */
export function getElevenLabsRuntimeConfig(): ElevenLabsRuntimeConfig {
  const apiKey = readRuntimeEnvWithAliases('ELEVENLABS_API_KEY', [
    'XI_API_KEY',
    'ELEVENLABS_KEY',
    'ELEVEN_LABS_API_KEY',
  ]);
  const voiceId = readRuntimeEnv('ELEVENLABS_VOICE_ID');
  const modelId = readRuntimeEnv('ELEVENLABS_MODEL_ID') ?? 'eleven_multilingual_v2';
  return {
    apiKey,
    voiceId,
    modelId,
    apiKeyPresence: apiKey ? 'CONFIGURED' : 'MISSING',
    voiceIdPresence: voiceId ? 'CONFIGURED' : 'MISSING',
  };
}

export function getCloudinaryRuntimeConfig(): CloudinaryRuntimeConfig {
  const url = readRuntimeEnv('CLOUDINARY_URL');
  if (url?.startsWith('cloudinary://')) {
    return {
      configured: true,
      source: 'CLOUDINARY_URL',
      cloudNamePresent: true,
      apiKeyPresent: true,
      apiSecretPresent: true,
    };
  }

  const cloudName = readRuntimeEnvWithAliases('CLOUDINARY_NAME', ['CLOUDINARY_CLOUD_NAME']);
  const apiKey = readRuntimeEnvWithAliases('CLOUDINARY_KEY', ['CLOUDINARY_API_KEY']);
  const apiSecret = readRuntimeEnvWithAliases('CLOUDINARY_SECRET', ['CLOUDINARY_API_SECRET']);

  const configured = Boolean(cloudName && apiKey && apiSecret);
  return {
    configured,
    source: configured ? 'CLOUDINARY_NAME_KEY_SECRET' : 'none',
    cloudNamePresent: Boolean(cloudName),
    apiKeyPresent: Boolean(apiKey),
    apiSecretPresent: Boolean(apiSecret),
  };
}

export type WorkerRuntimeDiagnostics = {
  service: string;
  railwayServiceHint: string;
  openAiApiKey: EnvPresence;
  elevenLabsApiKey: EnvPresence;
  heygenApiKey: EnvPresence;
  storage: 'READY' | 'NOT READY';
  generationMode: AiInfluencerVideoGenerationMode;
  elevenRequired: boolean;
};

/** Stejná runtime vrstva pro admin dashboard i worker — bez logování secret hodnot. */
export function buildWorkerRuntimeDiagnostics(input: {
  generationMode: AiInfluencerVideoGenerationMode;
  elevenRequired: boolean;
  storageConfigured: boolean;
}): WorkerRuntimeDiagnostics {
  const openAi = getOpenAiRuntimeConfig();
  const eleven = getElevenLabsRuntimeConfig();
  const heygen = getHeyGenRuntimeConfig();
  return {
    service: 'AiInfluencerWorkerService (in-process NestJS worker tick)',
    railwayServiceHint: 'nestjs-backend — stejný Railway service jako admin API',
    openAiApiKey: openAi.apiKeyPresence,
    elevenLabsApiKey: eleven.apiKeyPresence,
    heygenApiKey: heygen.apiKeyPresence,
    storage: input.storageConfigured ? 'READY' : 'NOT READY',
    generationMode: input.generationMode,
    elevenRequired: input.elevenRequired,
  };
}

export function cloudinaryMissingMessage(cfg: CloudinaryRuntimeConfig): string {
  if (cfg.configured) return '';
  if (cfg.source === 'none') {
    const missing: string[] = [];
    if (!cfg.cloudNamePresent) missing.push('CLOUDINARY_NAME');
    if (!cfg.apiKeyPresent) missing.push('CLOUDINARY_KEY');
    if (!cfg.apiSecretPresent) missing.push('CLOUDINARY_SECRET');
    if (missing.length) {
      return `Chybí ${missing.join(', ')} (nebo nastavte CLOUDINARY_URL).`;
    }
    return 'Nastavte CLOUDINARY_URL nebo CLOUDINARY_NAME + CLOUDINARY_KEY + CLOUDINARY_SECRET.';
  }
  return 'Cloudinary není nakonfigurován.';
}

export function resolveElevenLabsRuntimeDiagnostics(input: {
  profileVoiceId?: string | null;
  elevenRequired: boolean;
  voicesPermission?: 'PASS' | 'FAIL' | 'PERMISSION_REQUIRED' | 'NOT_CHECKED';
  ttsPermission?: 'PASS' | 'FAIL' | 'NOT_CHECKED';
}): {
  configured: boolean;
  apiKeyPresent: boolean;
  voiceIdPresent: boolean;
  usable: boolean;
  providerReady: boolean;
  apiProcess: EnvPresence | 'NOT_REQUIRED';
  workerProcess: EnvPresence | 'NOT_REQUIRED';
  voiceService: 'READY' | 'BLOCKED' | 'NOT_REQUIRED';
  voiceId: 'PRESENT' | 'MISSING';
  voicesRead: 'OPTIONAL / AVAILABLE' | 'OPTIONAL / MISSING' | 'NOT_REQUIRED';
} {
  const runtime = getElevenLabsRuntimeConfig();
  const voiceId = input.profileVoiceId?.trim() || runtime.voiceId;
  const apiKeyPresent = runtime.apiKeyPresence === 'CONFIGURED';
  const voiceIdPresent = Boolean(voiceId);
  const ttsReady = input.ttsPermission === 'PASS' || (apiKeyPresent && voiceIdPresent);
  const usable = apiKeyPresent && voiceIdPresent && ttsReady;
  const providerReady = input.elevenRequired ? usable : true;

  const voicesRead =
    !input.elevenRequired
      ? 'NOT_REQUIRED'
      : input.voicesPermission === 'PASS'
        ? 'OPTIONAL / AVAILABLE'
        : 'OPTIONAL / MISSING';

  const notRequired = !input.elevenRequired;

  return {
    configured: apiKeyPresent,
    apiKeyPresent,
    voiceIdPresent,
    usable,
    providerReady,
    apiProcess: notRequired ? 'NOT_REQUIRED' : runtime.apiKeyPresence,
    workerProcess: notRequired ? 'NOT_REQUIRED' : runtime.apiKeyPresence,
    voiceService: notRequired ? 'NOT_REQUIRED' : usable ? 'READY' : 'BLOCKED',
    voiceId: voiceIdPresent ? 'PRESENT' : 'MISSING',
    voicesRead,
  };
}

export { readRuntimeEnv, readRuntimeEnvWithAliases };
