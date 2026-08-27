import { API_BASE_URL } from './api';

export type NewsArticleCategory =
  | 'reality'
  | 'hypoteky'
  | 'bydleni'
  | 'ceny-nemovitosti'
  | 'najmy'
  | 'stavebnictvi'
  | 'development'
  | 'katastr'
  | 'legislativa'
  | 'energetika'
  | 'rekonstrukce'
  | 'investice'
  | 'trh'
  | 'regiony'
  | 'ubytovani';

export type NewsArticleStatus =
  | 'DRAFT'
  | 'REVIEW'
  | 'SCHEDULED'
  | 'PUBLISHED'
  | 'REJECTED'
  | 'ARCHIVED';

export type NewsPublishMode = 'MANUAL' | 'AFTER_APPROVAL' | 'AUTOMATIC';

export type NewsSourceType = 'RSS' | 'ATOM' | 'API' | 'OPEN_DATA' | 'WEB_SOURCE' | 'YOUTUBE_CHANNEL';

export type NewsYoutubePublishMode = 'RELEVANT_ONLY' | 'ALL';

export type NewsSourceHealth = 'ACTIVE' | 'DEGRADED' | 'ERROR' | 'DISABLED';

export type NewsAutomationSettings = {
  enabled: boolean;
  autoFetchSources: boolean;
  autoAiProcessing: boolean;
  autoPublishArticles: boolean;
  fetchIntervalMinutes: number;
  publishMode: NewsPublishMode;
  minArticlesPerDay: number;
  maxArticlesPerDay: number;
  maxArticlesPerSourcePerDay: number;
  minRelevanceScore: number;
  publishTimes: string[];
  minMinutesBetweenArticles: number;
  autoPublishMinQuality: number;
  minLanguageQuality: number;
  createPortalPost: boolean;
  createFacebookPost: boolean;
  portalPostAuthorLabel: string;
  addHashtags: boolean;
  maxTeaserLength: number;
  defaultOgImageUrl?: string;
  youtubeMonitoringEnabled: boolean;
  youtubeCheckIntervalMinutes: number;
  youtubeMaxPostsPerDay: number;
  youtubeMinRelevance: number;
  youtubeCreatePortalPost: boolean;
  youtubeCreateFacebookPost: boolean;
  youtubeUseAiTeaser?: boolean;
  youtubeInitialSyncVideos?: number;
  youtubeInitialSyncIgnoreRelevance?: boolean;
  facebookLinkTargetPortalPost?: 'PORTAL_DETAIL' | 'SOURCE' | 'YOUTUBE_ORIGINAL' | 'ARTICLE_DETAIL';
  facebookLinkTargetNewsArticle?: 'PORTAL_DETAIL' | 'SOURCE' | 'YOUTUBE_ORIGINAL' | 'ARTICLE_DETAIL';
  facebookLinkTargetYoutube?: 'PORTAL_DETAIL' | 'SOURCE' | 'YOUTUBE_ORIGINAL' | 'ARTICLE_DETAIL';
  facebookPostTemplate?: string;
  facebookYoutubePostTemplate?: string;
  facebookHashtags?: string;
};

export const NEWS_CATEGORY_LABELS: Record<NewsArticleCategory, string> = {
  reality: 'Reality',
  hypoteky: 'Hypotéky',
  bydleni: 'Bydlení',
  'ceny-nemovitosti': 'Ceny nemovitostí',
  najmy: 'Nájmy',
  stavebnictvi: 'Stavebnictví',
  development: 'Development',
  katastr: 'Katastr nemovitostí',
  legislativa: 'Legislativa',
  energetika: 'Energetika',
  rekonstrukce: 'Rekonstrukce',
  investice: 'Investice',
  trh: 'Realitní trh',
  regiony: 'Regionální informace',
  ubytovani: 'Ubytování',
};

export const NEWS_ARTICLE_CATEGORIES = Object.entries(NEWS_CATEGORY_LABELS).map(
  ([value, label]) => ({ value: value as NewsArticleCategory, label }),
);

export type NewsDashboardStats = {
  foundToday: number;
  relevantToday: number;
  aiDrafts: number;
  pendingReview: number;
  publishedToday: number;
  ignoredToday: number;
  duplicateToday: number;
  publishedTotal: number;
};

