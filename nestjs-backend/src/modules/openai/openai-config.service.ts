import { Injectable } from '@nestjs/common';
import { maskApiKey } from './openai-mask.util';
import { getOpenAiRuntimeConfig, type OpenAiRuntimeConfig } from './openai-runtime-config.util';

@Injectable()
export class OpenAiConfigService {
  private get runtime(): OpenAiRuntimeConfig {
    return getOpenAiRuntimeConfig();
  }

  get apiKey(): string | null {
    return this.runtime.apiKey ?? null;
  }

  get envModel(): string {
    return this.runtime.envModel;
  }

  get envEnabled(): boolean {
    return this.runtime.envEnabled;
  }

  get envDailyLimit(): number {
    return this.runtime.envDailyLimit;
  }

  get envMonthlyBudgetCzk(): number {
    return this.runtime.envMonthlyBudgetCzk;
  }

  get envTimeoutMs(): number {
    return this.runtime.envTimeoutMs;
  }

  get envMaxRetries(): number {
    return this.runtime.envMaxRetries;
  }

  isApiKeyConfigured(): boolean {
    return this.runtime.apiKeyPresence === 'CONFIGURED';
  }

  getMaskedApiKey(): string | null {
    return maskApiKey(this.apiKey);
  }

  getRuntimeSnapshot(): OpenAiRuntimeConfig {
    return getOpenAiRuntimeConfig();
  }
}
