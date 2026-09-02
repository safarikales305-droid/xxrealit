import { API_BASE_URL } from './api';
import { nestAuthHeaders } from './nest-client';

async function aiInfluencerFetch<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<T | null> {
  const res = await fetch(`${API_BASE_URL}/admin/ai-influencer${path}`, {
    ...init,
    headers: {
      ...nestAuthHeaders(token),
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

export type ElevenLabsProviderStatus = {
  configured: boolean;
  connected: boolean | null;
  status?: 'NOT_CONFIGURED' | 'CONNECTED' | 'INVALID_API_KEY' | 'CONNECTION_ERROR';
  voiceStatus?: 'SELECTED' | 'NOT_SELECTED';
  voiceId?: string | null;
  latencyMs?: number | null;
  lastError?: string | null;
};

export type AiInfluencerDashboard = {
  settings: {
    enabled: boolean;
    minScore: number;
    maxPerDay: number;
    approvalMode: string;
    dailyBudgetCzk: number;
  };
  stats: {
    reelsToday: number;
    reelsWeek: number;
    inQueue: number;
    published: number;
    failed: number;
    costTodayCzk: number;
    costMonthCzk: number;
  };
  providers: Record<string, ElevenLabsProviderStatus | { configured: boolean; connected: boolean | null; lastError?: string | null }>;
};

export type ElevenLabsVoiceOption = {
  voiceId: string;
  name: string;
  category: string | null;
  previewUrl: string | null;
};

export type AiInfluencerArticleRow = {
  id: string;
  title: string;
  publishedAt: string | null;
  category: string;
  ogImageUrl: string | null;
  reelScore: number | null;
  latestJob: { id: string; status: string; candidate?: { reelPotentialScore: number } | null } | null;
};

export type AiInfluencerJobRow = {
  id: string;
  status: string;
  selectedHook: string | null;
  videoUrl: string | null;
  totalExternalCost: number;
  failedStage: string | null;
  errorMessage: string | null;
  createdAt: string;
  article: { id: string; title: string; publishedAt: string | null; status: string };
  profile: { id: string; name: string; slug: string };
};

export function nestAiInfluencerDashboard(token: string) {
  return aiInfluencerFetch<AiInfluencerDashboard>(token, '/dashboard');
}

export function nestAiInfluencerArticles(token: string) {
  return aiInfluencerFetch<AiInfluencerArticleRow[]>(token, '/articles');
}

export function nestAiInfluencerJobs(token: string) {
  return aiInfluencerFetch<AiInfluencerJobRow[]>(token, '/jobs');
}

export function nestAiInfluencerCreateJob(token: string, articleId: string) {
  return aiInfluencerFetch<AiInfluencerJobRow>(token, `/jobs/from-article/${articleId}`, {
    method: 'POST',
  });
}

export function nestAiInfluencerApproveScript(token: string, jobId: string) {
  return aiInfluencerFetch<AiInfluencerJobRow>(token, `/jobs/${jobId}/approve-script`, {
    method: 'POST',
  });
}

export function nestAiInfluencerRetryJob(token: string, jobId: string) {
  return aiInfluencerFetch<AiInfluencerJobRow>(token, `/jobs/${jobId}/retry`, { method: 'POST' });
}

export function nestAiInfluencerTestVoice(token: string, text?: string, voiceId?: string) {
  return aiInfluencerFetchWithError<{ ok: boolean; previewUrl: string }>(token, '/test/voice', {
    method: 'POST',
    body: JSON.stringify({ text, voiceId }),
  });
}

async function aiInfluencerFetchWithError<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<{ data: T | null; error: string | null }> {
  const res = await fetch(`${API_BASE_URL}/admin/ai-influencer${path}`, {
    ...init,
    headers: {
      ...nestAuthHeaders(token),
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  const json = (await res.json().catch(() => null)) as T | { message?: string | string[] } | null;
  if (!res.ok) {
    const msg = Array.isArray((json as { message?: string[] })?.message)
      ? (json as { message: string[] }).message.join(', ')
      : (json as { message?: string })?.message;
    return { data: null, error: msg || `HTTP ${res.status}` };
  }
  return { data: json as T, error: null };
}

export function nestAiInfluencerElevenLabsVoices(token: string) {
  return aiInfluencerFetch<ElevenLabsVoiceOption[]>(token, '/voices/elevenlabs');
}

export function nestAiInfluencerTestAvatar(token: string, text?: string) {
  return aiInfluencerFetch<{ ok: boolean; externalJobId: string; message: string }>(
    token,
    '/test/avatar',
    { method: 'POST', body: JSON.stringify({ text }) },
  );
}

export function nestAiInfluencerProfile(token: string) {
  return aiInfluencerFetch<Record<string, unknown>>(token, '/profile');
}

export function nestAiInfluencerUpdateProfile(token: string, body: Record<string, unknown>) {
  return aiInfluencerFetch<Record<string, unknown>>(token, '/profile', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}
