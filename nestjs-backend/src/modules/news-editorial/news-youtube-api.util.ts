const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

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
};

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
  return `https://www.youtube.com/embed/${videoId}`;
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

async function youtubeGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const apiKey = getYouTubeApiKey();
  if (!apiKey) throw new Error('YOUTUBE_API_KEY není nastaveno na serveru.');

  const qs = new URLSearchParams({ ...params, key: apiKey });
  const res = await fetch(`${YOUTUBE_API_BASE}${path}?${qs.toString()}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`YouTube API ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export function extractYoutubeChannelHint(url: string): { handle?: string; channelId?: string } {
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
  } catch {
    if (/^UC[\w-]{20,}$/i.test(raw)) return { channelId: raw };
    if (raw.startsWith('@')) return { handle: raw.slice(1) };
  }
  return {};
}

export async function resolveYoutubeChannel(
  channelUrl: string,
  explicitChannelId?: string | null,
): Promise<YoutubeChannelResolve> {
  if (explicitChannelId?.trim() && /^UC[\w-]+$/i.test(explicitChannelId.trim())) {
    const byId = await youtubeGet<{
      items?: Array<{
        id: string;
        snippet?: { title?: string };
        contentDetails?: { relatedPlaylists?: { uploads?: string } };
      }>;
    }>('/channels', {
      part: 'snippet,contentDetails',
      id: explicitChannelId.trim(),
    });
    const item = byId.items?.[0];
    if (!item?.contentDetails?.relatedPlaylists?.uploads) {
      throw new Error('Kanál nenalezen podle channelId.');
    }
    return {
      channelId: item.id,
      channelTitle: item.snippet?.title ?? 'YouTube kanál',
      uploadsPlaylistId: item.contentDetails.relatedPlaylists.uploads,
    };
  }

  const hint = extractYoutubeChannelHint(channelUrl);
  if (hint.channelId) {
    return resolveYoutubeChannel(channelUrl, hint.channelId);
  }

  if (hint.handle) {
    const byHandle = await youtubeGet<{
      items?: Array<{
        id: string;
        snippet?: { title?: string };
        contentDetails?: { relatedPlaylists?: { uploads?: string } };
      }>;
    }>('/channels', {
      part: 'snippet,contentDetails',
      forHandle: hint.handle,
    });
    const item = byHandle.items?.[0];
    if (item?.contentDetails?.relatedPlaylists?.uploads) {
      return {
        channelId: item.id,
        channelTitle: item.snippet?.title ?? hint.handle,
        uploadsPlaylistId: item.contentDetails.relatedPlaylists.uploads,
      };
    }
  }

  throw new Error('Nepodařilo se rozpoznat YouTube kanál z URL. Zadejte platný Channel URL nebo Channel ID.');
}

export async function fetchPlaylistVideos(
  uploadsPlaylistId: string,
  maxResults = 5,
  publishedAfter?: Date | null,
): Promise<YoutubeVideoMeta[]> {
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
  }>('/playlistItems', {
    part: 'snippet,contentDetails',
    playlistId: uploadsPlaylistId,
    maxResults: String(Math.min(50, Math.max(1, maxResults))),
  });

  const videoIds = (data.items ?? [])
    .map((item) => item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId ?? '')
    .filter((id) => isValidYoutubeVideoId(id));

  if (!videoIds.length) return [];

  const details = await fetchVideoDetails(videoIds);
  if (!publishedAfter) return details;

  return details.filter((v) => v.publishedAt.getTime() > publishedAfter.getTime());
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
