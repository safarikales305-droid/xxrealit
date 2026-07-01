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
  /** Alias pro enabled — ukládá se jako facebook.enabled v DB. */
  facebookEnabled?: boolean;
  pageId: string;
  pageName: string;
  tokenExpiresAt: string | null;
  tokenObtainedAt?: string | null;
  tokenLastUsedAt?: string | null;
  tokenScopes?: string[];
  tokenWarning?: string | null;
  connectedViaOAuth?: boolean;
  publishPosts: boolean;
  publishProperties: boolean;
  publishShorts: boolean;
  publishShortsAsReels?: boolean;
  publishPostVideosAsReels?: boolean;
  reelsFallbackToVideoPost?: boolean;
  reelsFallbackToPhotoPost?: boolean;
  approvedOnly: boolean;
  publicPostsOnly: boolean;
  professionalsOnly: boolean;
  allowedRoles: string[];
  repeatPublishing?: boolean;
  connected: boolean;
  maskedToken: string | null;
  tokenSet: boolean;
};

export type SocialAutopostGlobalSettings = {
  autoPublishNewListings: boolean;
  autoPublishNewPosts: boolean;
  publishShortsAsReels: boolean;
  publishClassicAsPhotoPost: boolean;
  hidePublicPrice: boolean;
  repeatPublishingEnabled: boolean;
  videoTeaserMaxSeconds: number;
  videoTeaserEndSlideText: string;
  videoTeaserEndSlideEnabled: boolean;
  publishVideosAsReels: boolean;
  publishImagesAsPhotoPost: boolean;
  fallbackToLinkOnMediaFailure: boolean;
  socialVideoUsePortalTeaserRule: boolean;
  socialVideoTeaserSeconds: number | null;
  socialVideoPublishFull: boolean;
};

export type PlatformPlaceholderSettings = {
  enabled: boolean;
  publishListings?: boolean;
  publishPosts?: boolean;
  publishShortsAsReels?: boolean;
  repeatPublishing?: boolean;
  preparedForFuture?: boolean;
};

export type SocialAutopostSettingsPublic = {
  global: SocialAutopostGlobalSettings;
  facebook: FacebookAutopostSettingsPublic;
  instagram: PlatformPlaceholderSettings;
  youtube: PlatformPlaceholderSettings;
  tiktok: PlatformPlaceholderSettings;
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
  results?: Array<{
    propertyId: string;
    ok: boolean;
    error?: string;
    skipped?: boolean;
    reason?: string;
    publishedUrl?: string;
    externalPostId?: string;
  }>;
};

/** V prohlížeči same-origin proxy (bez CORS); na serveru přímé Nest API. */
function resolveSocialAdminApiUrl(nestPath: string): string {
  const path = nestPath.startsWith('/') ? nestPath : `/${nestPath}`;
  if (typeof window !== 'undefined') {
    const origin = window.location.origin.replace(/\/+$/, '');
    if (path === '/social/autopost/admin/properties/publish-now') {
      return `${origin}/api/facebook/post`;
    }
    if (path === '/social/autopost/admin/facebook/test-publish') {
      return `${origin}/api/facebook/post`;
    }
    if (path === '/social/autopost/admin/facebook/test-connection') {
      return `${origin}/api/facebook/test-connection`;
    }
    const prefix = '/social/autopost/admin';
    if (path.startsWith(prefix)) {
      return `${origin}/api/facebook/autopost${path.slice(prefix.length)}`;
    }
  }
  if (!API_BASE_URL) return path;
  return `${API_BASE_URL}${path}`;
}

