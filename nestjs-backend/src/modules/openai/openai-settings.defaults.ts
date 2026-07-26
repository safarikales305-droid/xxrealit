import type { AiProvider } from '@prisma/client';

export type AiSettingsRecord = {
  id: string;
  provider: AiProvider;
  enabled: boolean;
  defaultModel: string;
  dailyRequestLimit: number;
  monthlyBudgetCzk: number;
  maxOutputTokens: number;
  timeoutMs: number;
  maxRetries: number;
  seoEnabled: boolean;
  listingDescriptionEnabled: boolean;
  socialPostEnabled: boolean;
  emailEnabled: boolean;
  supportEnabled: boolean;
  lastConnectionTestAt: Date | null;
  lastConnectionSuccess: boolean | null;
  lastConnectionError: string | null;
};

export function buildDefaultAiSettings(env: {
  envEnabled: boolean;
  envModel: string;
  envDailyLimit: number;
  envMonthlyBudgetCzk: number;
  envTimeoutMs: number;
  envMaxRetries: number;
}): AiSettingsRecord {
  return {
    id: 'default',
    provider: 'OPENAI',
    enabled: env.envEnabled,
    defaultModel: env.envModel,
    dailyRequestLimit: env.envDailyLimit,
    monthlyBudgetCzk: env.envMonthlyBudgetCzk,
    maxOutputTokens: 2000,
    timeoutMs: env.envTimeoutMs,
    maxRetries: env.envMaxRetries,
    seoEnabled: true,
    listingDescriptionEnabled: false,
    socialPostEnabled: false,
    emailEnabled: false,
    supportEnabled: false,
    lastConnectionTestAt: null,
    lastConnectionSuccess: null,
    lastConnectionError: null,
  };
}

export const EMPTY_AI_USAGE = {
  requestsToday: 0,
  requestsThisMonth: 0,
  successfulToday: 0,
  failedToday: 0,
  inputTokensToday: 0,
  outputTokensToday: 0,
  inputTokensMonth: 0,
  outputTokensMonth: 0,
  estimatedCostCzkToday: 0,
  estimatedCostCzkMonth: 0,
  avgDurationMsToday: 0,
};
