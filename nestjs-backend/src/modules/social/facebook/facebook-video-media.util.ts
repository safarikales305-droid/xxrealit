import type { FacebookPostType } from '@prisma/client';
import { GRAPH_API } from './facebook-page.constants';
import { detectFacebookPostType, isFacebookVideoType } from '../facebook-url-import/facebook-embed.util';

export type GraphFeedAttachment = {
  media_type?: string;
  media?: { image?: { src?: string }; source?: string };
  url?: string;
  target?: { id?: string };
  subattachments?: { data?: GraphFeedAttachment[] };
};

export type GraphFeedItem = {
  id?: string;
  message?: string;
  story?: string;
  permalink_url?: string;
  full_picture?: string;
  created_time?: string;
  attachments?: { data?: GraphFeedAttachment[] };
};

export type ExtractedFacebookMedia = {
  imageUrl: string | null;
  videoUrl: string | null;
  videoId: string | null;
  thumbnailUrl: string | null;
  linkUrl: string | null;
};

export type ResolvedFacebookVideo = {
  source: string | null;
  permalinkUrl: string | null;
  thumbnail: string | null;
  durationSec: number | null;
  hasAudio: boolean | null;
  mimeType: string | null;
  failureReason: string | null;
};

const DIRECT_VIDEO_URL_RE = /^https?:\/\/.+\.(mp4|m4v|webm)(\?|$)/i;
const FB_CDN_VIDEO_RE = /^https?:\/\/(?:video|scontent)\..*\.fbcdn\.net\//i;
const MUTED_URL_HINT_RE = /(?:mute|muted|silent|sf=mo|without_audio)/i;
const PREVIEW_FORMAT_RE = /(?:preview|gif|thumbnail|story)/i;

const FORMAT_PRIORITY = ['1080p', 'hd', '720p', 'sd', 'native', '480p', '360p'];

export function isPlayableDirectVideoUrl(url: string | null | undefined): boolean {
  const v = (url ?? '').trim();
  if (!v) return false;
  if (MUTED_URL_HINT_RE.test(v)) return false;
  if (DIRECT_VIDEO_URL_RE.test(v)) return true;
  if (FB_CDN_VIDEO_RE.test(v)) return true;
  return v.includes('/v/t42.') || v.includes('/v/t39.');
}

export function urlLikelyHasAudio(url: string | null | undefined): boolean {
  const v = (url ?? '').trim();
  if (!v) return false;
  if (MUTED_URL_HINT_RE.test(v)) return false;
  return true;
}

function extractUrlFromEmbedHtml(embedHtml: string): string | null {
  const match = /src="([^"]+)"/i.exec(embedHtml);
  return match?.[1]?.trim() || null;
}

function pickBestFormatSource(
  formats: Array<{ filter?: string; embed_html?: string; picture?: string }> | undefined,
): string | null {
  if (!Array.isArray(formats) || formats.length === 0) return null;

  const ranked = formats
    .map((f) => {
      const filter = (f.filter ?? '').trim().toLowerCase();
      const fromEmbed = f.embed_html ? extractUrlFromEmbedHtml(f.embed_html) : null;
      const priority = FORMAT_PRIORITY.findIndex((p) => filter.includes(p));
      const isPreview = PREVIEW_FORMAT_RE.test(filter);
      return {
        url: fromEmbed,
        priority: priority === -1 ? 99 : priority,
        isPreview,
        filter,
      };
    })
    .filter((row) => row.url && isPlayableDirectVideoUrl(row.url) && !row.isPreview)
    .sort((a, b) => a.priority - b.priority);

  return ranked[0]?.url ?? null;
}

async function probeVideoMimeType(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    const ct = res.headers.get('content-type')?.split(';')[0]?.trim() || null;
    if (ct && ct.startsWith('video/')) return ct;
    if (ct === 'application/octet-stream') return 'video/mp4';
    return ct;
  } catch {
    return null;
  }
}

export async function resolveFacebookVideoFromGraph(
  videoId: string,
  accessToken: string,
): Promise<ResolvedFacebookVideo> {
  const empty: ResolvedFacebookVideo = {
    source: null,
    permalinkUrl: null,
    thumbnail: null,
    durationSec: null,
    hasAudio: null,
    mimeType: null,
    failureReason: null,
  };
  const id = videoId.trim();
  if (!id) {
    return { ...empty, failureReason: 'missing_video_id' };
  }

  const url =
    `${GRAPH_API}/${encodeURIComponent(id)}?` +
    `fields=source,permalink_url,picture,length,format&` +
    `access_token=${encodeURIComponent(accessToken)}`;

  try {
    const res = await fetch(url);
    const payload = (await res.json().catch(() => ({}))) as {
      source?: string;
      permalink_url?: string;
      picture?: string;
      length?: number;
      format?: Array<{ embed_html?: string; filter?: string; picture?: string }>;
      error?: { message?: string; code?: number };
    };

    if (!res.ok || payload.error) {
      const msg = payload.error?.message ?? `HTTP ${res.status}`;
      return { ...empty, failureReason: `graph_video_fetch_failed: ${msg}` };
    }

    const durationSec = Number.isFinite(payload.length) ? Number(payload.length) : null;
    const permalinkUrl = payload.permalink_url?.trim() || null;
    const thumbnail = payload.picture?.trim() || null;

    const candidates: string[] = [];
    const primary = payload.source?.trim();
    if (primary && isPlayableDirectVideoUrl(primary)) candidates.push(primary);
    const fromFormats = pickBestFormatSource(payload.format);
    if (fromFormats) candidates.push(fromFormats);

    const source =
      candidates.find((c) => urlLikelyHasAudio(c)) ??
      candidates[0] ??
      null;

    if (!source) {
      return {
        ...empty,
        permalinkUrl,
        thumbnail,
        durationSec,
        failureReason: 'graph_video_source_missing',
      };
    }

    const mimeType = await probeVideoMimeType(source);
    const hasAudio = urlLikelyHasAudio(source);

    if (!hasAudio) {
      return {
        source,
        permalinkUrl,
        thumbnail,
        durationSec,
        hasAudio: false,
        mimeType,
        failureReason: 'FACEBOOK_VIDEO_WITHOUT_AUDIO',
      };
    }

    return {
      source,
      permalinkUrl,
      thumbnail,
      durationSec,
      hasAudio: true,
      mimeType,
      failureReason: null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ...empty, failureReason: `graph_video_fetch_exception: ${msg}` };
  }
}

