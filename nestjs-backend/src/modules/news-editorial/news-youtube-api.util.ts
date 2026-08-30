const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

const YOUTUBE_RESERVED_SEGMENTS = new Set([
  'watch',
  'playlist',
  'channel',
  'user',
  'c',
  'feed',
  'results',
  'gaming',
  'shorts',
  'embed',
  'live',
  'premium',
  'kids',
  'music',
  'trending',
  'about',
  'account',
  'creator',
  'studio',
  'post',
  'hashtag',
  'youtube',
  'redirect',
  'log_in',
  'logout',
  'signup',
  'reporthistory',
  'new',
  'favicon.ico',
  'attribution_link',
  'howyoutubeworks',
  'yt',
  'jobs',
  'press',
  'branding',
  'copyright',
  'terms',
  'privacy',
  'policies',
  'ads',
  'upload',
]);

export type YoutubeVideoMeta = {
  videoId: string;
  channelId: string;
  channelTitle: string;
  title: string;
  description: string;
  publishedAt: Date;
  thumbnailUrl: string;
  videoUrl: string;
  embedUrl: string;
  embeddable: boolean;
  duration?: string;
};

export type YoutubeChannelResolve = {
  channelId: string;
  channelTitle: string;
  uploadsPlaylistId: string;
  resolvedVia?: 'channel_id' | 'handle' | 'username' | 'vanity' | 'search' | 'redirect';
};

export class YoutubeApiError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
    readonly apiBody?: string,
  ) {
    super(message);
    this.name = 'YoutubeApiError';
  }
}

export function getYouTubeApiKey(): string | null {
  const key = process.env.YOUTUBE_API_KEY?.trim();
  return key || null;
}

export function isValidYoutubeVideoId(id: string): boolean {
  return VIDEO_ID_RE.test(id.trim());
}