export type NewsAdminDashboard = {
  enabled: boolean;
  stats: NewsDashboardStats;
  sources: number;
  settings: NewsAutomationSettings;
  categories: Array<{ value: string; label: string }>;
};

export type NewsSourceRow = {
  id: string;
  name: string;
  url: string;
  type: NewsSourceType;
  category: string | null;
  enabled: boolean;
  trustScore: number;
  priority: number;
  language: string;
  checkIntervalMinutes: number;
  note: string | null;
  channelId?: string | null;
  youtubePublishMode?: NewsYoutubePublishMode;
  youtubeCreatePost?: boolean;
  youtubeFacebookPost?: boolean;
  minRelevanceScore?: number | null;
  lastVideoPublishedAt?: string | null;
  lastVideoId?: string | null;
  youtubeImportedCount?: number;
  health: NewsSourceHealth;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  itemsFoundTotal: number;
  failureCount: number;
  stats: {
    itemsToday: number;
    itemsTotal: number;
    duplicatesToday: number;
  };
};

export type NewsArticleSourceLink = {
  id: string;
  sourceName: string;
  sourceUrl: string;
  sourcePublishedAt?: string | null;
  sourceItemId?: string | null;
};

export type NewsArticleRow = {
  id: string;
  slug: string;
  title: string;
  seoTitle: string;
  seoDescription: string;
  perex: string;
  bodyMarkdown?: string;
  bodyHtml?: string | null;
  category: string;
  region?: string | null;
  status: NewsArticleStatus;
  qualityScore?: number | null;
  relevanceScore?: number | null;
  seoScore?: number | null;
  indexable?: boolean;
  robots?: string;
  publishedAt?: string | null;
  scheduledAt?: string | null;
  updatedAt?: string;
  createdAt?: string;
  authorLabel?: string;
  ogImageUrl?: string | null;
  ogImageAlt?: string | null;
  sourcesFooterHtml?: string | null;
  sources?: NewsArticleSourceLink[];
  editorNotes?: string | null;
  rejectedReason?: string | null;
  languageQualityScore?: number | null;
  waitReason?: string | null;
  portalPostId?: string | null;
  schemaJson?: Record<string, unknown> | null;
  topic?: { id: string; title: string; trendScore?: number | null } | null;
};

export type NewsArticleListResponse = {
  items: NewsArticleRow[];
  total: number;
  page: number;
  limit: number;
};

export type NewsPublicArticleCard = {
  id: string;
  slug: string;
  title: string;
  perex: string;
  category: string;
  region?: string | null;
  publishedAt: string | null;
  ogImageUrl?: string | null;
  ogImageAlt?: string | null;
  authorLabel: string;
};

export type NewsPublicListResponse = {
  items: NewsPublicArticleCard[];
  total: number;
  page: number;
  limit: number;
};

export type NewsRelatedResponse = {
  listings: Array<{
    id: string;
    slug: string | null;
    title: string;
    city: string | null;
    price: number | null;
    mainImage: string | null;
  }>;
  posts: Array<{
    id: string;
    slug: string | null;
    seoTitle: string | null;
    content: string | null;
    createdAt: string;
  }>;
  companies: Array<{
    id: string;
    name: string;
    slug: string;
    city: string | null;
    categories: string[];
  }>;
};

export type NewsWorkerStatus = {
  enabled: boolean;
  paused?: boolean;
  online: boolean;
  lastHeartbeatAt: string | null;
  lastError: string | null;
  processing: boolean;
  settings: NewsAutomationSettings;
};

export type NewsAuditLogRow = {
  id: string;
  articleId?: string | null;
  event: string;
  message: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
};

export type AdminFetchResult<T> =
  | { ok: true; data: T; status: number }
  | { ok: false; status: number; message: string };

