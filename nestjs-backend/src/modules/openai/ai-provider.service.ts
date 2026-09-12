import { Injectable } from '@nestjs/common';
import type { AiProvider } from '@prisma/client';
import { evaluateScriptGenerationGate, type ScriptGenerationGateResult } from './ai-script-generation-gate.util';
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

export type ResolvedScriptGenerationProvider = ActiveAiProvider & ScriptGenerationGateResult;

@Injectable()
export class AiProviderService {
  constructor(
    private readonly openAi: OpenAiService,
    private readonly config: OpenAiConfigService,
    private readonly settings: OpenAiSettingsService,
  ) {}

  async getActiveAiProvider(): Promise<ActiveAiProvider> {
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
      scriptGenerationEnabled: gate.allowed,
      settingsPath: '/admin/marketing/ai-centrum',
    };
  }

  /** Canonical resolver — preflight, worker, test i produkční script generation. */
  async resolveAiProviderForScriptGeneration(): Promise<ResolvedScriptGenerationProvider> {
    const active = await this.getActiveAiProvider();
    const gate = evaluateScriptGenerationGate({
      enabled: active.enabled,
      configured: active.configured,
      connected: active.connected,
      lastError: active.lastError,
      provider: active.provider,
    });
    return { ...active, ...gate };
  }

  async assertScriptGenerationReady(): Promise<ResolvedScriptGenerationProvider> {
    const resolved = await this.resolveAiProviderForScriptGeneration();
    if (!resolved.allowed) {
      throw Object.assign(new Error(resolved.message), {
        code: resolved.code ?? 'AI_PROVIDER_DISABLED',
        pipelineStage: 'SCRIPT',
      });
    }
    return resolved;
  }
}