export function buildYoutubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function buildYoutubeEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}`;
}

function pickThumbnail(thumbnails: Record<string, { url?: string }> | undefined): string {
  return (
    thumbnails?.maxres?.url ??
    thumbnails?.standard?.url ??
    thumbnails?.high?.url ??
    thumbnails?.medium?.url ??
    thumbnails?.default?.url ??
    ''
  );
}

type ChannelListItem = {
  id: string;
  snippet?: { title?: string; customUrl?: string };
  contentDetails?: { relatedPlaylists?: { uploads?: string } };
};

async function youtubeGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const apiKey = getYouTubeApiKey();
  if (!apiKey) throw new YoutubeApiError('YOUTUBE_API_KEY není nastaveno na serveru.', 0);

  const qs = new URLSearchParams({ ...params, key: apiKey });
  const res = await fetch(`${YOUTUBE_API_BASE}${path}?${qs.toString()}`, {
    headers: { Accept: 'application/json' },
  });
  const body = await res.text().catch(() => '');
  if (!res.ok) {
    throw new YoutubeApiError(`YouTube API ${res.status}: ${body.slice(0, 400)}`, res.status, body);
  }
  return JSON.parse(body) as T;
}

function channelFromListItem(
  item: ChannelListItem | undefined,
  resolvedVia: YoutubeChannelResolve['resolvedVia'],
): YoutubeChannelResolve | null {
  const uploads = item?.contentDetails?.relatedPlaylists?.uploads;
  if (!item?.id || !uploads) return null;
  return {
    channelId: item.id,
    channelTitle: item.snippet?.title ?? 'YouTube kanál',
    uploadsPlaylistId: uploads,
    resolvedVia,
  };
}

export function extractYoutubeChannelHint(url: string): {
  handle?: string;
  channelId?: string;
  vanity?: string;
} {
  const raw = url.trim();
  if (!raw) return {};
  try {
    const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    const path = u.pathname.replace(/\/+$/, '');

    const channelMatch = path.match(/\/channel\/(UC[\w-]+)/i);
    if (channelMatch) return { channelId: channelMatch[1] };

    const handleMatch = path.match(/\/@([\w.-]+)/);
    if (handleMatch) return { handle: handleMatch[1] };

    const userMatch = path.match(/\/user\/([\w.-]+)/i);
    if (userMatch) return { handle: userMatch[1] };

    const cMatch = path.match(/\/c\/([\w.-]+)/i);
    if (cMatch) return { vanity: cMatch[1] };

    const vanityMatch = path.match(/^\/([a-zA-Z0-9._-]+)$/);
    if (vanityMatch) {
      const seg = vanityMatch[1];
      if (!YOUTUBE_RESERVED_SEGMENTS.has(seg.toLowerCase())) {
        return { vanity: seg };
      }
    }
  } catch {
    if (/^UC[\w-]{20,}$/i.test(raw)) return { channelId: raw };
    if (raw.startsWith('@')) return { handle: raw.slice(1) };
    if (/^[\w.-]+$/.test(raw)) return { vanity: raw };
  }
  return {};
}

async function lookupChannelByHandle(handle: string): Promise<YoutubeChannelResolve | null> {
  const clean = handle.replace(/^@/, '');
  const data = await youtubeGet<{ items?: ChannelListItem[] }>('/channels', {
    part: 'snippet,contentDetails',
    forHandle: clean,
  });
  return channelFromListItem(data.items?.[0], 'handle');
}

async function lookupChannelByUsername(username: string): Promise<YoutubeChannelResolve | null> {
  const data = await youtubeGet<{ items?: ChannelListItem[] }>('/channels', {
    part: 'snippet,contentDetails',
    forUsername: username,
  });
  return channelFromListItem(data.items?.[0], 'username');
}

async function lookupChannelBySearch(query: string): Promise<YoutubeChannelResolve | null> {
  const search = await youtubeGet<{
    items?: Array<{ id?: { channelId?: string }; snippet?: { channelTitle?: string } }>;
  }>('/search', {
    part: 'snippet',
    type: 'channel',
    maxResults: '5',
    q: query,
  });

  const channelIds = (search.items ?? [])
    .map((item) => item.id?.channelId ?? '')
    .filter((id) => /^UC[\w-]+$/i.test(id));

  if (!channelIds.length) return null;

  const channels = await youtubeGet<{ items?: ChannelListItem[] }>('/channels', {
    part: 'snippet,contentDetails',
    id: channelIds.join(','),
  });

  const normalizedQuery = query.replace(/^@/, '').toLowerCase();
  const exact =
    channels.items?.find(
      (item) =>
        item.snippet?.customUrl?.replace(/^@/, '').toLowerCase() === normalizedQuery ||
        item.snippet?.title?.toLowerCase() === normalizedQuery,
    ) ?? channels.items?.[0];

  return channelFromListItem(exact, 'search');
}

export async function resolveYoutubeUrlRedirect(inputUrl: string): Promise<string> {
  const url = inputUrl.trim().startsWith('http') ? inputUrl.trim() : `https://${inputUrl.trim()}`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; XXREALIT-NewsBot/1.0)',
        Accept: 'text/html',
      },
    });
    return res.url || url;
  } catch {
    return url;
  }
}

async function lookupChannelByVanity(vanity: string): Promise<YoutubeChannelResolve | null> {
  const clean = vanity.replace(/^@/, '');

  const byHandle = await lookupChannelByHandle(clean);
  if (byHandle) return { ...byHandle, resolvedVia: 'vanity' };

  const byUsername = await lookupChannelByUsername(clean);
  if (byUsername) return { ...byUsername, resolvedVia: 'vanity' };

  return lookupChannelBySearch(clean);
}

