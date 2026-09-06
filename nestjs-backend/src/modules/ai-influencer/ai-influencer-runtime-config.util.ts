/**
 * Jednotné čtení ENV pro AI Influencer pipeline (status + worker).
 * Nikdy nelogovat hodnoty — pouze CONFIGURED / MISSING.
 */

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

export function readRuntimeEnv(name: string): string | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const trimmed = raw.trim().replace(/^["']|["']$/g, '');
  return trimmed || undefined;
}

export function readRuntimeEnvWithAliases(
  primary: string,
  aliases: string[] = [],
): string | undefined {
  const direct = readRuntimeEnv(primary);
  if (direct) return direct;
  for (const alias of aliases) {
    const v = readRuntimeEnv(alias);
    if (v) return v;
  }
  return undefined;
}

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
  const eleven = getElevenLabsRuntimeConfig();
  const heygen = getHeyGenRuntimeConfig();
  return {
    service: 'AiInfluencerWorkerService (in-process NestJS worker tick)',
    railwayServiceHint: 'nestjs-backend — stejný Railway service jako admin API',
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
