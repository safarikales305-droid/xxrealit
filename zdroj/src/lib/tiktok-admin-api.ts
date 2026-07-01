import { API_BASE_URL } from '@/lib/api';

export type TikTokConnectionStatus = {
  configured: boolean;
  connected: boolean;
  clientKeyMasked: string | null;
  clientSecretMasked: string | null;
  redirectUri: string;
  baseUrl: string;
  accountName: string | null;
  openId: string | null;
  accessTokenMasked: string | null;
  expiresAt: string | null;
  refreshExpiresAt: string | null;
  scope: string | null;
  settings: {
    autoPublish: boolean;
    preferDirectPublish: boolean;
  };
};

export type TikTokPublishJobRow = {
  id: string;
  listingId: string;
  videoUrl: string;
  caption: string;
  hashtags: string;
  status: string;
  tiktokPublishId: string | null;
  tiktokVideoUrl: string | null;
  errorMessage: string | null;
  attempts: number;
  isDraftInbox: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  logs?: Array<{
    id: string;
    status: string;
    message: string | null;
    rawResponse: unknown;
    createdAt: string;
  }>;
};

function resolveTikTokApiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  const suffix = p.replace(/^\/social\/tiktok/, '') || '/status';
  if (typeof window !== 'undefined') {
    const origin = window.location.origin.replace(/\/+$/, '');
    return `${origin}/api/tiktok/admin${suffix}`;
  }
  if (!API_BASE_URL) return p;
  return `${API_BASE_URL}${p}`;
}

async function tiktokFetch<T>(token: string, path: string, init?: RequestInit): Promise<T | null> {
  const res = await fetch(resolveTikTokApiUrl(path), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return res.json() as Promise<T>;
}

export async function nestTikTokStatus(token: string): Promise<TikTokConnectionStatus | null> {
  return tiktokFetch(token, '/social/tiktok/status');
}

export async function nestTikTokUpdateSettings(
  token: string,
  body: Partial<{ autoPublish: boolean; preferDirectPublish: boolean }>,
) {
  return tiktokFetch<{ ok: boolean; settings: TikTokConnectionStatus['settings'] }>(
    token,
    '/social/tiktok/settings',
    { method: 'PATCH', body: JSON.stringify(body) },
  );
}

export async function nestTikTokDisconnect(token: string) {
  return tiktokFetch<{ ok: boolean }>(token, '/social/tiktok/disconnect', { method: 'POST' });
}

export async function nestTikTokTestConnection(token: string) {
  return tiktokFetch<{ ok: boolean; message: string; creatorUsername?: string }>(
    token,
    '/social/tiktok/test-connection',
    { method: 'POST' },
  );
}

export async function nestTikTokListJobs(token: string, status?: string) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  const data = await tiktokFetch<{ items: TikTokPublishJobRow[] }>(
    token,
    `/social/tiktok/jobs${qs}`,
  );
  return data?.items ?? [];
}

export async function nestTikTokCreateJob(token: string, listingId: string) {
  return tiktokFetch<{ ok: boolean; jobId: string }>(token, '/social/tiktok/jobs', {
    method: 'POST',
    body: JSON.stringify({ listingId }),
  });
}

export async function nestTikTokRetryJob(token: string, jobId: string) {
  return tiktokFetch<{ ok: boolean }>(token, `/social/tiktok/jobs/${encodeURIComponent(jobId)}/retry`, {
    method: 'POST',
  });
}

export async function nestTikTokCancelJob(token: string, jobId: string) {
  return tiktokFetch<{ ok: boolean }>(
    token,
    `/social/tiktok/jobs/${encodeURIComponent(jobId)}`,
    { method: 'DELETE' },
  );
}

export async function nestTikTokListingStatus(token: string, listingId: string) {
  return tiktokFetch<{
    listingId: string;
    status: string;
    publishedAt: string | null;
    tiktokVideoUrl: string | null;
    errorMessage: string | null;
    isDraftInbox: boolean;
    jobs: TikTokPublishJobRow[];
  }>(token, `/social/tiktok/listings/${encodeURIComponent(listingId)}/status`);
}

export async function nestTikTokDemoListings(token: string) {
  const data = await tiktokFetch<{
    items: Array<{
      id: string;
      title: string;
      city: string;
      propertyType: string;
      offerType: string;
      videoUrl: string | null;
    }>;
  }>(token, '/social/tiktok/demo/listings');
  return data?.items ?? [];
}

export const TIKTOK_JOB_STATUS_LABELS: Record<string, string> = {
  WAITING: 'Čeká',
  UPLOADING: 'Nahrává se',
  UPLOADED: 'Úspěšné',
  FAILED: 'Chyba',
  NEEDS_REAUTH: 'Vyžaduje připojení',
};