export async function resolveYoutubeChannel(
  channelUrl: string,
  explicitChannelId?: string | null,
): Promise<YoutubeChannelResolve> {
  if (explicitChannelId?.trim() && /^UC[\w-]+$/i.test(explicitChannelId.trim())) {
    const data = await youtubeGet<{ items?: ChannelListItem[] }>('/channels', {
      part: 'snippet,contentDetails',
      id: explicitChannelId.trim(),
    });
    const resolved = channelFromListItem(data.items?.[0], 'channel_id');
    if (resolved) return resolved;
    throw new YoutubeApiError('Kanál nenalezen podle channelId.', 404);
  }

  let hint = extractYoutubeChannelHint(channelUrl);

  if (hint.channelId) {
    return resolveYoutubeChannel(channelUrl, hint.channelId);
  }

  if (hint.handle) {
    const byHandle = await lookupChannelByHandle(hint.handle);
    if (byHandle) return byHandle;
  }

  if (hint.vanity) {
    const byVanity = await lookupChannelByVanity(hint.vanity);
    if (byVanity) return byVanity;
  }

  if (!hint.handle && !hint.vanity) {
    const finalUrl = await resolveYoutubeUrlRedirect(channelUrl);
    if (finalUrl !== channelUrl) {
      hint = extractYoutubeChannelHint(finalUrl);
      if (hint.channelId) {
        const resolved = await resolveYoutubeChannel(finalUrl, hint.channelId);
        return { ...resolved, resolvedVia: 'redirect' };
      }
      if (hint.handle) {
        const byHandle = await lookupChannelByHandle(hint.handle);
        if (byHandle) return { ...byHandle, resolvedVia: 'redirect' };
      }
      if (hint.vanity) {
        const byVanity = await lookupChannelByVanity(hint.vanity);
        if (byVanity) return { ...byVanity, resolvedVia: 'redirect' };
      }
    }
  }

  const fallbackQuery = hint.vanity ?? hint.handle ?? channelUrl;
  const bySearch = await lookupChannelBySearch(fallbackQuery);
  if (bySearch) return bySearch;

  throw new YoutubeApiError(
    'Nepodařilo se rozpoznat YouTube kanál z URL. Zkuste @handle, /channel/UC… nebo Channel ID.',
    404,
  );
}

