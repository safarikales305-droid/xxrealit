import { Injectable } from '@nestjs/common';
import type { AiProvider } from '@prisma/client';
import {
  evaluateScriptGenerationGate,
  type ScriptGenerationGateResult,
} from './ai-script-generation-gate.util';
import { OpenAiConfigService } from './openai-config.service';
import { OpenAiSettingsService } from './openai-settings.service';
import { OpenAiService } from './openai.service';

export type ActiveAiProvider = {
  provider: AiProvider;
  configured: boolean;
  enabled: boolean;
  dbEnabled: boolean;
  envEnabled: boolean;
  model: string;
  connected: boolean | null;
  lastError: string | null;
  source: 'database' | 'environment' | 'both' | 'none';
  scriptGenerationEnabled: boolean;
  settingsPath: '/admin/marketing/ai-centrum';
};

export type ResolvedScriptGenerationProvider = ActiveAiProvider &
  ScriptGenerationGateResult & {
    configSource: ActiveAiProvider['source'];
  };

@Injectable()
export class AiProviderService {
  constructor(
    private readonly openAi: OpenAiService,
    private readonly config: OpenAiConfigService,
    private readonly settings: OpenAiSettingsService,
  ) {}

  async getActiveAiProvider(): Promise<ActiveAiProvider> {
    const resolved = await this.resolveScriptProvider();
    return {
      provider: resolved.provider,
      configured: resolved.configured,
      enabled: resolved.enabled,
      dbEnabled: resolved.dbEnabled,
      envEnabled: resolved.envEnabled,
      model: resolved.model,
      connected: resolved.connected,
      lastError: resolved.lastError,
      source: resolved.source,
      scriptGenerationEnabled: resolved.usable,
      settingsPath: resolved.settingsPath,
    };
  }

  /** Canonical resolver — preflight, worker, test, produkce, retry. */
  async resolveScriptProvider(): Promise<ResolvedScriptGenerationProvider> {
    return this.resolveAiProviderForScriptGeneration();
  }

  async resolveAiProviderForScriptGeneration(): Promise<ResolvedScriptGenerationProvider> {
    const [status, db] = await Promise.all([this.openAi.getStatus(), this.settings.getOrCreate()]);
    const envEnabled = this.config.envEnabled;
    const dbEnabled = db.enabled;
    const enabled = dbEnabled || envEnabled;
    const configured = status.configured;

    let source: ActiveAiProvider['source'] = 'none';
    if (dbEnabled && envEnabled) source = 'both';
    else if (dbEnabled) source = 'database';
    else if (envEnabled) source = 'environment';

    const gate = evaluateScriptGenerationGate({
      enabled,
      configured,
      connected: status.connected,
      lastError: status.lastError,
      provider: db.provider,
    });

    return {
      provider: db.provider,
      configured,
      enabled,
      dbEnabled,
      envEnabled,
      model: status.model,
      connected: status.connected,
      lastError: status.lastError,
      source,
      scriptGenerationEnabled: gate.usable,
      settingsPath: '/admin/marketing/ai-centrum',
      configSource: source,
      ...gate,
    };
  }

  async assertScriptGenerationReady(): Promise<ResolvedScriptGenerationProvider> {
    const resolved = await this.resolveScriptProvider();
    if (!resolved.usable) {
      throw Object.assign(new Error(resolved.reason), {
        code: resolved.code ?? 'AI_PROVIDER_DISABLED',
        pipelineStage: 'SCRIPT',
      });
    }
    return resolved;
  }
}