export function extractMediaFromGraphItem(item: GraphFeedItem): ExtractedFacebookMedia {
  let imageUrl: string | null = null;
  let videoUrl: string | null = null;
  let videoId: string | null = null;
  let thumbnailUrl: string | null = null;
  let linkUrl: string | null = null;

  const walk = (attachments?: GraphFeedAttachment[]) => {
    for (const att of attachments ?? []) {
      const type = (att.media_type ?? '').toLowerCase();
      if (type === 'photo' && att.media?.image?.src) {
        imageUrl = imageUrl ?? att.media.image.src;
      }
      if (type === 'video') {
        if (att.media?.image?.src) {
          thumbnailUrl = thumbnailUrl ?? att.media.image.src;
        }
        const source = att.media?.source?.trim();
        if (source && isPlayableDirectVideoUrl(source)) {
          videoUrl = videoUrl ?? source;
        }
        if (att.target?.id?.trim()) {
          videoId = videoId ?? att.target.id.trim();
        }
      }
      if (att.url && !linkUrl) linkUrl = att.url;
      walk(att.subattachments?.data);
    }
  };

  walk(item.attachments?.data);

  const fullPicture = item.full_picture?.trim() || null;
  if (!thumbnailUrl) thumbnailUrl = fullPicture ?? imageUrl;

  return { imageUrl, videoUrl, videoId, thumbnailUrl, linkUrl };
}

export type FacebookImportMediaPlan = {
  isVideoPost: boolean;
  facebookPostType: FacebookPostType;
  videoUrl: string | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  durationSec: number | null;
  hasAudio: boolean | null;
  mimeType: string | null;
  videoUrlFailureReason: string | null;
  mediaCreate: Array<{ url: string; type: string; order: number }>;
};

export function buildFacebookImportMediaPlan(input: {
  permalink: string | null;
  extracted: ExtractedFacebookMedia;
  fullPicture?: string | null;
  resolvedVideo?: ResolvedFacebookVideo | null;
}): FacebookImportMediaPlan {
  const permalink = input.permalink?.trim() || null;
  const facebookPostType = permalink ? detectFacebookPostType(permalink) : 'FACEBOOK_POST';
  const resolved = input.resolvedVideo ?? null;
  const thumbnail =
    resolved?.thumbnail?.trim() ||
    input.extracted.thumbnailUrl?.trim() ||
    input.fullPicture?.trim() ||
    input.extracted.imageUrl?.trim() ||
    null;

  const isVideoPost =
    isFacebookVideoType(facebookPostType) ||
    Boolean(input.extracted.videoUrl) ||
    Boolean(resolved?.source) ||
    Boolean(input.extracted.videoId);

  let videoUrl =
    input.extracted.videoUrl?.trim() ||
    resolved?.source?.trim() ||
    null;
  let videoUrlFailureReason = resolved?.failureReason ?? null;

  if (isVideoPost && !videoUrl) {
    videoUrlFailureReason =
      videoUrlFailureReason ??
      (input.extracted.videoId ? 'attachment_source_missing' : 'no_video_attachment');
  }

  const imageUrl = isVideoPost ? null : thumbnail;
  const mediaCreate: Array<{ url: string; type: string; order: number }> = [];

  if (isVideoPost && videoUrl) {
    mediaCreate.push({ url: videoUrl, type: 'video', order: 1 });
  } else if (!isVideoPost && thumbnail) {
    mediaCreate.push({ url: thumbnail, type: 'image', order: 1 });
  }

  return {
    isVideoPost,
    facebookPostType,
    videoUrl,
    imageUrl,
    thumbnailUrl: thumbnail,
    durationSec: resolved?.durationSec ?? null,
    hasAudio: resolved?.hasAudio ?? (videoUrl ? urlLikelyHasAudio(videoUrl) : null),
    mimeType: resolved?.mimeType ?? null,
    videoUrlFailureReason,
    mediaCreate,
  };
}

export function logFacebookVideoImportDiagnostics(input: {
  postId: string;
  videoUrl: string | null;
  hasAudio: boolean | null;
  mimeType: string | null;
  durationSec: number | null;
  failureReason: string | null;
}): string {
  const parts = [
    `postId=${input.postId}`,
    `videoUrl=${input.videoUrl ? 'set' : 'missing'}`,
    `hasAudio=${input.hasAudio === null ? 'unknown' : String(input.hasAudio)}`,
    `mimeType=${input.mimeType ?? 'unknown'}`,
    `duration=${input.durationSec ?? 'unknown'}`,
  ];
  if (input.failureReason) parts.push(`reason=${input.failureReason}`);
  return parts.join(' ');
}

export const FACEBOOK_GRAPH_POST_FIELDS =
  'id,message,story,created_time,permalink_url,full_picture,attachments{media_type,media{source,image},url,target{id},subattachments}';