async function adminFetch<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<T | null> {
  const url = resolveSocialAdminApiUrl(path);
  const res = await fetch(url, {
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
  const url = resolveSocialAdminApiUrl(path);
  const res = await fetch(url, {
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

export async function nestAdminFacebookAutopostConnectUrl(token: string): Promise<string | null> {
  const url = `${resolveSocialAdminApiUrl('/social/autopost/admin/facebook/connect')}?format=json`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { url?: string };
  return data.url ?? null;
}

export function nestAdminFacebookAutopostListPages(token: string) {
  return adminFetch<{ ok: boolean; pages: Array<{ id: string; name: string; picture?: string | null }>; error?: string }>(
    token,
    '/social/autopost/admin/facebook/pages',
  );
}

export function nestAdminFacebookAutopostSelectPage(token: string, pageId: string) {
  return adminFetchJson<{ ok: boolean; pageId?: string; pageName?: string; error?: string }>(
    token,
    '/social/autopost/admin/facebook/select-page',
    { method: 'POST', body: JSON.stringify({ pageId }) },
  ).then(({ data, status, body }) => {
    if (data) return data;
    const err = body as { message?: string; error?: string };
    return {
      ok: false,
      error: typeof err?.error === 'string' ? err.error : `HTTP ${status}`,
    };
  });
}

export function nestAdminFacebookAutopostRefreshToken(token: string) {
  return adminFetchJson<{ ok: boolean; error?: string }>(
    token,
    '/social/autopost/admin/facebook/refresh-token',
    { method: 'POST' },
  ).then(({ data, status, body }) => {
    if (data) return data;
    const err = body as { error?: string };
    return { ok: false, error: err?.error ?? `HTTP ${status}` };
  });
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

export function nestAdminSocialAutopostGlobalPatch(
  token: string,
  body: Partial<SocialAutopostGlobalSettings>,
) {
  return adminFetch<SocialAutopostSettingsPublic>(token, '/social/autopost/admin/settings/global', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export type SocialPublishTemplateRole =
  | 'AGENT'
  | 'COMPANY'
  | 'AGENCY'
  | 'FINANCIAL_ADVISOR'
  | 'INVESTOR'
  | 'PRIVATE_SELLER';

export type SocialPublishTemplatesSettings = Record<SocialPublishTemplateRole, string>;

export const SOCIAL_PUBLISH_TEMPLATE_ROLE_LABELS: Record<SocialPublishTemplateRole, string> = {
  AGENT: 'Makléř',
  COMPANY: 'Stavební firma',
  AGENCY: 'Realitní kancelář',
  FINANCIAL_ADVISOR: 'Finanční poradce',
  INVESTOR: 'Investor',
  PRIVATE_SELLER: 'Soukromý prodejce',
};

export function nestAdminSocialPublishTemplatesGet(token: string) {
  return adminFetch<SocialPublishTemplatesSettings>(token, '/social/autopost/admin/templates');
}

export function nestAdminSocialPublishTemplatesPatch(
  token: string,
  body: Partial<SocialPublishTemplatesSettings>,
) {
  return adminFetch<SocialPublishTemplatesSettings>(token, '/social/autopost/admin/templates', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function nestAdminSocialAutopostPlatformPatch(
  token: string,
  platform: 'instagram' | 'youtube' | 'tiktok',
  body: Partial<PlatformPlaceholderSettings>,
) {
  return adminFetch<SocialAutopostSettingsPublic>(
    token,
    `/social/autopost/admin/settings/${platform}`,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
  );
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
    { method: 'POST', body: JSON.stringify({ test: true }) },
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
  facebookPostType?: string | null;
  publishKind?: string | null;
  contentTitle?: string | null;
  externalPostId: string | null;
  externalReelId?: string | null;
  publishedUrl: string | null;
  reelPublishedUrl?: string | null;
  teaserDurationSec?: number | null;
  originalVideoDurationSec?: number | null;
  introVideoUsed?: boolean | null;
  introVideoPropertyType?: string | null;
  introVideoDurationSec?: number | null;
  totalReelDurationSec?: number | null;
  introVideoError?: string | null;
  lastError: string | null;
  lastApiResponse?: unknown;
  processedAt?: string | null;
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
  body: { propertyIds: string[]; force?: boolean; publishAsReel?: boolean },
) {
  return adminFetchJson<{
    results: Array<{
      propertyId: string;
      ok: boolean;
      error?: string;
      skipped?: boolean;
      reason?: string;
      publishedUrl?: string;
      externalPostId?: string;
    }>;
  }>(token, '/social/autopost/admin/properties/publish-now', {
    method: 'POST',
    body: JSON.stringify(body),
  }).then(({ data, status, body: errBody }) => {
    if (data) return data;
    const err = errBody as { message?: string; error?: string };
    const msg =
      typeof err?.message === 'string'
        ? err.message
        : typeof err?.error === 'string'
          ? err.error
          : `HTTP ${status}`;
    return {
      results: body.propertyIds.map((propertyId) => ({
        propertyId,
        ok: false,
        error: msg,
      })),
    };
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
    shortsPublishAsReel?: boolean | null;
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

export const FACEBOOK_POST_TYPE_LABELS: Record<string, string> = {
  FACEBOOK_POST: 'Příspěvek',
  FACEBOOK_VIDEO: 'Video',
  FACEBOOK_REEL: 'Reel',
};

export const PROPERTY_FACEBOOK_STATUS_LABELS: Record<PropertyFacebookDisplayStatus, string> = {
  NOT_PUBLISHED: 'Nepublikováno',
  SCHEDULED: 'Naplánováno',
  PUBLISHED: 'Publikováno',
  REPEAT_ACTIVE: 'Opakování aktivní',
  ERROR: 'Chyba',
};

export const SOCIAL_PUBLISH_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Čeká na publikování',
  UPLOADING: 'Nahrává se',
  PROCESSING: 'Zpracovává se',
  PUBLISHED: 'Publikováno',
  FAILED: 'Chyba',
  SKIPPED: 'Přeskočeno',
};

export const POST_SOCIAL_PLATFORM_LABELS: Record<string, string> = {
  FACEBOOK: 'Facebook',
  INSTAGRAM: 'Instagram',
  TIKTOK: 'TikTok',
  YOUTUBE: 'YouTube',
};

export const POST_SOCIAL_PUBLISH_TYPE_LABELS: Record<string, string> = {
  POST: 'Běžný příspěvek',
  REEL: 'Reel',
  SHORT: 'Short',
};

export const SOCIAL_TRIGGER_SOURCE_LABELS: Record<string, string> = {
  MANUAL: 'Ruční',
  SCHEDULE: 'Plán',
  AUTO: 'Automatické',
};

export const SOCIAL_REPEAT_TYPE_LABELS: Record<SocialPublishRepeatType, string> = {
  NONE: 'Jednou',
  DAILY: 'Každý den',
  WEEKLY: 'Jednou týdně',
  BIWEEKLY: 'Jednou za 14 dní',
  MONTHLY: 'Jednou měsíčně',
  CUSTOM_DAYS: 'Vlastní interval',
};

export type SchedulePlannerDisplayStatus =
  | 'WAITING'
  | 'PUBLISHED'
  | 'RUNNING'
  | 'REPEATING'
  | 'FAILED'
  | 'PAUSED';

export const SCHEDULE_PLANNER_STATUS_LABELS: Record<SchedulePlannerDisplayStatus, string> = {
  WAITING: 'Čeká',
  PUBLISHED: 'Publikováno',
  RUNNING: 'Probíhá',
  REPEATING: 'Opakované',
  FAILED: 'Selhalo',
  PAUSED: 'Pozastaveno',
};

export const SCHEDULE_PLANNER_STATUS_EMOJI: Record<SchedulePlannerDisplayStatus, string> = {
  WAITING: '🟡',
  PUBLISHED: '🟢',
  RUNNING: '🔵',
  REPEATING: '🟠',
  FAILED: '🔴',
  PAUSED: '⚫',
};

export type SchedulePlannerRow = {
  id: string;
  propertyId: string;
  propertyTitle: string;
  publishType: string;
  publishTypeKey: string | null;
  planCreatedAt: string;
  scheduledAt: string;
  repeatType: SocialPublishRepeatType;
  repeatIntervalDays: number | null;
  repeatUntil: string | null;
  maxRuns: number | null;
  runCount: number;
  lastPublishedAt: string | null;
  lastRunAt: string | null;
  nextRunAt: string;
  enabled: boolean;
  displayStatus: SchedulePlannerDisplayStatus;
  countdown: string;
  lastError: string | null;
  author: { id: string; name: string | null; email: string } | null;
  facebookPageId: string;
  facebookPageName: string;
  requireActive: boolean;
  requireApproved: boolean;
  shortsPublishAsReel: boolean | null;
  queue: {
    status: string;
    publishedUrl: string | null;
    externalPostId: string | null;
    lastError: string | null;
  } | null;
};

export type SchedulePlannerDashboard = {
  scheduledToday: number;
  scheduledThisWeek: number;
  waiting: number;
  publishedToday: number;
  failed: number;
  reels: number;
  posts: number;
};

export type SchedulePlannerDetail = {
  schedule: SchedulePlannerRow;
  history: PropertyPublishLogRow[];
  schedulerTicks: Array<{
    id: string;
    checkedAt: string;
    source: string;
    dueCount: number;
    publishedCount: number;
    failedCount: number;
    skippedCount: number;
    details: unknown;
  }>;
};

export function nestAdminSchedulesList(token: string) {
  return adminFetch<{ items: SchedulePlannerRow[]; dashboard: SchedulePlannerDashboard }>(
    token,
    '/social/autopost/admin/schedules',
  );
}

export function nestAdminScheduleDetail(token: string, scheduleId: string) {
  return adminFetch<SchedulePlannerDetail>(
    token,
    `/social/autopost/admin/schedules/${encodeURIComponent(scheduleId)}`,
  );
}

export function nestAdminScheduleUpdate(
  token: string,
  scheduleId: string,
  body: {
    firstRunAt: string;
    repeatType: SocialPublishRepeatType;
    repeatIntervalDays?: number | null;
    repeatUntil?: string | null;
    maxRuns?: number | null;
    requireActive?: boolean;
    requireApproved?: boolean;
    shortsPublishAsReel?: boolean | null;
    resetRunCount?: boolean;
  },
) {
  return adminFetch<SchedulePlannerDetail>(
    token,
    `/social/autopost/admin/schedules/${encodeURIComponent(scheduleId)}`,
    { method: 'PATCH', body: JSON.stringify(body) },
  );
}

export function nestAdminSchedulePublishNow(token: string, scheduleId: string) {
  return adminFetch<{
    ok: boolean;
    error?: string;
    publishedUrl?: string;
    externalPostId?: string;
  }>(token, `/social/autopost/admin/schedules/${encodeURIComponent(scheduleId)}/publish-now`, {
    method: 'POST',
  });
}

export function nestAdminSchedulePause(token: string, scheduleId: string) {
  return adminFetch<{ ok: boolean }>(
    token,
    `/social/autopost/admin/schedules/${encodeURIComponent(scheduleId)}/pause`,
    { method: 'POST' },
  );
}

export function nestAdminScheduleResume(token: string, scheduleId: string) {
  return adminFetch<{ ok: boolean; nextRunAt?: string }>(
    token,
    `/social/autopost/admin/schedules/${encodeURIComponent(scheduleId)}/resume`,
    { method: 'POST' },
  );
}

export function nestAdminScheduleDelete(token: string, scheduleId: string) {
  return adminFetch<{ ok: boolean }>(
    token,
    `/social/autopost/admin/schedules/${encodeURIComponent(scheduleId)}`,
    { method: 'DELETE' },
  );
}

export type PostSocialPublishRow = {
  id: string;
  postId: string;
  platform: string;
  publishType: string;
  status: string;
  externalId: string | null;
  externalUrl: string | null;
  errorMessage: string | null;
  videoPreviewSeconds: number | null;
  publishedAt: string | null;
};

export function nestAdminPostSocialPublishStatus(token: string, postId: string) {
  return adminFetch<{
    ok: boolean;
    post?: unknown;
    platforms?: PostSocialPublishRow[];
    queue?: unknown;
    logs?: unknown[];
    error?: string;
  }>(token, `/social/autopost/admin/posts/${encodeURIComponent(postId)}/social-publish`);
}

export function nestAdminPostsPublishNow(
  token: string,
  postIds: string[],
  opts?: { force?: boolean; publishAsReel?: boolean },
) {
  return adminFetch<{ ok: boolean; results: unknown[] }>(
    token,
    '/social/autopost/admin/posts/publish-now',
    {
      method: 'POST',
      body: JSON.stringify({
        postIds,
        force: opts?.force ?? true,
        publishAsReel: opts?.publishAsReel,
      }),
    },
  );
}

export type SocialIntroVideoRow = {
  id: string;
  title: string;
  propertyType: string;
  videoUrl: string;
  thumbnailUrl?: string | null;
  durationSeconds?: number | null;
  active: boolean;
  priority: number;
  createdAt: string;
  updatedAt: string;
};

export const SOCIAL_INTRO_PROPERTY_TYPE_LABELS: Record<string, string> = {
  BYT: 'Byt',
  DUM: 'Dům',
  POZEMEK: 'Pozemek',
  KOMERCNI: 'Komerční prostor',
  GARAZ: 'Garáž',
  NOVOSTAVBA: 'Novostavba',
  PRONAJEM: 'Pronájem',
  OSTATNI: 'Ostatní',
};

export async function nestAdminListIntroVideos(token: string) {
  return adminFetch<{ items?: SocialIntroVideoRow[] } | SocialIntroVideoRow[]>(
    token,
    '/social/autopost/admin/intro-videos',
  ).then((data) => (Array.isArray(data) ? data : []));
}

export async function nestAdminCreateIntroVideo(
  token: string,
  form: FormData,
): Promise<{ ok: boolean; item?: SocialIntroVideoRow; error?: string }> {
  const res = await fetch(resolveSocialAdminApiUrl('/social/autopost/admin/intro-videos'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = (data as { message?: string | string[] }).message;
    const errorText = Array.isArray(message) ? message.join(' ') : message;
    return { ok: false, error: errorText ?? 'Nahrání selhalo' };
  }
  return { ok: true, item: (data as { item: SocialIntroVideoRow }).item };
}

export async function nestAdminUpdateIntroVideo(
  token: string,
  id: string,
  body: Partial<{
    title: string;
    propertyType: string;
    active: boolean;
    priority: number;
    thumbnailUrl: string | null;
    durationSeconds: number | null;
  }>,
) {
  return adminFetchJson<{ ok: boolean; item: SocialIntroVideoRow }>(
    token,
    `/social/autopost/admin/intro-videos/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify(body) },
  );
}

export async function nestAdminReplaceIntroVideo(
  token: string,
  id: string,
  form: FormData,
): Promise<{ ok: boolean; item?: SocialIntroVideoRow; error?: string }> {
  const res = await fetch(
    resolveSocialAdminApiUrl(`/social/autopost/admin/intro-videos/${encodeURIComponent(id)}/video`),
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = (data as { message?: string | string[] }).message;
    const errorText = Array.isArray(message) ? message.join(' ') : message;
    return { ok: false, error: errorText ?? 'Nahrání selhalo' };
  }
  return { ok: true, item: (data as { item: SocialIntroVideoRow }).item };
}

export async function nestAdminDeleteIntroVideo(token: string, id: string) {
  return adminFetchJson<{ ok: boolean }>(
    token,
    `/social/autopost/admin/intro-videos/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );
}

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
