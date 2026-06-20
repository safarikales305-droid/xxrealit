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
  sizeBytes: number | null;
  importSource: string | null;
  failureReason: string | null;
};

const DIRECT_VIDEO_URL_RE = /^https?:\/\/.+\.(mp4|m4v|webm)(\?|$)/i;
const FB_CDN_VIDEO_RE = /^https?:\/\/(?:video|scontent)\..*\.fbcdn\.net\//i;
const MUTED_URL_HINT_RE = /(?:mute|muted|silent|sf=mo|without_audio)/i;
const PREVIEW_FORMAT_RE = /(?:preview|gif|thumbnail|story)/i;
const THUMB_URL_HINT_RE = /(?:thumbnail|thumb|poster|preview|story_pic|\/p\d+x\d+)/i;
const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif)(\?|$)/i;

const FORMAT_PRIORITY = ['1080p', 'hd', '720p', 'sd', 'native', '480p', '360p'];

const GRAPH_SOURCE_PRIORITY: Array<{ field: string; label: string; priority: number }> = [
  { field: 'source', label: 'source', priority: 1 },
  { field: 'hd_source', label: 'hd_source', priority: 2 },
  { field: 'playable_url_quality_hd', label: 'playable_url_quality_hd', priority: 3 },
  { field: 'playable_url', label: 'playable_url', priority: 4 },
];

export function isPlayableDirectVideoUrl(url: string | null | undefined): boolean {
  const v = (url ?? '').trim();
  if (!v) return false;
  if (IMAGE_EXT_RE.test(v)) return false;
  if (MUTED_URL_HINT_RE.test(v)) return false;
  if (THUMB_URL_HINT_RE.test(v) && !FB_CDN_VIDEO_RE.test(v)) return false;
  if (DIRECT_VIDEO_URL_RE.test(v)) return true;
  if (FB_CDN_VIDEO_RE.test(v)) return true;
  return v.includes('/v/t42.') || v.includes('/v/t39.');
}

export function isThumbnailLikeVideoUrl(
  url: string | null | undefined,
  thumbnail?: string | null,
): boolean {
  const v = (url ?? '').trim();
  if (!v) return true;
  const thumb = (thumbnail ?? '').trim();
  if (thumb && v === thumb) return true;
  if (IMAGE_EXT_RE.test(v)) return true;
  if (THUMB_URL_HINT_RE.test(v) && !DIRECT_VIDEO_URL_RE.test(v)) return true;
  return false;
}

export function urlLikelyHasAudio(url: string | null | undefined): boolean {
  const v = (url ?? '').trim();
  if (!v) return false;
  if (MUTED_URL_HINT_RE.test(v)) return false;
  if (isThumbnailLikeVideoUrl(v)) return false;
  return true;
}

function extractUrlFromEmbedHtml(embedHtml: string): string | null {
  const match = /src="([^"]+)"/i.exec(embedHtml);
  return match?.[1]?.trim() || null;
}

function pickBestFormatSource(
  formats: Array<{ filter?: string; embed_html?: string; picture?: string }> | undefined,
): { url: string; label: string } | null {
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

  const best = ranked[0];
  return best?.url ? { url: best.url, label: `format:${best.filter || 'embed'}` } : null;
}

type VideoCandidate = {
  url: string;
  importSource: string;
  priority: number;
};

async function probeVideoMeta(
  url: string,
): Promise<{ mimeType: string | null; sizeBytes: number | null }> {
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    const ct = res.headers.get('content-type')?.split(';')[0]?.trim() || null;
    const len = res.headers.get('content-length');
    const sizeBytes = len && /^\d+$/.test(len) ? Number(len) : null;
    let mimeType = ct;
    if (ct && ct.startsWith('video/')) mimeType = ct;
    else if (ct === 'application/octet-stream') mimeType = 'video/mp4';
    return { mimeType, sizeBytes };
  } catch {
    return { mimeType: null, sizeBytes: null };
  }
}

function collectGraphPayloadCandidates(
  payload: Record<string, unknown>,
  thumbnail: string | null,
): VideoCandidate[] {
  const seen = new Set<string>();
  const out: VideoCandidate[] = [];
  const add = (raw: unknown, importSource: string, priority: number) => {
    const url = typeof raw === 'string' ? raw.trim() : '';
    if (!url || seen.has(url)) return;
    if (!isPlayableDirectVideoUrl(url)) return;
    if (isThumbnailLikeVideoUrl(url, thumbnail)) return;
    seen.add(url);
    out.push({ url, importSource, priority });
  };

  for (const row of GRAPH_SOURCE_PRIORITY) {
    add(payload[row.field], row.label, row.priority);
  }

  const fromFormats = pickBestFormatSource(
    payload.format as Array<{ filter?: string; embed_html?: string; picture?: string }> | undefined,
  );
  if (fromFormats) add(fromFormats.url, fromFormats.label, 10);

  return out;
}

