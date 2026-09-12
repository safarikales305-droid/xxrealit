import { Injectable } from '@nestjs/common';
import type { PipelineFailedStage } from './ai-influencer-pipeline-stage.util';
import { pipelineError } from './ai-influencer-pipeline-stage.util';
import {
  getHeyGenRuntimeConfig,
  type EnvPresence,
  type HeyGenRuntimeConfig,
} from './ai-influencer-runtime-config.util';

export type HeyGenConfigContext = 'VIDEO_AGENT' | 'AVATAR' | 'API';

export type HeyGenUnifiedDiagnostics = {
  apiProcess: EnvPresence;
  workerProcess: EnvPresence;
  providerService: EnvPresence;
  videoAgentService: EnvPresence;
  avatarFallbackService: EnvPresence;
  configured: boolean;
  usable: boolean;
  avatarIdPresent: boolean;
};

@Injectable()
export class HeyGenRuntimeConfigService {
  /** Canonical runtime config — vždy čte process.env přes runtime util (bez import-time snapshot). */
  getConfig(): HeyGenRuntimeConfig {
    return getHeyGenRuntimeConfig();
  }

  getApiKey(): string | undefined {
    return this.getConfig().apiKey;
  }

  isApiKeyConfigured(): boolean {
    return this.getConfig().apiKeyPresence === 'CONFIGURED';
  }

  resolveAvatarId(profileAvatarId?: string | null): string | null {
    return profileAvatarId?.trim() || this.getConfig().avatarId || null;
  }

  assertApiKeyConfigured(context: HeyGenConfigContext): void {
    if (this.isApiKeyConfigured()) return;
    const pipelineStage: PipelineFailedStage =
      context === 'AVATAR' ? 'AVATAR' : 'VIDEO_AGENT';
    throw pipelineError(
      'HEYGEN_API_KEY není nakonfigurován.',
      'HEYGEN_NOT_CONFIGURED',
      pipelineStage,
    );
  }

  /** Stejný zdroj pro admin diagnostiku, preflight i worker. */
  getUnifiedDiagnostics(): HeyGenUnifiedDiagnostics {
    const cfg = this.getConfig();
    const configured = cfg.apiKeyPresence === 'CONFIGURED';
    return {
      apiProcess: cfg.apiKeyPresence,
      workerProcess: cfg.apiKeyPresence,
      providerService: cfg.apiKeyPresence,
      videoAgentService: cfg.apiKeyPresence,
      avatarFallbackService: cfg.apiKeyPresence,
      configured,
      usable: configured,
      avatarIdPresent: Boolean(cfg.avatarId),
    };
  }
}
