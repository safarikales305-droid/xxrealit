import { nestAuthHeaders } from '@/lib/nest-client';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ?? '';

export type OpenAiStatus = {
  enabled: boolean;
  configured: boolean;
  connected: boolean;
  model: string;
  apiKeyConfigured: boolean;
  apiKeyMasked: string | null;
  lastSuccessfulTestAt: string | null;
  lastError: string | null;
  message: string | null;
  seoEnabled?: boolean;
};

export type AiSettingsView = {
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
  lastConnectionTestAt: string | null;
  lastConnectionSuccess: boolean | null;
  lastConnectionError: string | null;
};

export type AiUsageSummary = {
  requestsToday: number;
  requestsThisMonth: number;
  successfulToday: number;
  failedToday: number;
  inputTokensToday: number;
  outputTokensToday: number;
  inputTokensMonth: number;
  outputTokensMonth: number;
  estimatedCostCzkToday: number;
  estimatedCostCzkMonth: number;
  avgDurationMsToday: number;
};

export type AiSettingsResponse = {
  settings: AiSettingsView;
  env: {
    apiKeyConfigured: boolean;
    apiKeyMasked: string | null;
    apiKeySource: string;
    apiKeyHelp: string;
  };
  usage: AiUsageSummary;
  status: OpenAiStatus;
};

export type SeoAiProposal = {
  generationId: string;
  status: string;
  model: string;
  durationMs: number;
  context: {
    locationName: string;
    offerLabel: string;
    propertyLabel: string;
    intentSlug: string | null;
    locationSlug: string | undefined;
  };
  current: {
    title: string;
    description: string;
    h1: string;
    bodyText: string;
    faq: unknown[];
  };
  proposal: {
    metaTitle: string;
    metaDescription: string;
    h1: string;
    introText: string;
    mainContent: string;
    faq: Array<{ question: string; answer: string }>;
  };
};

async function aiJson<T>(token: string | null, path: string, init?: RequestInit): Promise<T> {
  if (!API_BASE_URL || !token) throw new Error('Nejste přihlášeni nebo API není dostupné.');
  const res = await fetch(`${API_BASE_URL}/admin/ai${path}`, {
    ...init,
    headers: { ...nestAuthHeaders(token), Accept: 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string | string[] };
    const msg = Array.isArray(err.message) ? err.message.join(', ') : err.message;
    throw new Error(msg ?? `Chyba ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function nestAdminOpenAiStatus(token: string | null): Promise<OpenAiStatus> {
  return aiJson<OpenAiStatus>(token, '/openai/status');
}

export async function nestAdminOpenAiSettings(token: string | null): Promise<AiSettingsResponse> {
  return aiJson<AiSettingsResponse>(token, '/openai/settings');
}

export async function nestAdminOpenAiUpdateSettings(
  token: string | null,
  patch: Partial<AiSettingsView>,
): Promise<AiSettingsView> {
  return aiJson<AiSettingsView>(token, '/openai/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
}

export async function nestAdminOpenAiTest(
  token: string | null,
): Promise<{ success: boolean; message: string; model: string; durationMs: number }> {
  return aiJson(token, '/openai/test', { method: 'POST' });
}

export async function nestAdminSeoAiImprove(token: string | null, contentId: string): Promise<SeoAiProposal> {
  return aiJson<SeoAiProposal>(token, `/seo/improve/${encodeURIComponent(contentId)}`, { method: 'POST' });
}

export async function nestAdminSeoAiApply(
  token: string | null,
  generationId: string,
): Promise<{ page: unknown; generationId: string }> {
  return aiJson(token, '/seo/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ generationId }),
  });
}

export async function nestAdminSeoAiReject(token: string | null, generationId: string): Promise<{ success: boolean }> {
  return aiJson(token, '/seo/reject', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ generationId }),
  });
}
