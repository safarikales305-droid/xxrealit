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
  failureReason: string | null;
};

const DIRECT_VIDEO_URL_RE = /^https?:\/\/.+\.(mp4|m4v|webm)(\?|$)/i;
const FB_CDN_VIDEO_RE = /^https?:\/\/(?:video|scontent)\..*\.fbcdn\.net\//i;

export function isPlayableDirectVideoUrl(url: string | null | undefined): boolean {
  const v = (url ?? '').trim();
  if (!v) return false;
  if (DIRECT_VIDEO_URL_RE.test(v)) return true;
  if (FB_CDN_VIDEO_RE.test(v)) return true;
  return v.includes('/v/t42.') || v.includes('/v/t39.');
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

export async function resolveFacebookVideoFromGraph(
  videoId: string,
  accessToken: string,
): Promise<ResolvedFacebookVideo> {
  const empty: ResolvedFacebookVideo = {
    source: null,
    permalinkUrl: null,
    thumbnail: null,
    durationSec: null,
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
      format?: Array<{ embed_html?: string; filter?: string }>;
      error?: { message?: string; code?: number };
    };

    if (!res.ok || payload.error) {
      const msg = payload.error?.message ?? `HTTP ${res.status}`;
      return { ...empty, failureReason: `graph_video_fetch_failed: ${msg}` };
    }

    let source = payload.source?.trim() || null;
    if (!source && Array.isArray(payload.format)) {
      const playable = payload.format.find((f) => f.filter === 'native' || f.filter === '720p');
      const embed = playable?.embed_html ?? '';
      const match = /src="([^"]+)"/i.exec(embed);
      if (match?.[1]) source = match[1].trim();
    }

    if (source && !isPlayableDirectVideoUrl(source)) {
      return {
        source: null,
        permalinkUrl: payload.permalink_url?.trim() || null,
        thumbnail: payload.picture?.trim() || null,
        durationSec: Number.isFinite(payload.length) ? Number(payload.length) : null,
        failureReason: 'graph_source_not_direct_playable_url',
      };
    }

    if (!source) {
      return {
        source: null,
        permalinkUrl: payload.permalink_url?.trim() || null,
        thumbnail: payload.picture?.trim() || null,
        durationSec: Number.isFinite(payload.length) ? Number(payload.length) : null,
        failureReason: 'graph_video_source_missing',
      };
    }

    return {
      source,
      permalinkUrl: payload.permalink_url?.trim() || null,
      thumbnail: payload.picture?.trim() || null,
      durationSec: Number.isFinite(payload.length) ? Number(payload.length) : null,
      failureReason: null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ...empty, failureReason: `graph_video_fetch_exception: ${msg}` };
  }
}

export type FacebookImportMediaPlan = {
  isVideoPost: boolean;
  facebookPostType: FacebookPostType;
  videoUrl: string | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  durationSec: number | null;
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
    videoUrlFailureReason,
    mediaCreate,
  };
}

export const FACEBOOK_GRAPH_POST_FIELDS =
  'id,message,story,created_time,permalink_url,full_picture,attachments{media_type,media{source,image},url,target{id},subattachments}';
