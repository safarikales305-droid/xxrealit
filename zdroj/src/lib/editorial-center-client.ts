import { API_BASE_URL } from './api';
import { nestAuthHeaders } from './nest-client';

export type ContentSourceCategory = {
  id: string;
  slug: string;
  label: string;
  sortOrder: number;
  active: boolean;
  _count?: { sources: number };
};

export type EditorialCenterDashboard = {
  activeYoutubeChannels: number;
  activeRssSources: number;
  videosImportedToday: number;
  articlesImportedToday: number;
  shortsContentCount: number;
  autoPublishingActive: boolean;
  facebookReelsThisWeek: number;
  syncErrors: number;
  reelAutomationActive: boolean;
  lastReelAt: string | null;
  lastReelStatus: string | null;
};

export type EditorialReelAutomationSettings = {
  enabled: boolean;
  videosPerReel: number;
  maxWaitHours: number;
  minVideos: number;
  autoPublish: boolean;
  autoPublishYoutube: boolean;
  youtubePrivacyStatus: 'public' | 'unlisted' | 'private';
  categorySlugs: string[];
  templateId?: string | null;
  musicTrackId?: string | null;
  ctaUrl: string;
  introText: string;
  outroText: string;
};

export type YouTubeConnectionStatus = {
  connected: boolean;
  configured: boolean;
  channelId: string | null;
  channelTitle: string | null;
  channelHandle?: string | null;
  uploadScopeOk: boolean;
  refreshTokenOk: boolean;
  autoPublishReady: boolean;
  channelMismatch?: boolean;
  lastError?: string | null;
  lastUploadAt?: string | null;
  lastUploadVideoId?: string | null;
};

export type EditorialReelJobRow = {
  id: string;
  status: string;
  title: string | null;
  videoCount: number;
  videoUrl: string | null;
  renderError: string | null;
  publishError: string | null;
  failedStage: string | null;
  errorCode: string | null;
  lastAttemptAt: string | null;
  attemptCount: number;
  facebookPermalink: string | null;
  facebookPostId: string | null;
  facebookPublishStatus?: string | null;
  youtubeVideoId?: string | null;
  youtubePermalink?: string | null;
  youtubePublishStatus?: string | null;
  youtubePublishError?: string | null;
  youtubePublishedAt?: string | null;
  ownershipType?: string | null;
  renderedAt: string | null;
  createdAt: string;
  publishedAt: string | null;
  template?: { id: string; name: string; musicTrack?: { id: string; title: string } | null } | null;
  category?: { label: string } | null;
  segments?: Array<{
    id: string;
    sortOrder: number;
    title: string | null;
    thumbnailUrl: string | null;
    channelTitle?: string | null;
    post?: { id: string; title: string; youtubeVideoId: string | null; youtubeChannelTitle?: string | null };
  }>;
};

export type EditorialReelTemplate = {
  id: string;
  name: string;
  introSec: number;
  segmentSec: number;
  outroSec: number;
  videosPerReel: number;
  transition: string;
  showLogo: boolean;
  showVideoTitle: boolean;
  showChannelTitle: boolean;
  showCategory: boolean;
  ctaText: string;
  introText: string | null;
  hookMode?: string;
  generateHookText?: boolean;
  useFirstVideoAsIntro?: boolean;
  showFirstVideoTitle?: boolean;
  musicTrackId: string | null;
  isDefault: boolean;
  updatedAt: string;
  musicTrack?: { id: string; title: string } | null;
};

export type ReelPendingBuffer = {
  count: number;
  threshold: number;
  minVideos: number;
  since: string | null;
  posts: Array<{ id: string; title: string; youtubeThumbnailUrl: string | null; youtubeVideoId: string | null }>;
};

