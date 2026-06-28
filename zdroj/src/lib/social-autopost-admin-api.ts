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

export type FacebookGraphErrorPublic = {
  httpStatus?: number;
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
  userMessage?: string;
  hint?: string;
};

export type FacebookTestConnectionResponse = {
  ok: boolean;
  pageName?: string;
  pageId?: string;
  tokenSource?: string;
  maskedToken?: string | null;
  error?: string;
  hint?: string;
  graphError?: FacebookGraphErrorPublic;
};

export type FacebookTestPublishResponse = {
  ok: boolean;
  externalPostId?: string;
  publishedUrl?: string;
  tokenSource?: string;
  error?: string;
  hint?: string;
  graphError?: FacebookGraphErrorPublic;
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

async function adminFetchJson<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<{ data: T | null; status: number; body: unknown }> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });
  const body = (await res.json().catch(() => ({}))) as unknown;
  if (!res.ok) {
    return { data: null, status: res.status, body };
  }
  return { data: body as T, status: res.status, body };
}

function formatGraphErrorDetail(graph?: FacebookGraphErrorPublic): string {
  if (!graph) return '';
  const parts = [
    graph.userMessage ?? graph.message,
    graph.code != null ? `kód ${graph.code}` : null,
    graph.error_subcode != null ? `subkód ${graph.error_subcode}` : null,
    graph.type ? `typ ${graph.type}` : null,
    graph.fbtrace_id ? `fbtrace_id ${graph.fbtrace_id}` : null,
  ].filter(Boolean);
  return parts.join(' · ');
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
  return adminFetch<FacebookTestConnectionResponse>(
    token,
    '/social/autopost/admin/facebook/test-connection',
    { method: 'POST' },
  );
}

export async function nestAdminSocialAutopostTestPublish(
  token: string,
): Promise<FacebookTestPublishResponse & { httpError?: string }> {
  const { data, status, body } = await adminFetchJson<FacebookTestPublishResponse>(
    token,
    '/social/autopost/admin/facebook/test-publish',
    { method: 'POST' },
  );
  if (data) return data;
  const errBody = body as { message?: string; error?: string };
  const msg =
    typeof errBody?.message === 'string'
      ? errBody.message
      : typeof errBody?.error === 'string'
        ? errBody.error
        : `HTTP ${status}`;
  return { ok: false, error: msg, httpError: msg };
}

export { formatGraphErrorDetail };

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
