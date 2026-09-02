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
  status?:
    | 'NOT_CONFIGURED'
    | 'CONNECTED'
    | 'INVALID_API_KEY'
    | 'INSUFFICIENT_PERMISSIONS'
    | 'RATE_LIMITED'
    | 'QUOTA_EXCEEDED'
    | 'CONNECTION_ERROR';
  voiceStatus?: 'SELECTED' | 'NOT_SELECTED';
  voicesPermission?: 'PASS' | 'FAIL' | 'PERMISSION_REQUIRED' | 'NOT_CHECKED';
  ttsPermission?: 'PASS' | 'FAIL' | 'NOT_CHECKED';
  voiceId?: string | null;
  latencyMs?: number | null;
  lastError?: string | null;
  httpStatus?: number | null;
  detailStatus?: string | null;
  detailMessage?: string | null;
};

export type HeyGenProviderStatus = {
  configured: boolean;
  connected: boolean | null;
  status?:
    | 'NOT_CONFIGURED'
    | 'CONNECTED'
    | 'INVALID_API_KEY'
    | 'PERMISSION_REQUIRED'
    | 'RATE_LIMITED'
    | 'API_ERROR'
    | 'CONNECTION_ERROR';
  avatarStatus?: 'SELECTED' | 'NOT_SELECTED';
  avatarsPermission?: 'PASS' | 'FAIL' | 'PERMISSION_REQUIRED' | 'NOT_CHECKED';
  heygenApiKeyPresent?: boolean;
  avatarId?: string | null;
  latencyMs?: number | null;
  lastError?: string | null;
  httpStatus?: number | null;
  errorCode?: string | null;
  detailMessage?: string | null;
};

export type AiInfluencerReadyStatus = {
  ready: boolean;
  reason: string | null;
  reasons?: string[];
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
  providers: {
    ready?: AiInfluencerReadyStatus;
    ai?: { configured: boolean; connected: boolean | null };
    elevenLabs?: ElevenLabsProviderStatus;
    heygen?: HeyGenProviderStatus;
    did?: { configured: boolean; connected: boolean | null; lastError?: string | null };
    facebook?: { configured: boolean; connected: boolean | null };
    youtube?: { configured: boolean; connected: boolean | null };
  };
};

export type ElevenLabsVoiceOption = {
  voiceId: string;
  name: string;
  category: string | null;
  previewUrl: string | null;
};

export type ElevenLabsVoicesResponse = {
  voices: ElevenLabsVoiceOption[];
  permission: 'PASS' | 'FAIL' | 'PERMISSION_REQUIRED' | 'NOT_CHECKED';
  message?: string | null;
};

export type HeyGenAvatarOption = {
  avatarId: string;
  name: string;
  previewUrl: string | null;
};

export type HeyGenAvatarsResponse = {
  avatars: HeyGenAvatarOption[];
  permission: 'PASS' | 'FAIL' | 'PERMISSION_REQUIRED' | 'NOT_CHECKED';
  message?: string | null;
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
  return aiInfluencerFetch<ElevenLabsVoicesResponse>(token, '/voices/elevenlabs');
}

export function nestAiInfluencerHeyGenAvatars(token: string) {
  return aiInfluencerFetch<HeyGenAvatarsResponse>(token, '/avatars/heygen');
}

export function nestAiInfluencerTestAvatar(token: string, text?: string, avatarId?: string) {
  return aiInfluencerFetchWithError<{
    ok: boolean;
    avatarId: string;
    verified: boolean;
    message: string;
  }>(token, '/test/avatar', { method: 'POST', body: JSON.stringify({ text, avatarId }) });
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
