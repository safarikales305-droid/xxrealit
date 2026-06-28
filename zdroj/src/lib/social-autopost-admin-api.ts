import { API_BASE_URL } from '@/lib/api';

export type SocialApiLogEntry = {
  at: string;
  action: string;
  ok: boolean;
  statusCode?: number;
  body: unknown;
};

export type FacebookAutopostSettingsPublic = {
  enabled: boolean;
  pageId: string;
  pageName: string;
  tokenExpiresAt: string | null;
  publishPosts: boolean;
  publishProperties: boolean;
  publishShorts: boolean;
  approvedOnly: boolean;
  publicPostsOnly: boolean;
  professionalsOnly: boolean;
  allowedRoles: string[];
  connected: boolean;
  maskedToken: string | null;
  tokenSet: boolean;
};

export type SocialAutopostSettingsPublic = {
  facebook: FacebookAutopostSettingsPublic;
  instagram: { enabled: boolean };
  youtube: { enabled: boolean };
  tiktok: { enabled: boolean };
  lastApiResponses: SocialApiLogEntry[];
};

export type SocialQueueRow = {
  id: string;
  platform: string;
  contentType: string;
  contentId: string;
  contentTitle: string;
  status: string;
  attempts: number;
  lastError: string | null;
  publishedUrl: string | null;
  externalPostId: string | null;
  createdAt: string;
  updatedAt: string;
  processedAt: string | null;
  author?: { id: string; name: string | null; role: string } | null;
};

async function adminFetch<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<T | null> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
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

export function nestAdminSocialAutopostSettingsGet(token: string) {
  return adminFetch<SocialAutopostSettingsPublic>(token, '/social/autopost/admin/settings');
}

export function nestAdminSocialAutopostFacebookPatch(
  token: string,
  body: Record<string, unknown>,
) {
  return adminFetch<SocialAutopostSettingsPublic>(token, '/social/autopost/admin/settings/facebook', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function nestAdminSocialAutopostTestConnection(token: string) {
  return adminFetch<{ ok: boolean; pageName?: string; error?: string }>(
    token,
    '/social/autopost/admin/facebook/test-connection',
    { method: 'POST' },
  );
}

export function nestAdminSocialAutopostTestPublish(token: string) {
  return adminFetch<{ externalPostId: string; publishedUrl: string }>(
    token,
    '/social/autopost/admin/facebook/test-publish',
    { method: 'POST' },
  );
}

export function nestAdminSocialQueueList(token: string, status?: string) {
  const q = status ? `?status=${encodeURIComponent(status)}` : '';
  return adminFetch<{ items: SocialQueueRow[] }>(token, `/social/autopost/admin/queue${q}`);
}

export function nestAdminSocialEnqueue(
  token: string,
  body: { contentType: 'POST' | 'PROPERTY' | 'SHORT'; contentId: string; force?: boolean },
) {
  return adminFetch<{ ok: boolean; queueId?: string; skipped?: boolean; reason?: string; error?: string }>(
    token,
    '/social/autopost/admin/enqueue',
    { method: 'POST', body: JSON.stringify(body) },
  );
}

export function nestAdminSocialQueueRetry(token: string, id: string) {
  return adminFetch(token, `/social/autopost/admin/queue/${encodeURIComponent(id)}/retry`, {
    method: 'POST',
  });
}

export function nestAdminSocialQueueSkip(token: string, id: string) {
  return adminFetch(token, `/social/autopost/admin/queue/${encodeURIComponent(id)}/skip`, {
    method: 'POST',
  });
}

export const SOCIAL_PUBLISH_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Čeká',
  PROCESSING: 'Zpracovává se',
  PUBLISHED: 'Publikováno',
  FAILED: 'Chyba',
  SKIPPED: 'Přeskočeno',
};

export const SOCIAL_CONTENT_TYPE_LABELS: Record<string, string> = {
  POST: 'Příspěvek',
  PROPERTY: 'Inzerát',
  SHORT: 'Shorts',
};

export const USER_ROLE_LABELS: Record<string, string> = {
  USER: 'Uživatel',
  AGENT: 'Makléř',
  COMPANY: 'Firma',
  AGENCY: 'Kancelář',
  FINANCIAL_ADVISOR: 'Poradce',
  INVESTOR: 'Investor',
  DEVELOPER: 'Developer',
  PRIVATE_SELLER: 'Soukromý prodejce',
  CRAFTSMAN: 'Řemeslník',
  TIPSTER: 'Tipař',
  ADMIN: 'Admin',
  PORTAL_WORKER: 'Pracovník portálu',
  PROPERTY_SEEKER: 'Hledající',
};