async function pickBestVideoCandidate(
  candidates: VideoCandidate[],
  thumbnail: string | null,
): Promise<{
  url: string;
  importSource: string;
  mimeType: string | null;
  sizeBytes: number | null;
  hasAudio: boolean;
} | null> {
  const unique = candidates.filter(
    (c) => !isThumbnailLikeVideoUrl(c.url, thumbnail) && urlLikelyHasAudio(c.url),
  );
  if (!unique.length) return null;

  const probed = await Promise.all(
    unique.map(async (c) => {
      const meta = await probeVideoMeta(c.url);
      return { ...c, ...meta };
    }),
  );

  const audioLikely = probed.filter((c) => urlLikelyHasAudio(c.url));
  const pool = audioLikely.length ? audioLikely : probed;
  pool.sort((a, b) => {
    const sizeA = a.sizeBytes ?? 0;
    const sizeB = b.sizeBytes ?? 0;
    if (sizeB !== sizeA) return sizeB - sizeA;
    return a.priority - b.priority;
  });

  const best = pool[0];
  if (!best) return null;
  return {
    url: best.url,
    importSource: best.importSource,
    mimeType: best.mimeType,
    sizeBytes: best.sizeBytes,
    hasAudio: urlLikelyHasAudio(best.url),
  };
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
    sizeBytes: null,
    importSource: null,
    failureReason: null,
  };
  const id = videoId.trim();
  if (!id) {
    return { ...empty, failureReason: 'missing_video_id' };
  }

  const fields = [
    'source',
    'hd_source',
    'playable_url',
    'playable_url_quality_hd',
    'permalink_url',
    'picture',
    'length',
    'format',
  ].join(',');

  const url =
    `${GRAPH_API}/${encodeURIComponent(id)}?` +
    `fields=${fields}&` +
    `access_token=${encodeURIComponent(accessToken)}`;

  try {
    const res = await fetch(url);
    const payload = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
      error?: { message?: string; code?: number };
    };

    if (!res.ok || payload.error) {
      const msg = payload.error?.message ?? `HTTP ${res.status}`;
      return { ...empty, failureReason: `graph_video_fetch_failed: ${msg}` };
    }

    const durationSec =
      typeof payload.length === 'number' && Number.isFinite(payload.length)
        ? Number(payload.length)
        : null;
    const permalinkUrl =
      typeof payload.permalink_url === 'string' ? payload.permalink_url.trim() || null : null;
    const thumbnail = typeof payload.picture === 'string' ? payload.picture.trim() || null : null;

    const candidates = collectGraphPayloadCandidates(payload, thumbnail);
    const best = await pickBestVideoCandidate(candidates, thumbnail);

    if (!best) {
      return {
        ...empty,
        permalinkUrl,
        thumbnail,
        durationSec,
        failureReason: 'graph_video_source_missing',
      };
    }

    if (!best.hasAudio) {
      return {
        source: null,
        permalinkUrl,
        thumbnail,
        durationSec,
        hasAudio: false,
        mimeType: best.mimeType,
        sizeBytes: best.sizeBytes,
        importSource: best.importSource,
        failureReason: 'FACEBOOK_VIDEO_WITHOUT_AUDIO',
      };
    }

    return {
      source: best.url,
      permalinkUrl,
      thumbnail,
      durationSec,
      hasAudio: true,
      mimeType: best.mimeType,
      sizeBytes: best.sizeBytes,
      importSource: best.importSource,
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
        if (source && isPlayableDirectVideoUrl(source) && !isThumbnailLikeVideoUrl(source, thumbnailUrl)) {
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

  if (videoUrl && isThumbnailLikeVideoUrl(videoUrl, thumbnailUrl)) {
    videoUrl = null;
  }

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
  sizeBytes: number | null;
  importSource: string | null;
  videoUrlFailureReason: string | null;
  mediaCreate: Array<{ url: string; type: string; order: number }>;
};

type PickedVideo = {
  videoUrl: string | null;
  hasAudio: boolean | null;
  mimeType: string | null;
  durationSec: number | null;
  sizeBytes: number | null;
  importSource: string | null;
  failureReason: string | null;
};

function pickImportVideoUrl(input: {
  extracted: ExtractedFacebookMedia;
  resolved?: ResolvedFacebookVideo | null;
}): PickedVideo {
  const resolved = input.resolved ?? null;
  const thumbnail = input.extracted.thumbnailUrl?.trim() || null;
  const attachmentUrl =
    input.extracted.videoUrl?.trim() &&
    !isThumbnailLikeVideoUrl(input.extracted.videoUrl, thumbnail) &&
    isPlayableDirectVideoUrl(input.extracted.videoUrl)
      ? input.extracted.videoUrl.trim()
      : null;
  const graphUrl = resolved?.source?.trim() || null;

  if (graphUrl && resolved?.hasAudio === true) {
    return {
      videoUrl: graphUrl,
      hasAudio: true,
      mimeType: resolved.mimeType ?? null,
      durationSec: resolved.durationSec ?? null,
      sizeBytes: resolved.sizeBytes ?? null,
      importSource: resolved.importSource ?? 'graph',
      failureReason: null,
    };
  }

  if (attachmentUrl && urlLikelyHasAudio(attachmentUrl)) {
    const graphSize = resolved?.sizeBytes ?? 0;
    const preferAttachment =
      !graphUrl ||
      resolved?.hasAudio === false ||
      (resolved?.sizeBytes != null && graphSize > 0 && graphSize < 200_000);
    if (preferAttachment) {
      return {
        videoUrl: attachmentUrl,
        hasAudio: true,
        mimeType: resolved?.mimeType ?? null,
        durationSec: resolved?.durationSec ?? null,
        sizeBytes: resolved?.sizeBytes ?? null,
        importSource: 'attachment',
        failureReason: null,
      };
    }
  }

  if (graphUrl && urlLikelyHasAudio(graphUrl) && resolved?.hasAudio !== false) {
    return {
      videoUrl: graphUrl,
      hasAudio: resolved?.hasAudio ?? true,
      mimeType: resolved?.mimeType ?? null,
      durationSec: resolved?.durationSec ?? null,
      sizeBytes: resolved?.sizeBytes ?? null,
      importSource: resolved?.importSource ?? 'graph',
      failureReason: null,
    };
  }

  if (graphUrl && resolved?.hasAudio === false) {
    return {
      videoUrl: null,
      hasAudio: false,
      mimeType: resolved.mimeType ?? null,
      durationSec: resolved.durationSec ?? null,
      sizeBytes: resolved.sizeBytes ?? null,
      importSource: resolved.importSource,
      failureReason: resolved.failureReason ?? 'FACEBOOK_VIDEO_WITHOUT_AUDIO',
    };
  }

  if (attachmentUrl && !urlLikelyHasAudio(attachmentUrl)) {
    return {
      videoUrl: null,
      hasAudio: false,
      mimeType: resolved?.mimeType ?? null,
      durationSec: resolved?.durationSec ?? null,
      sizeBytes: resolved?.sizeBytes ?? null,
      importSource: 'attachment',
      failureReason: 'FACEBOOK_VIDEO_WITHOUT_AUDIO',
    };
  }

  return {
    videoUrl: null,
    hasAudio: false,
    mimeType: resolved?.mimeType ?? null,
    durationSec: resolved?.durationSec ?? null,
    sizeBytes: resolved?.sizeBytes ?? null,
    importSource: resolved?.importSource ?? (attachmentUrl ? 'attachment' : null),
    failureReason:
      resolved?.failureReason ??
      (input.extracted.videoId ? 'FACEBOOK_VIDEO_WITHOUT_AUDIO' : 'no_video_attachment'),
  };
}

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

  const picked = pickImportVideoUrl({
    extracted: input.extracted,
    resolved,
  });
  let videoUrl = picked.videoUrl;
  if (videoUrl && isThumbnailLikeVideoUrl(videoUrl, thumbnail)) {
    videoUrl = null;
    picked.failureReason = 'FACEBOOK_VIDEO_WITHOUT_AUDIO';
    picked.hasAudio = false;
  }

  let videoUrlFailureReason = picked.failureReason ?? resolved?.failureReason ?? null;

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
    durationSec: picked.durationSec ?? resolved?.durationSec ?? null,
    hasAudio: picked.hasAudio,
    mimeType: picked.mimeType ?? resolved?.mimeType ?? null,
    sizeBytes: picked.sizeBytes ?? resolved?.sizeBytes ?? null,
    importSource: picked.importSource,
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
  sizeBytes?: number | null;
  importSource?: string | null;
  failureReason: string | null;
}): string {
  const parts = [
    `postId=${input.postId}`,
    `videoUrl=${input.videoUrl ?? 'missing'}`,
    `hasAudio=${input.hasAudio === null ? 'unknown' : String(input.hasAudio)}`,
    `mimeType=${input.mimeType ?? 'unknown'}`,
    `duration=${input.durationSec ?? 'unknown'}`,
    `size=${input.sizeBytes ?? 'unknown'}`,
    `importSource=${input.importSource ?? 'unknown'}`,
  ];
  if (input.failureReason) parts.push(`reason=${input.failureReason}`);
  return parts.join(' ');
}

export function extractFacebookVideoIdFromPermalink(permalink: string): string | null {
  const u = permalink.trim();
  const patterns = [
    /\/videos\/(\d+)/i,
    /\/reel\/(\d+)/i,
    /\/reels\/(\d+)/i,
    /[?&]v=(\d+)/i,
    /video\.php\?v=(\d+)/i,
    /\/watch\/?\?v=(\d+)/i,
  ];
  for (const re of patterns) {
    const m = u.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

export function buildExtractedMediaFromScrapedItem(item: {
  imageUrl?: string | null;
  videoUrl?: string | null;
  permalink: string;
}): ExtractedFacebookMedia {
  const thumbnail = item.imageUrl?.trim() || null;
  const scrapedVideo = item.videoUrl?.trim() || null;
  const videoId = extractFacebookVideoIdFromPermalink(item.permalink);
  return {
    imageUrl: thumbnail,
    videoUrl: scrapedVideo,
    videoId,
    thumbnailUrl: thumbnail,
    linkUrl: item.permalink,
  };
}

export const FACEBOOK_GRAPH_POST_FIELDS =
  'id,message,story,created_time,permalink_url,full_picture,attachments{media_type,media{source,image},url,target{id},subattachments}';
