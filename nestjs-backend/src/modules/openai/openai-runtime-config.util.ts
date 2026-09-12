import {
  readRuntimeEnv,
  readRuntimeEnvFlag,
  readRuntimeEnvWithAliases,
} from '../../lib/runtime-env.util';

export type OpenAiEnvPresence = 'CONFIGURED' | 'MISSING';

export type OpenAiRuntimeConfig = {
  apiKey: string | undefined;
  apiKeyPresence: OpenAiEnvPresence;
  envEnabled: boolean;
  envModel: string;
  envDailyLimit: number;
  envMonthlyBudgetCzk: number;
  envTimeoutMs: number;
  envMaxRetries: number;
};

export function getOpenAiRuntimeConfig(): OpenAiRuntimeConfig {
  const apiKey = readRuntimeEnvWithAliases('OPENAI_API_KEY', [
    'OPENAI_KEY',
    'OPENAI_SECRET_KEY',
  ]);
  return {
    apiKey,
    apiKeyPresence: apiKey ? 'CONFIGURED' : 'MISSING',
    envEnabled: readRuntimeEnvFlag('OPENAI_ENABLED'),
    envModel: readRuntimeEnv('OPENAI_MODEL') ?? 'gpt-4.1-mini',
    envDailyLimit: Number.parseInt(readRuntimeEnv('OPENAI_DAILY_REQUEST_LIMIT') ?? '100', 10),
    envMonthlyBudgetCzk: Number.parseInt(readRuntimeEnv('OPENAI_MONTHLY_BUDGET_CZK') ?? '1000', 10),
    envTimeoutMs: Number.parseInt(readRuntimeEnv('OPENAI_TIMEOUT_MS') ?? '60000', 10),
    envMaxRetries: Number.parseInt(readRuntimeEnv('OPENAI_MAX_RETRIES') ?? '2', 10),
  };
}