async function editorialFetch<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<T | null> {
  if (!API_BASE_URL) return null;
  const res = await fetch(`${API_BASE_URL}/admin/editorial-center${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...nestAuthHeaders(token),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

export function nestEditorialDashboard(token: string) {
  return editorialFetch<EditorialCenterDashboard>(token, '/dashboard');
}

export function nestEditorialCategories(token: string) {
  return editorialFetch<ContentSourceCategory[]>(token, '/categories');
}

export function nestEditorialUpdateCategory(
  token: string,
  id: string,
  body: Partial<{ label: string; sortOrder: number; active: boolean; slug: string }>,
) {
  return editorialFetch<ContentSourceCategory>(token, `/categories/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function nestEditorialCreateCategory(
  token: string,
  body: { slug: string; label: string; sortOrder?: number },
) {
  return editorialFetch<ContentSourceCategory>(token, '/categories', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function nestEditorialReelSettings(token: string) {
  return editorialFetch<EditorialReelAutomationSettings>(token, '/reel/settings');
}

export function nestEditorialUpdateReelSettings(
  token: string,
  body: Partial<EditorialReelAutomationSettings>,
) {
  return editorialFetch<EditorialReelAutomationSettings>(token, '/reel/settings', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function nestEditorialReelJobs(token: string) {
  return editorialFetch<EditorialReelJobRow[]>(token, '/reel/jobs');
}

export function nestEditorialCreateReelJob(
  token: string,
  body: { postIds: string[]; title?: string },
) {
  return editorialFetch<EditorialReelJobRow>(token, '/reel/jobs', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function nestEditorialPublishReelJob(token: string, id: string) {
  return editorialFetch<{ ok?: boolean; permalink?: string }>(
    token,
    `/reel/jobs/${encodeURIComponent(id)}/publish/facebook`,
    { method: 'POST' },
  );
}

export function nestEditorialPublishReelFacebook(token: string, id: string) {
  return nestEditorialPublishReelJob(token, id);
}

export function nestEditorialPublishReelYoutube(token: string, id: string) {
  return editorialFetch<{ ok?: boolean; youtubeQueued?: boolean }>(
    token,
    `/reel/jobs/${encodeURIComponent(id)}/publish/youtube`,
    { method: 'POST' },
  );
}

export function nestEditorialRetryReelYoutube(token: string, id: string) {
  return editorialFetch<{ queued?: boolean }>(
    token,
    `/reel/jobs/${encodeURIComponent(id)}/publish/youtube/retry`,
    { method: 'POST' },
  );
}

export function nestEditorialYoutubeStatus(token: string) {
  return editorialFetch<YouTubeConnectionStatus>(token, '/youtube/status');
}

export function nestEditorialYoutubePublishSummary(token: string) {
  return editorialFetch<{
    lastUploadAt: string | null;
    lastUploadVideoId: string | null;
    lastError: string | null;
  }>(token, '/youtube/publish-summary');
}

export async function nestYoutubeOAuthConnectUrl(token: string): Promise<string | null> {
  if (!API_BASE_URL) return null;
  const res = await fetch(`${API_BASE_URL}/social/youtube/oauth/connect`, {
    headers: { Accept: 'application/json', ...nestAuthHeaders(token) },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { url?: string };
  return data.url ?? null;
}

export function nestEditorialRenderReelJob(token: string, id: string) {
  return editorialFetch<{ ok?: boolean }>(token, `/reel/jobs/${encodeURIComponent(id)}/render`, {
    method: 'POST',
  });
}

export function nestEditorialReelJob(token: string, id: string) {
  return editorialFetch<EditorialReelJobRow>(token, `/reel/jobs/${encodeURIComponent(id)}`);
}

export function nestEditorialReelPending(token: string) {
  return editorialFetch<ReelPendingBuffer>(token, '/reel/pending');
}

export function nestEditorialReelTemplates(token: string) {
  return editorialFetch<EditorialReelTemplate[]>(token, '/reel/templates');
}

export function nestEditorialCreateReelTemplate(
  token: string,
  body: Partial<EditorialReelTemplate>,
) {
  return editorialFetch<EditorialReelTemplate>(token, '/reel/templates', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function nestEditorialUpdateReelTemplate(
  token: string,
  id: string,
  body: Partial<EditorialReelTemplate>,
) {
  return editorialFetch<EditorialReelTemplate>(token, `/reel/templates/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function nestEditorialDuplicateReelTemplate(token: string, id: string) {
  return editorialFetch<EditorialReelTemplate>(token, `/reel/templates/${encodeURIComponent(id)}/duplicate`, {
    method: 'POST',
  });
}

export function nestEditorialSetDefaultReelTemplate(token: string, id: string) {
  return editorialFetch<EditorialReelTemplate>(token, `/reel/templates/${encodeURIComponent(id)}/set-default`, {
    method: 'POST',
  });
}

export function nestEditorialDeleteReelTemplate(token: string, id: string) {
  return editorialFetch<{ ok: boolean }>(token, `/reel/templates/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export function nestEditorialTestReelTemplate(token: string, id: string) {
  return editorialFetch<EditorialReelJobRow>(token, `/reel/templates/${encodeURIComponent(id)}/test-render`, {
    method: 'POST',
  });
}

export function nestEditorialDeleteReelJob(token: string, id: string) {
  return editorialFetch<{ ok: boolean }>(token, `/reel/jobs/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export function nestEditorialReelMusic(token: string) {
  return editorialFetch<
    Array<{
      id: string;
      title: string;
      artist?: string;
      fileUrl: string;
      previewUrl?: string | null;
      durationSec?: number | null;
      isActive: boolean;
    }>
  >(token, '/reel/music');
}