export async function fetchPlaylistVideos(
  uploadsPlaylistId: string,
  maxResults = 5,
  publishedAfter?: Date | null,
): Promise<YoutubeVideoMeta[]> {
  const target = Math.min(50, Math.max(1, maxResults));
  const collected: YoutubeVideoMeta[] = [];
  let pageToken: string | undefined;

  while (collected.length < target) {
    const pageSize = Math.min(50, target - collected.length);
    const data = await youtubeGet<{
      items?: Array<{
        snippet?: {
          publishedAt?: string;
          title?: string;
          description?: string;
          channelId?: string;
          channelTitle?: string;
          thumbnails?: Record<string, { url?: string }>;
          resourceId?: { videoId?: string };
        };
        contentDetails?: { videoId?: string };
      }>;
      nextPageToken?: string;
    }>('/playlistItems', {
      part: 'snippet,contentDetails',
      playlistId: uploadsPlaylistId,
      maxResults: String(pageSize),
      ...(pageToken ? { pageToken } : {}),
    });

    const videoIds = (data.items ?? [])
      .map((item) => item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId ?? '')
      .filter((id) => isValidYoutubeVideoId(id));

    if (!videoIds.length) break;

    const details = await fetchVideoDetails(videoIds);
    for (const video of details) {
      if (publishedAfter && video.publishedAt.getTime() <= publishedAfter.getTime()) {
        return collected;
      }
      collected.push(video);
      if (collected.length >= target) return collected;
    }

    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  return collected;
}

/** Lightweight live probe — never logs or returns the API key. */
export async function testYouTubeApiConnection(): Promise<{
  ok: boolean;
  httpStatus: number;
  responseTimeMs: number;
  error?: string;
}> {
  const started = Date.now();
  if (!getYouTubeApiKey()) {
    return {
      ok: false,
      httpStatus: 0,
      responseTimeMs: Date.now() - started,
      error: 'YOUTUBE_API_KEY není nastaveno na serveru.',
    };
  }

  try {
    await youtubeGet<{ items?: unknown[] }>('/channels', {
      part: 'snippet',
      id: 'UC_x5XG1OV2P6uZZ5FSM9Ttw',
    });
    return { ok: true, httpStatus: 200, responseTimeMs: Date.now() - started };
  } catch (err) {
    const httpStatus = err instanceof YoutubeApiError ? err.httpStatus : 0;
    return {
      ok: false,
      httpStatus,
      responseTimeMs: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function fetchVideoDetails(videoIds: string[]): Promise<YoutubeVideoMeta[]> {
  const ids = videoIds.filter(isValidYoutubeVideoId);
  if (!ids.length) return [];

  const data = await youtubeGet<{
    items?: Array<{
      id: string;
      snippet?: {
        title?: string;
        description?: string;
        publishedAt?: string;
        channelId?: string;
        channelTitle?: string;
        thumbnails?: Record<string, { url?: string }>;
      };
      contentDetails?: { duration?: string };
      status?: { embeddable?: boolean };
    }>;
  }>('/videos', {
    part: 'snippet,contentDetails,status',
    id: ids.join(','),
  });

  return (data.items ?? []).map((item) => {
    const videoId = item.id;
    const thumb = pickThumbnail(item.snippet?.thumbnails);
    return {
      videoId,
      channelId: item.snippet?.channelId ?? '',
      channelTitle: item.snippet?.channelTitle ?? 'YouTube',
      title: item.snippet?.title?.trim() ?? 'YouTube video',
      description: item.snippet?.description?.trim() ?? '',
      publishedAt: item.snippet?.publishedAt ? new Date(item.snippet.publishedAt) : new Date(),
      thumbnailUrl: thumb,
      videoUrl: buildYoutubeWatchUrl(videoId),
      embedUrl: buildYoutubeEmbedUrl(videoId),
      embeddable: item.status?.embeddable !== false,
      duration: item.contentDetails?.duration,
    };
  });
}

export type YoutubeChannelCandidate = {
  channelId: string;
  channelTitle: string;
  channelUrl: string;
  thumbnailUrl: string | null;
  description: string | null;
  subscriberCount: number | null;
  videoCount: number | null;
  lastVideoAt: Date | null;
};

/** Vyhledání kanálů přes oficiální YouTube Search API (quota-aware). */
export async function searchYoutubeChannels(
  query: string,
  maxResults = 5,
): Promise<YoutubeChannelCandidate[]> {
  const q = query.trim();
  if (!q) return [];

  const search = await youtubeGet<{
    items?: Array<{ id?: { channelId?: string } }>;
  }>('/search', {
    part: 'snippet',
    type: 'channel',
    maxResults: String(Math.min(10, Math.max(1, maxResults))),
    q,
  });

  const channelIds = (search.items ?? [])
    .map((item) => item.id?.channelId ?? '')
    .filter((id) => /^UC[\w-]+$/i.test(id));
  if (!channelIds.length) return [];

  const data = await youtubeGet<{
    items?: Array<{
      id: string;
      snippet?: {
        title?: string;
        description?: string;
        customUrl?: string;
        thumbnails?: Record<string, { url?: string }>;
        publishedAt?: string;
      };
      statistics?: { subscriberCount?: string; videoCount?: string };
    }>;
  }>('/channels', {
    part: 'snippet,statistics',
    id: channelIds.join(','),
  });

  return (data.items ?? []).map((item) => {
    const custom = item.snippet?.customUrl?.trim();
    const channelUrl = custom
      ? `https://www.youtube.com/${custom.startsWith('@') ? custom : `@${custom}`}`
      : `https://www.youtube.com/channel/${item.id}`;
    return {
      channelId: item.id,
      channelTitle: item.snippet?.title?.trim() ?? 'YouTube kanál',
      channelUrl,
      thumbnailUrl: pickThumbnail(item.snippet?.thumbnails) || null,
      description: item.snippet?.description?.trim().slice(0, 500) || null,
      subscriberCount: item.statistics?.subscriberCount
        ? Number.parseInt(item.statistics.subscriberCount, 10)
        : null,
      videoCount: item.statistics?.videoCount
        ? Number.parseInt(item.statistics.videoCount, 10)
        : null,
      lastVideoAt: item.snippet?.publishedAt ? new Date(item.snippet.publishedAt) : null,
    };
  });
}
