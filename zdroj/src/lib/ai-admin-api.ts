/**
 * AI admin API — re-export z centrálního nest-client.ts.
 * Všechny requesty jdou na ${API_BASE_URL}/admin/ai/openai/...
 */
export {
  nestAdminAiOpenAiFetch,
  nestAdminAiOpenAiUrl,
  nestAdminHealthCheck,
  nestAdminOpenAiSettings,
  nestAdminOpenAiStatus,
  nestAdminOpenAiTest,
  nestAdminOpenAiUpdateSettings,
  nestAdminOpenAiUsage,
  nestAdminSeoAiApply,
  nestAdminSeoAiImprove,
  nestAdminSeoAiReject,
  type NestAdminAiApiError,
  type NestAdminAiSettingsResponse,
  type NestAdminAiSettingsView,
  type NestAdminAiUsageSummary,
  type NestAdminOpenAiStatus,
  type NestAdminSeoAiProposal,
} from '@/lib/nest-client';

/** @deprecated použij nestAdminAiOpenAiUrl */
export { nestAdminAiOpenAiUrl as aiAdminUrl } from '@/lib/nest-client';

export type OpenAiStatus = import('@/lib/nest-client').NestAdminOpenAiStatus;
export type AiSettingsView = import('@/lib/nest-client').NestAdminAiSettingsView;
export type AiUsageSummary = import('@/lib/nest-client').NestAdminAiUsageSummary;
export type AiSettingsResponse = import('@/lib/nest-client').NestAdminAiSettingsResponse;
export type SeoAiProposal = import('@/lib/nest-client').NestAdminSeoAiProposal;
export type AiApiError = import('@/lib/nest-client').NestAdminAiApiError;
