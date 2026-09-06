import { Injectable } from '@nestjs/common';
import type { AiProvider } from '@prisma/client';
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
  /** Influencer + redakce volají OpenAI s adminTest — stačí globální enabled + API klíč. */
  scriptGenerationEnabled: boolean;
  settingsPath: '/admin/marketing/ai-centrum';
};

@Injectable()
export class AiProviderService {
  constructor(
    private readonly openAi: OpenAiService,
    private readonly config: OpenAiConfigService,
    private readonly settings: OpenAiSettingsService,
  ) {}

  /** Canonical resolver — stejný zdroj pro AI redakci, SEO, chat i AI Influencer. */
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
      scriptGenerationEnabled: enabled && configured && status.connected !== false,
      settingsPath: '/admin/marketing/ai-centrum',
    };
  }
}
