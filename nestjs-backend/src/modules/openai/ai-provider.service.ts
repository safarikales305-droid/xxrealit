import { Injectable } from '@nestjs/common';
import type { AiProvider } from '@prisma/client';
import {
  buildScriptGenerationRuntimeContext,
  evaluateScriptGenerationGateFromContext,
  type ScriptGenerationGateResult,
  resolveScriptGenerationConfigSource,
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
    resolvedAt: string;
    clientReady: boolean;
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
    const clientReady = this.openAi.isScriptClientReady();
    const ctx = buildScriptGenerationRuntimeContext({
      dbEnabled,
      envEnabled,
      configured: status.configured,
      connected: status.connected,
      lastError: status.lastError,
      provider: db.provider,
    });
    const source = resolveScriptGenerationConfigSource(ctx);
    const gate = evaluateScriptGenerationGateFromContext(ctx);
    const usable = gate.usable && clientReady;
    const resolvedGate = usable
      ? gate
      : !clientReady && gate.configured
        ? {
            ...gate,
            usable: false,
            allowed: false,
            ready: false,
            label: 'NOT_READY' as const,
            code: 'OPENAI_API_KEY_MISSING' as const,
            message: 'OpenAI API key není dostupný v generation workeru.',
            reason: 'OpenAI API key není dostupný v generation workeru.',
          }
        : gate;

    return {
      provider: db.provider,
      dbEnabled,
      envEnabled,
      model: status.model,
      connected: status.connected,
      lastError: status.lastError,
      source,
      scriptGenerationEnabled: usable,
      settingsPath: '/admin/marketing/ai-centrum',
      configSource: source,
      resolvedAt: new Date().toISOString(),
      clientReady,
      ...resolvedGate,
      usable,
    };
  }

  async assertScriptGenerationReady(): Promise<ResolvedScriptGenerationProvider> {
    const resolved = await this.resolveScriptProvider();
    if (!resolved.usable) {
      throw Object.assign(new Error(resolved.message), {
        code: resolved.code ?? 'AI_PROVIDER_DISABLED',
        pipelineStage: 'SCRIPT',
      });
    }
    return resolved;
  }
}
