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

export type PropertyFacebookDisplayStatus =
  | 'NOT_PUBLISHED'
  | 'SCHEDULED'
  | 'PUBLISHED'
  | 'REPEAT_ACTIVE'
  | 'ERROR';

export type PropertyFacebookStatusItem = {
  propertyId: string;
  status: PropertyFacebookDisplayStatus;
  schedule: {
    id: string;
    enabled: boolean;
    nextRunAt: string;
    repeatType: string;
    repeatIntervalDays: number | null;
    repeatUntil: string | null;
    maxRuns: number | null;
    runCount: number;
    lastRunAt: string | null;
    lastStatus: string | null;
    lastError: string | null;
  } | null;
  queue: {
    id: string;
    status: string;
    publishedUrl: string | null;
    externalPostId: string | null;
    lastError: string | null;
  } | null;
};

export type PropertyPublishLogRow = {
  id: string;
  platform: string;
  contentType: string;
  contentId: string;
  status: string;
  externalPostId: string | null;
  publishedUrl: string | null;
  lastError: string | null;
  triggerSource: string;
  createdAt: string;
  triggeredBy?: { id: string; name: string | null; email: string } | null;
};

export type SocialPublishRepeatType =
  | 'NONE'
  | 'DAILY'
  | 'WEEKLY'
  | 'BIWEEKLY'
  | 'MONTHLY'
  | 'CUSTOM_DAYS';

export function nestAdminPropertyFacebookStatus(token: string, propertyIds: string[]) {
  if (propertyIds.length === 0) return Promise.resolve({ items: [] as PropertyFacebookStatusItem[] });
  const q = encodeURIComponent(propertyIds.join(','));
  return adminFetch<{ items: PropertyFacebookStatusItem[] }>(
    token,
    `/social/autopost/admin/properties/facebook-status?ids=${q}`,
  );
}

export function nestAdminPropertyPublishNow(
  token: string,
  body: { propertyIds: string[]; force?: boolean },
) {
  return adminFetch<{
    results: Array<{ propertyId: string; ok: boolean; error?: string; skipped?: boolean; reason?: string }>;
  }>(token, '/social/autopost/admin/properties/publish-now', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function nestAdminPropertySchedule(
  token: string,
  body: {
    propertyIds: string[];
    firstRunAt: string;
    repeatType: SocialPublishRepeatType;
    repeatIntervalDays?: number | null;
    repeatUntil?: string | null;
    maxRuns?: number | null;
    requireActive?: boolean;
    requireApproved?: boolean;
  },
) {
  return adminFetch<{
    results: Array<{ propertyId: string; ok: boolean; scheduleId?: string; error?: string }>;
  }>(token, '/social/autopost/admin/properties/schedule', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function nestAdminPropertyScheduleCancel(token: string, propertyIds: string[]) {
  return adminFetch<{
    results: Array<{ propertyId: string; ok: boolean; error?: string }>;
  }>(token, '/social/autopost/admin/properties/schedule/cancel', {
    method: 'POST',
    body: JSON.stringify({ propertyIds }),
  });
}

export function nestAdminPropertyPublishLog(token: string, propertyId: string) {
  return adminFetch<{ items: PropertyPublishLogRow[] }>(
    token,
    `/social/autopost/admin/properties/${encodeURIComponent(propertyId)}/publish-log`,
  );
}

export const PROPERTY_FACEBOOK_STATUS_LABELS: Record<PropertyFacebookDisplayStatus, string> = {
  NOT_PUBLISHED: 'Nepublikováno',
  SCHEDULED: 'Naplánováno',
  PUBLISHED: 'Publikováno',
  REPEAT_ACTIVE: 'Opakování aktivní',
  ERROR: 'Chyba',
};

export const SOCIAL_PUBLISH_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Čeká',
  PROCESSING: 'Zpracovává se',
  PUBLISHED: 'Publikováno',
  FAILED: 'Chyba',
  SKIPPED: 'Přeskočeno',
};

export const SOCIAL_TRIGGER_SOURCE_LABELS: Record<string, string> = {
  MANUAL: 'Ruční',
  SCHEDULE: 'Plán',
  AUTO: 'Automatické',
};

export const SOCIAL_REPEAT_TYPE_LABELS: Record<SocialPublishRepeatType, string> = {
  NONE: 'Bez opakování',
  DAILY: 'Každý den',
  WEEKLY: 'Jednou týdně',
  BIWEEKLY: 'Jednou za 14 dní',
  MONTHLY: 'Jednou měsíčně',
  CUSTOM_DAYS: 'Vlastní interval',
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
