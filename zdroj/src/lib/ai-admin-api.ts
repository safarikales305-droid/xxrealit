import { API_BASE_URL } from '@/lib/api';
import { nestAuthHeaders } from '@/lib/nest-client';

const AI_FETCH_TIMEOUT_MS = 15_000;

export type OpenAiStatus = {
  enabled: boolean;
  configured: boolean;
  connected: boolean | null;
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

export type AiApiError = Error & { httpStatus?: number; code?: string };

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

export type BackendHealth = {
  status: string;
  database: string;
  timestamp?: string;
};

/** Centrální sestavení URL — API_BASE_URL už obsahuje prefix /api */
export function aiAdminUrl(path: string): string {
  const base = API_BASE_URL.replace(/\/$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}/admin/ai${suffix}`;
}

function humanizeHttpError(status: number, message?: string): string {
  if (status === 401) return 'Přihlášení vypršelo. Přihlaste se znovu.';
  if (status === 403) return 'Do AI centra má přístup pouze administrátor.';
  if (status === 404) return 'AI endpoint nebyl na backendu nalezen (404).';
  if (status >= 500) return message ?? `Chyba serveru (${status}).`;
  return message ?? `Chyba ${status}`;
}

async function aiFetch<T>(
  token: string | null,
  path: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T; status: number } | { ok: false; error: AiApiError; status: number }> {
  if (!API_BASE_URL) {
    const err = new Error('NEXT_PUBLIC_API_URL není nastaveno.') as AiApiError;
    err.httpStatus = 0;
    return { ok: false, error: err, status: 0 };
  }
  if (!token) {
    const err = new Error('Nejste přihlášeni.') as AiApiError;
    err.httpStatus = 401;
    return { ok: false, error: err, status: 401 };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(aiAdminUrl(path), {
      ...init,
      signal: controller.signal,
      headers: { ...nestAuthHeaders(token), Accept: 'application/json', ...(init?.headers ?? {}) },
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string | string[] };
      const raw = Array.isArray(body.message) ? body.message.join(', ') : body.message;
      const err = new Error(humanizeHttpError(res.status, raw)) as AiApiError;
      err.httpStatus = res.status;
      return { ok: false, error: err, status: res.status };
    }

    const data = (await res.json().catch(() => null)) as T | null;
    if (data == null) {
      const err = new Error('Neplatná odpověď serveru (JSON).') as AiApiError;
      err.httpStatus = res.status;
      return { ok: false, error: err, status: res.status };
    }

    return { ok: true, data, status: res.status };
  } catch (e) {
    const err = (
      e instanceof Error && e.name === 'AbortError'
        ? new Error('Vypršel časový limit požadavku (15 s).')
        : e instanceof Error
          ? e
          : new Error('Síťová chyba při komunikaci s backendem.')
    ) as AiApiError;
    err.httpStatus = err.httpStatus ?? 0;
    return { ok: false, error: err, status: err.httpStatus ?? 0 };
  } finally {
    clearTimeout(timer);
  }
}

export async function nestAdminHealthCheck(): Promise<
  { ok: true; data: BackendHealth } | { ok: false; error: string; status: number }
> {
  if (!API_BASE_URL) return { ok: false, error: 'API URL není nastaveno.', status: 0 };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE_URL.replace(/\/$/, '')}/health`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return { ok: false, error: `Health check HTTP ${res.status}`, status: res.status };
    const data = (await res.json()) as BackendHealth;
    return { ok: true, data };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error && e.name === 'AbortError' ? 'Health check timeout (15 s).' : 'Backend nedostupný.',
      status: 0,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function nestAdminOpenAiStatus(token: string | null) {
  const res = await aiFetch<OpenAiStatus>(token, '/status');
  if (!res.ok) throw res.error;
  return res.data;
}

export async function nestAdminOpenAiSettings(token: string | null) {
  const res = await aiFetch<AiSettingsResponse>(token, '/settings');
  if (!res.ok) throw res.error;
  return res.data;
}

export async function nestAdminOpenAiUpdateSettings(token: string | null, patch: Partial<AiSettingsView>) {
  const res = await aiFetch<AiSettingsView>(token, '/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw res.error;
  return res.data;
}

export async function nestAdminOpenAiTest(token: string | null) {
  const res = await aiFetch<{
    success: boolean;
    code?: string;
    message: string;
    model: string;
    durationMs: number;
  }>(token, '/test', { method: 'POST' });
  if (!res.ok) throw res.error;
  return res.data;
}

export async function nestAdminOpenAiUsage(token: string | null) {
  const res = await aiFetch<AiUsageSummary>(token, '/usage');
  if (!res.ok) throw res.error;
  return res.data;
}

export async function nestAdminSeoAiImprove(token: string | null, contentId: string): Promise<SeoAiProposal> {
  const res = await aiFetch<SeoAiProposal>(token, `/seo/improve/${encodeURIComponent(contentId)}`, {
    method: 'POST',
  });
  if (!res.ok) throw res.error;
  return res.data;
}

export async function nestAdminSeoAiApply(token: string | null, generationId: string) {
  const res = await aiFetch<{ page: unknown; generationId: string }>(token, '/seo/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ generationId }),
  });
  if (!res.ok) throw res.error;
  return res.data;
}

export async function nestAdminSeoAiReject(token: string | null, generationId: string) {
  const res = await aiFetch<{ success: boolean }>(token, '/seo/reject', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ generationId }),
  });
  if (!res.ok) throw res.error;
  return res.data;
}
