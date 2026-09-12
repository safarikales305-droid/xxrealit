import { resolveFfmpegBinary } from '../../lib/ffmpeg-binary';
import {
  buildWorkerRuntimeDiagnostics,
  getCloudinaryRuntimeConfig,
  getElevenLabsRuntimeConfig,
  getHeyGenRuntimeConfig,
  type CloudinaryRuntimeConfig,
  type EnvPresence,
} from './ai-influencer-runtime-config.util';

export type ProviderChipStatus = 'READY' | 'MISSING' | 'NOT_READY' | 'NOT_REQUIRED';

export function getRendererRuntimeReadiness(): {
  ready: boolean;
  configured: boolean;
  message: string | null;
} {
  const ffmpeg = resolveFfmpegBinary();
  if (!ffmpeg.path) {
    return {
      ready: false,
      configured: false,
      message: 'ffmpeg není dostupný pro render pipeline.',
    };
  }
  return { ready: true, configured: true, message: null };
}

export function resolveVideoAgentCanonicalReady(input: {
  videoAgentAvailable: boolean;
  heygenApiKeyPresence: EnvPresence;
  heygenGenerationReady?: boolean;
}): { ready: boolean; message: string | null } {
  if (input.heygenApiKeyPresence === 'MISSING') {
    return { ready: false, message: 'HEYGEN_API_KEY není nakonfigurován.' };
  }
  if (!input.videoAgentAvailable) {
    return { ready: false, message: 'HeyGen Video Agent není dostupný.' };
  }
  return { ready: true, message: null };
}

export function buildProviderRuntimeDiagnostics(input: {
  openAiConfigured: boolean;
  openAiEnabled: boolean;
  openAiUsable: boolean;
  openAiModel: string;
  videoAgentAvailable: boolean;
  heygenApiKeyPresence: EnvPresence;
  heygenGenerationReady: boolean;
  elevenRequired: boolean;
  elevenApiKeyPresence: EnvPresence;
  elevenReady: boolean;
  storage: CloudinaryRuntimeConfig;
  generationMode: 'VIDEO_AGENT' | 'AVATAR';
  elevenRequiredForMode: boolean;
}) {
  const heygenRuntime = getHeyGenRuntimeConfig();
  const elevenRuntime = getElevenLabsRuntimeConfig();
  const storageRuntime = getCloudinaryRuntimeConfig();
  const renderer = getRendererRuntimeReadiness();
  const worker = buildWorkerRuntimeDiagnostics({
    generationMode: input.generationMode,
    elevenRequired: input.elevenRequiredForMode,
    storageConfigured: input.storage.configured,
  });
  const videoAgent = resolveVideoAgentCanonicalReady({
    videoAgentAvailable: input.videoAgentAvailable,
    heygenApiKeyPresence: heygenRuntime.apiKeyPresence,
    heygenGenerationReady: input.heygenGenerationReady,
  });
  const heygenConfig = {
    apiProcess: heygenRuntime.apiKeyPresence,
    workerProcess: worker.heygenApiKey,
    providerService: heygenRuntime.apiKeyPresence,
    videoAgentService: heygenRuntime.apiKeyPresence,
    avatarFallbackService: heygenRuntime.apiKeyPresence,
    generationMode: input.generationMode,
    currentProvider: 'HEYGEN' as const,
    avatarFallbackUsed: input.generationMode === 'AVATAR' ? 'CONFIGURED' : 'NOT_USED',
  };
  return {
    openAi: {
      status: input.openAiUsable ? 'READY' : input.openAiConfigured ? 'NOT_READY' : 'MISSING',
      configured: input.openAiConfigured ? 'CONFIGURED' : 'MISSING',
      enabled: input.openAiEnabled ? 'YES' : 'NO',
      model: input.openAiModel,
    },
    elevenLabs: {
      status: !input.elevenRequired
        ? 'NOT_REQUIRED'
        : input.elevenReady && input.elevenApiKeyPresence === 'CONFIGURED'
          ? 'READY'
          : input.elevenApiKeyPresence === 'MISSING'
            ? 'MISSING'
            : 'NOT_READY',
      apiKey: input.elevenRequired ? elevenRuntime.apiKeyPresence : 'NOT_REQUIRED',
    },
    heyGenApi: {
      status:
        heygenRuntime.apiKeyPresence === 'CONFIGURED'
          ? input.heygenGenerationReady
            ? 'READY'
            : 'NOT_READY'
          : 'MISSING',
      apiKey: heygenRuntime.apiKeyPresence,
    },
    heyGenVideoAgent: {
      status: videoAgent.ready ? 'READY' : heygenRuntime.apiKeyPresence === 'MISSING' ? 'MISSING' : 'NOT_READY',
      apiKey: heygenRuntime.apiKeyPresence,
      workerApiKey: worker.heygenApiKey,
    },
    heygenConfig,
    renderer: {
      status: renderer.ready ? 'READY' : 'NOT_READY',
      ffmpeg: renderer.configured ? 'CONFIGURED' : 'MISSING',
    },
    storage: {
      status: storageRuntime.configured ? 'READY' : 'MISSING',
      apiKey: storageRuntime.apiKeyPresent ? 'CONFIGURED' : 'MISSING',
      source: storageRuntime.source,
    },
    apiWorker: {
      heygenApiKey: heygenRuntime.apiKeyPresence,
      elevenLabsApiKey: elevenRuntime.apiKeyPresence,
      storage: storageRuntime.configured ? 'READY' : 'NOT READY',
    },
    workerRuntime: worker,
  };
}