async function adminFetch<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<T | null> {
  if (!API_BASE_URL) return null;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (init?.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${API_BASE_URL}/admin/news-editorial${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

async function adminFetchResult<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<AdminFetchResult<T>> {
  if (!API_BASE_URL) {
    return { ok: false, status: 0, message: 'API není nakonfigurováno.' };
  }
  const res = await fetch(`${API_BASE_URL}/admin/news-editorial${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });
  let payload: Record<string, unknown> | null = null;
  try {
    payload = (await res.json()) as Record<string, unknown>;
  } catch {
    payload = null;
  }
  if (!res.ok) {
    const rawMessage = payload?.message;
    const message =
      (typeof rawMessage === 'string' && rawMessage) ||
      (Array.isArray(rawMessage) && rawMessage.map(String).join(', ')) ||
      (typeof payload?.error === 'string' && payload.error) ||
      `HTTP ${res.status}`;
    return { ok: false, status: res.status, message };
  }
  return { ok: true, data: (payload ?? {}) as T, status: res.status };
}

export async function nestAdminNewsDashboard(token: string): Promise<NewsAdminDashboard | null> {
  return adminFetch<NewsAdminDashboard>(token, '/dashboard');
}

export async function nestAdminNewsSources(token: string): Promise<NewsSourceRow[] | null> {
  return adminFetch<NewsSourceRow[]>(token, '/sources');
}

export async function nestAdminCreateNewsSource(
  token: string,
  body: {
    name: string;
    url: string;
    type: NewsSourceType;
    category?: string;
    enabled?: boolean;
    trustScore?: number;
    priority?: number;
    checkIntervalMinutes?: number;
    note?: string;
    channelId?: string;
    youtubePublishMode?: NewsYoutubePublishMode;
    youtubeCreatePost?: boolean;
    youtubeFacebookPost?: boolean;
    minRelevanceScore?: number;
  },
): Promise<NewsSourceRow | null> {
  return adminFetch<NewsSourceRow>(token, '/sources', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function nestAdminUpdateNewsSource(
  token: string,
  id: string,
  body: Partial<{
    name: string;
    url: string;
    type: NewsSourceType;
    category: string | null;
    enabled: boolean;
    trustScore: number;
    priority: number;
    checkIntervalMinutes: number;
    note: string | null;
    channelId: string | null;
    youtubePublishMode: NewsYoutubePublishMode;
    youtubeCreatePost: boolean;
    youtubeFacebookPost: boolean;
    minRelevanceScore: number | null;
  }>,
): Promise<NewsSourceRow | null> {
  return adminFetch<NewsSourceRow>(token, `/sources/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function nestAdminDeleteNewsSource(token: string, id: string): Promise<boolean> {
  if (!API_BASE_URL) return false;
  const res = await fetch(`${API_BASE_URL}/admin/news-editorial/sources/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    cache: 'no-store',
  });
  return res.ok;
}

export async function nestAdminNewsSettings(token: string): Promise<NewsAutomationSettings | null> {
  return adminFetch<NewsAutomationSettings>(token, '/settings');
}

export async function nestAdminUpdateNewsSettings(
  token: string,
  body: Partial<NewsAutomationSettings>,
): Promise<NewsAutomationSettings | null> {
  return adminFetch<NewsAutomationSettings>(token, '/settings', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export type NewsFacebookPreview = {
  message: string;
  destinationUrl: string;
  valid: boolean;
  status: 'VALID' | 'INVALID_DESTINATION_URL';
};

export async function nestAdminNewsFacebookPreview(
  token: string,
  postId: string,
): Promise<NewsFacebookPreview | null> {
  return adminFetch<NewsFacebookPreview>(token, '/facebook-preview', {
    method: 'POST',
    body: JSON.stringify({ postId }),
  });
}

export async function nestAdminNewsArticles(
  token: string,
  query?: Record<string, string | number | undefined>,
): Promise<NewsArticleListResponse | null> {
  const params = new URLSearchParams();
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value != null && String(value).length > 0) params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return adminFetch<NewsArticleListResponse>(token, `/articles${qs ? `?${qs}` : ''}`);
}

export async function nestAdminGetNewsArticle(
  token: string,
  id: string,
): Promise<NewsArticleRow | null> {
  return adminFetch<NewsArticleRow>(token, `/articles/${encodeURIComponent(id)}`);
}

export async function nestAdminPublishNewsArticle(
  token: string,
  id: string,
  body?: { force?: boolean },
): Promise<AdminFetchResult<NewsArticleRow>> {
  return adminFetchResult<NewsArticleRow>(token, `/articles/${encodeURIComponent(id)}/publish`, {
    method: 'POST',
    body: JSON.stringify(body ?? {}),
  });
}

export async function nestAdminRejectNewsArticle(
  token: string,
  id: string,
  reason: string,
): Promise<NewsArticleRow | null> {
  return adminFetch<NewsArticleRow>(token, `/articles/${encodeURIComponent(id)}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export async function nestAdminRegenerateNewsArticle(
  token: string,
  id: string,
): Promise<NewsArticleRow | null> {
  return adminFetch<NewsArticleRow>(token, `/articles/${encodeURIComponent(id)}/regenerate`, {
    method: 'POST',
  });
}

export async function nestAdminRunNewsFetch(
  token: string,
): Promise<{ results: unknown[] } | null> {
  return adminFetch<{ results: unknown[] }>(token, '/worker/run-fetch', { method: 'POST' });
}

export async function nestAdminNewsWorker(token: string): Promise<NewsWorkerStatus | null> {
  return adminFetch<NewsWorkerStatus>(token, '/worker');
}

export async function nestAdminCreateNewsFromUrl(
  token: string,
  url: string,
): Promise<AdminFetchResult<NewsArticleRow>> {
  return adminFetchResult<NewsArticleRow>(token, '/articles/from-url', {
    method: 'POST',
    body: JSON.stringify({ url }),
  });
}

export async function nestAdminUpdateNewsArticle(
  token: string,
  id: string,
  body: Partial<{
    title: string;
    seoTitle: string;
    seoDescription: string;
    perex: string;
    bodyMarkdown: string;
    category: string;
    region: string | null;
    status: NewsArticleStatus;
    editorNotes: string | null;
    scheduledAt: string | null;
    indexable: boolean;
    robots: string;
  }>,
): Promise<NewsArticleRow | null> {
  return adminFetch<NewsArticleRow>(token, `/articles/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function nestAdminNewsAuditLog(
  token: string,
  query?: { limit?: number; articleId?: string },
): Promise<NewsAuditLogRow[] | null> {
  const params = new URLSearchParams();
  if (query?.limit) params.set('limit', String(query.limit));
  if (query?.articleId) params.set('articleId', query.articleId);
  const qs = params.toString();
  return adminFetch<NewsAuditLogRow[]>(token, `/audit-log${qs ? `?${qs}` : ''}`);
}

export async function nestPublicNewsArticles(
  query?: Record<string, string | number | undefined>,
): Promise<NewsPublicListResponse | null> {
  if (!API_BASE_URL) return null;
  const params = new URLSearchParams();
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value != null && String(value).length > 0) params.set(key, String(value));
    }
  }
  const qs = params.toString();
  const res = await fetch(`${API_BASE_URL}/news-editorial/articles${qs ? `?${qs}` : ''}`, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return null;
  return (await res.json()) as NewsPublicListResponse;
}

export async function nestPublicNewsArticle(slug: string): Promise<NewsArticleRow | null> {
  if (!API_BASE_URL || !slug.trim()) return null;
  const res = await fetch(`${API_BASE_URL}/news-editorial/articles/${encodeURIComponent(slug.trim())}`, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return null;
  return (await res.json()) as NewsArticleRow;
}

export async function nestPublicNewsRelated(slug: string): Promise<NewsRelatedResponse | null> {
  if (!API_BASE_URL || !slug.trim()) return null;
  const res = await fetch(
    `${API_BASE_URL}/news-editorial/articles/${encodeURIComponent(slug.trim())}/related`,
    { cache: 'no-store', headers: { Accept: 'application/json' } },
  );
  if (!res.ok) return null;
  return (await res.json()) as NewsRelatedResponse;
}

export type NewsRssDiagnostics = {
  ok: boolean;
  errorCode?: string;
  errorMessage?: string;
  requestedUrl: string;
  finalUrl: string;
  redirectCount?: number;
  httpStatus?: number;
  contentType?: string | null;
  responseTimeMs: number;
  encoding?: string | null;
  parser?: string;
  feedTitle?: string | null;
  itemCount: number;
  latestItem?: { title: string; url: string; publishedAt: string | null } | null;
  parserOk: boolean;
  previewItems: Array<{
    title: string;
    url: string;
    publishedAt: string | null;
    description?: string | null;
    imageUrl?: string | null;
    imageDetected?: boolean;
    imageSource?: string | null;
  }>;
};

export type NewsPipelineStep = {
  step: string;
  status: 'OK' | 'FAIL' | 'SKIP' | 'PENDING';
  durationMs?: number;
  detail?: string;
};

export type NewsRssTestResponse = {
  source: { id: string; name: string; url: string; type: string };
  diagnostics: NewsRssDiagnostics;
};

export type NewsRssImportTestResponse = NewsRssTestResponse & {
  steps?: NewsPipelineStep[];
  durationMs?: number;
  sourceItemCreated?: boolean;
  sourceItemId?: string;
  duplicate?: boolean;
  relevanceScore?: number | null;
  draftCreated?: boolean;
  articleId?: string | null;
  pipelineOk?: boolean;
  previewPath?: string | null;
  reason?: string;
};

export async function nestAdminTestNewsRss(
  token: string,
  sourceId: string,
): Promise<AdminFetchResult<NewsRssTestResponse>> {
  return adminFetchResult<NewsRssTestResponse>(token, `/sources/${encodeURIComponent(sourceId)}/test-rss`, {
    method: 'POST',
  });
}

export async function nestAdminTestNewsImportOne(
  token: string,
  sourceId: string,
): Promise<AdminFetchResult<NewsRssImportTestResponse>> {
  return adminFetchResult<NewsRssImportTestResponse>(
    token,
    `/sources/${encodeURIComponent(sourceId)}/test-import-one`,
    { method: 'POST' },
  );
}

export async function nestAdminTestNewsPipeline(
  token: string,
  sourceId: string,
): Promise<AdminFetchResult<NewsRssImportTestResponse>> {
  return adminFetchResult<NewsRssImportTestResponse>(
    token,
    `/sources/${encodeURIComponent(sourceId)}/test-pipeline`,
    { method: 'POST' },
  );
}

export type YoutubeChannelTestResponse = {
  ok: boolean;
  api: 'OK' | 'FAIL' | 'MISSING_KEY';
  apiConfigured?: boolean;
  channelResolution?: 'OK' | 'ERROR';
  error?: string;
  channel?: { id: string; title: string; url: string };
  channelId?: string;
  uploadsPlaylistId?: string;
  lastApiHttp?: number | null;
  lastApiError?: string | null;
  videosReturned?: number;
  recentVideos?: Array<{
    videoId: string;
    title: string;
    publishedAt: string;
    thumbnailOk: boolean;
    embeddable: boolean;
    relevanceScore?: number;
  }>;
  latestVideo?: {
    videoId: string;
    title: string;
    publishedAt: string;
    thumbnailUrl: string;
    embeddable: boolean;
  } | null;
};

export type YoutubeImportTestResponse = {
  ok: boolean;
  videoFound: boolean;
  duplicate: boolean;
  relevanceScore?: number;
  skippedReason?: string;
  forceImportForTest?: boolean;
  portalPostId?: string;
  postId?: string;
  steps: Array<{ step: string; status: 'PASS' | 'FAIL' | 'SKIP'; detail?: string }>;
};

export type YoutubeBackfillResponse = {
  loaded: number;
  found: number;
  duplicates: number;
  lowRelevance: number;
  notEmbeddable: number;
  dailyLimit: number;
  created: number;
  new: number;
  imported: number;
  skipped: number;
  total: number;
  errors: number;
  postsCreated: string[];
  decisions: Array<{
    videoId: string;
    title: string;
    relevanceScore?: number;
    decision: string;
    detail?: string;
    postId?: string;
  }>;
};

export type YoutubeDiagnoseResponse = {
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  health: string;
  lastError: string | null;
  apiConfigured: boolean;
  apiStatus: 'OK' | 'ERROR' | 'MISSING_KEY';
  urlResolved: boolean;
  channelId: string | null;
  channelTitle: string | null;
  uploadsPlaylistId: string | null;
  lastApiHttp: number | null;
  lastApiError: string | null;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  videosReturned: number;
  eligible: number;
  duplicates: number;
  lowRelevance: number;
  imported: number;
  postsCreated: number;
  workerOnline: boolean;
  workerLastHeartbeat: string | null;
  candidates: YoutubeBackfillResponse['decisions'];
};

export type YoutubeAdminStatus = {
  apiConfigured: boolean;
  apiStatus: 'Configured' | 'Missing';
  apiTestStatus?: 'OK' | 'ERROR' | null;
  apiTestHttp?: number | null;
  apiTestResponseTimeMs?: number | null;
  apiTestedAt?: string | null;
  workerRunning: boolean;
  workerLastHeartbeat: string | null;
  queueCount: number;
  sourcesDueForPoll?: number;
  queueStatus?: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    retrying: number;
  };
  youtubeSources: number;
  activeSources: number;
  lastCheck: string | null;
  lastSuccessfulCheck?: string | null;
  currentError?: string | null;
  lastHistoricalError?: string | null;
  lastError: string | null;
  totalImported: number;
  pollingIntervalMinutes?: number;
  systemAuthor?: {
    ok: boolean;
    status: 'OK' | 'ERROR';
    name: string | null;
    userId: string | null;
    error: string | null;
    errorCode: string | null;
  };
};

export type SystemAuthorProfile = {
  ok: boolean;
  errorCode?: string;
  error?: string;
  userId: string | null;
  name: string | null;
  email: string | null;
  avatar: string | null;
  bio: string | null;
  publicProfile: boolean;
  publishedArticles: number;
  publishedVideos: number;
  publishedPosts: number;
  lastPublishedAt: string | null;
};

export type YoutubeApiTestResponse = {
  ok: boolean;
  httpStatus: number;
  responseTimeMs: number;
  testedAt: string;
  apiConfigured: boolean;
  apiKey: string;
  error?: string;
};

export async function nestAdminTestYoutubeChannel(
  token: string,
  sourceId: string,
): Promise<AdminFetchResult<YoutubeChannelTestResponse>> {
  return adminFetchResult<YoutubeChannelTestResponse>(
    token,
    `/sources/${encodeURIComponent(sourceId)}/test-youtube`,
    { method: 'POST' },
  );
}

export async function nestAdminTestYoutubeImportOne(
  token: string,
  sourceId: string,
): Promise<AdminFetchResult<YoutubeImportTestResponse>> {
  return adminFetchResult<YoutubeImportTestResponse>(
    token,
    `/sources/${encodeURIComponent(sourceId)}/test-youtube-import-one`,
    { method: 'POST' },
  );
}

export async function nestAdminTestYoutubePipeline(
  token: string,
  sourceId: string,
): Promise<AdminFetchResult<YoutubeImportTestResponse>> {
  return adminFetchResult<YoutubeImportTestResponse>(
    token,
    `/sources/${encodeURIComponent(sourceId)}/test-youtube-pipeline`,
    { method: 'POST' },
  );
}

export async function nestAdminYoutubeBackfill(
  token: string,
  sourceId: string,
  count = 5,
  ignoreRelevance = false,
): Promise<AdminFetchResult<YoutubeBackfillResponse>> {
  return adminFetchResult<YoutubeBackfillResponse>(
    token,
    `/sources/${encodeURIComponent(sourceId)}/youtube-backfill`,
    { method: 'POST', body: JSON.stringify({ count, ignoreRelevance }) },
  );
}

export async function nestAdminYoutubeDiagnose(
  token: string,
  sourceId: string,
): Promise<AdminFetchResult<YoutubeDiagnoseResponse>> {
  return adminFetchResult<YoutubeDiagnoseResponse>(
    token,
    `/sources/${encodeURIComponent(sourceId)}/youtube-diagnose`,
    { method: 'POST' },
  );
}

export async function nestAdminYoutubeStatus(
  token: string,
): Promise<YoutubeAdminStatus | null> {
  return adminFetch<YoutubeAdminStatus>(token, '/youtube/status');
}

export async function nestAdminTestYoutubeApi(
  token: string,
): Promise<AdminFetchResult<YoutubeApiTestResponse>> {
  return adminFetchResult<YoutubeApiTestResponse>(token, '/youtube/test-api', { method: 'POST' });
}

export async function nestAdminYoutubePollNow(
  token: string,
  sourceId: string,
  opts?: { maxVideos?: number; ignoreRelevance?: boolean },
): Promise<
  AdminFetchResult<{
    sourceId: string;
    created: number;
    skipped: number;
    checked: number;
    found?: number;
    new?: number;
    duplicates?: number;
    message?: string;
  }>
> {
  return adminFetchResult(token, `/sources/${encodeURIComponent(sourceId)}/youtube-poll-now`, {
    method: 'POST',
    body: JSON.stringify(opts ?? {}),
  });
}

export async function nestAdminSystemAuthor(token: string): Promise<SystemAuthorProfile | null> {
  return adminFetch<SystemAuthorProfile>(token, '/system-author');
}

export async function nestAdminUpdateSystemAuthor(
  token: string,
  body: { name?: string; bio?: string | null; avatar?: string | null },
): Promise<SystemAuthorProfile | null> {
  return adminFetch<SystemAuthorProfile>(token, '/system-author', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function nestAdminUploadSystemAuthorAvatar(
  token: string,
  file: File,
): Promise<AdminFetchResult<SystemAuthorProfile>> {
  if (!API_BASE_URL) {
    return { ok: false, status: 0, message: 'API není nakonfigurováno.' };
  }
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${API_BASE_URL}/admin/news-editorial/system-author/avatar`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    body: fd,
    cache: 'no-store',
  });
  const data = (await res.json().catch(() => null)) as SystemAuthorProfile | null;
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      message: (data as { message?: string } | null)?.message ?? `Upload selhal (HTTP ${res.status})`,
    };
  }
  return { ok: true, data: data as SystemAuthorProfile, status: res.status };
}

export async function nestAdminClearSystemAuthorAvatar(
  token: string,
): Promise<SystemAuthorProfile | null> {
  return adminFetch<SystemAuthorProfile>(token, '/system-author/avatar', { method: 'DELETE' });
}

export type NewsMediaRepairResult = {
  checked: number;
  missingImage: number;
  sourceImageAdded: number;
  fallbackAdded: number;
  postMediaFixed: number;
  errors: number;
};

export async function nestAdminRepairNewsMedia(
  token: string,
): Promise<AdminFetchResult<NewsMediaRepairResult>> {
  return adminFetchResult<NewsMediaRepairResult>(token, '/backfill/repair-media', {
    method: 'POST',
  });
}

export async function nestAdminSyncNewsPortalPost(
  token: string,
  articleId: string,
): Promise<AdminFetchResult<Record<string, unknown>>> {
  return adminFetchResult<Record<string, unknown>>(
    token,
    `/articles/${encodeURIComponent(articleId)}/sync-portal-post`,
    { method: 'POST' },
  );
}

export async function nestAdminRepublishNewsFacebook(
  token: string,
  articleId: string,
): Promise<AdminFetchResult<Record<string, unknown>>> {
  return adminFetchResult<Record<string, unknown>>(
    token,
    `/articles/${encodeURIComponent(articleId)}/republish-facebook`,
    { method: 'POST' },
  );
}

export async function nestAdminBackfillNewsImages(
  token: string,
): Promise<AdminFetchResult<{ jobId: string }>> {
  return adminFetchResult<{ jobId: string }>(token, '/backfill/images', { method: 'POST' });
}

export async function nestAdminBackfillNewsPosts(
  token: string,
): Promise<AdminFetchResult<{ jobId: string }>> {
  return adminFetchResult<{ jobId: string }>(token, '/backfill/posts', { method: 'POST' });
}

export type YoutubePostsBackfillResult = {
  importedVideos: number;
  postsExisting: number;
  postsPublished: number;
  postsCreated: number;
  errors: number;
  message: string;
};

export async function nestAdminBackfillYoutubePosts(
  token: string,
): Promise<AdminFetchResult<YoutubePostsBackfillResult>> {
  return adminFetchResult<YoutubePostsBackfillResult>(token, '/backfill/youtube-posts', {
    method: 'POST',
  });
}

export type PortalPostFeedTestResult = {
  entityFound: boolean;
  entityType?: string;
  postCreated: boolean;
  postId: string | null;
  feedQueryFound: boolean;
  publishedAt: string | null;
  articleStatus?: string;
  error?: string;
};

export async function nestAdminTestPortalPostFeed(
  token: string,
  body?: { articleId?: string; youtubeVideoId?: string },
): Promise<AdminFetchResult<PortalPostFeedTestResult>> {
  return adminFetchResult<PortalPostFeedTestResult>(token, '/test-portal-post-feed', {
    method: 'POST',
    body: JSON.stringify(body ?? {}),
  });
}

export type NewsAutomationDiagnostics = {
  settings: NewsAutomationSettings;
  autoPublishEnabled: boolean;
  scheduleWindowOpen: boolean;
  nextPublishSlot: string | null;
  workerOnline: boolean;
  workerLastHeartbeat: string | null;
  eligibleForAuto: number;
  waitingImage: number;
  waitingQuality: number;
  waitingLanguage: number;
  waitingSchedule: number;
  portalPostQueue: number;
};

export type NewsAutoPublishTestResult = {
  published: boolean;
  waitReason?: string;
  steps: Array<{ step: string; status: 'PASS' | 'FAIL' | 'SKIP'; detail?: string }>;
  articleId: string;
};

export async function nestAdminNewsAutomationDiagnostics(
  token: string,
): Promise<NewsAutomationDiagnostics | null> {
  return adminFetch<NewsAutomationDiagnostics>(token, '/automation/diagnostics');
}

export type EditorialDistributionDiagnostics = {
  publishedArticles: number;
  articlesWithPortalPost: number;
  articlesMissingPost: number;
  importedYoutubeVideos: number;
  youtubePostsTotal: number;
  youtubeMissingPost: number;
  feedVisibleNewsPosts: number;
  feedVisibleYoutubePosts: number;
};

export type EditorialRepairResult = {
  articles: { found: number; created: number; errors: number };
  youtube: {
    imported: number;
    alreadyHadPost: number;
    published: number;
    created: number;
    errors: number;
    message: string;
  };
};

export async function nestAdminDistributionDiagnostics(
  token: string,
): Promise<EditorialDistributionDiagnostics | null> {
  return adminFetch<EditorialDistributionDiagnostics>(token, '/distribution/diagnostics');
}

export async function nestAdminRepairDistribution(
  token: string,
): Promise<AdminFetchResult<EditorialRepairResult>> {
  return adminFetchResult<EditorialRepairResult>(token, '/distribution/repair', {
    method: 'POST',
  });
}

export async function nestAdminTestAutoPublish(
  token: string,
  body?: { articleId?: string; bypassSchedule?: boolean },
): Promise<AdminFetchResult<NewsAutoPublishTestResult>> {
  return adminFetchResult<NewsAutoPublishTestResult>(token, '/test-auto-publish', {
    method: 'POST',
    body: JSON.stringify(body ?? { bypassSchedule: true }),
  });
}

export async function nestAdminBackfillBadArticles(
  token: string,
): Promise<AdminFetchResult<{ jobId: string }>> {
  return adminFetchResult<{ jobId: string }>(token, '/backfill/bad-articles', { method: 'POST' });
}

export function newsWaitReasonLabel(reason?: string | null): string {
  switch (reason) {
    case 'AUTO_READY':
      return 'Připraveno k AUTO';
    case 'QUALITY_LOW':
      return 'Nízká kvalita';
    case 'LANGUAGE_QUALITY_LOW':
      return 'Nízká jazyková kvalita';
    case 'IMAGE_REQUIRED':
      return 'Chybí obrázek';
    case 'WAITING_SCHEDULE':
      return 'Čeká na čas publikace';
    case 'SOURCE_ERROR':
      return 'Chyba zdroje';
    case 'DUPLICATE':
      return 'Duplicita';
    default:
      return reason?.trim() || '—';
  }
}

export function newsCategoryLabel(category: string): string {
  return NEWS_CATEGORY_LABELS[category as NewsArticleCategory] ?? category;
}

export function newsStatusLabel(status: NewsArticleStatus): string {
  switch (status) {
    case 'DRAFT':
      return 'Koncept';
    case 'REVIEW':
      return 'Ke schválení';
    case 'SCHEDULED':
      return 'Naplánováno';
    case 'PUBLISHED':
      return 'Publikováno';
    case 'REJECTED':
      return 'Zamítnuto';
    case 'ARCHIVED':
      return 'Archiv';
    default:
      return status;
  }
}

export const DASHBOARD_STAT_LABELS: Record<keyof NewsDashboardStats, string> = {
  foundToday: 'Nalezeno dnes',
  relevantToday: 'Relevantní dnes',
  aiDrafts: 'AI koncepty',
  pendingReview: 'Čeká na schválení',
  publishedToday: 'Publikováno dnes',
  ignoredToday: 'Ignorováno dnes',
  duplicateToday: 'Duplicity dnes',
  publishedTotal: 'Publikováno celkem',
};
