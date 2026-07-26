import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { maskApiKey } from './openai-mask.util';

@Injectable()
export class OpenAiConfigService {
  constructor(private readonly config: ConfigService) {}

  get apiKey(): string | null {
    const key = this.config.get<string>('OPENAI_API_KEY');
    return key?.trim() || null;
  }

  get envModel(): string {
    return this.config.get<string>('OPENAI_MODEL')?.trim() || 'gpt-4.1-mini';
  }

  get envEnabled(): boolean {
    return this.config.get<string>('OPENAI_ENABLED') === 'true';
  }

  get envDailyLimit(): number {
    return Number.parseInt(this.config.get<string>('OPENAI_DAILY_REQUEST_LIMIT') ?? '100', 10);
  }

  get envMonthlyBudgetCzk(): number {
    return Number.parseInt(this.config.get<string>('OPENAI_MONTHLY_BUDGET_CZK') ?? '1000', 10);
  }

  get envTimeoutMs(): number {
    return Number.parseInt(this.config.get<string>('OPENAI_TIMEOUT_MS') ?? '60000', 10);
  }

  get envMaxRetries(): number {
    return Number.parseInt(this.config.get<string>('OPENAI_MAX_RETRIES') ?? '2', 10);
  }

  isApiKeyConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  getMaskedApiKey(): string | null {
    return maskApiKey(this.apiKey);
  }
}
