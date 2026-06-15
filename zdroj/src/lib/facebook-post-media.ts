import type { ListingPost } from '@/lib/nest-client';

export type FacebookPostMediaMode =
  | 'none'
  | 'image'
  | 'video'
  | 'facebook-embed'
  | 'facebook-external';

export type ResolvedFacebookPostMedia = {
  mode: FacebookPostMediaMode;
  videoUrl: string | null;
  imageUrl: string | null;
  posterUrl: string | null;
  embedUrl: string | null;
  permalink: string | null;
  isFacebookVideo: boolean;
};

type PostLike = {
  source?: ListingPost['source'];
  isFacebookPagePost?: ListingPost['isFacebookPagePost'];
  facebookPostType?: ListingPost['facebookPostType'];
  facebookEmbedUrl?: ListingPost['facebookEmbedUrl'];
  facebookPermalink?: ListingPost['facebookPermalink'];
  externalUrl?: ListingPost['externalUrl'];
  videoUrl?: ListingPost['videoUrl'];
  imageUrl?: ListingPost['imageUrl'];
  previewImage?: ListingPost['previewImage'];
  previewSiteName?: ListingPost['previewSiteName'];
  facebookVideoThumbnail?: string | null;
  facebookVideoHasAudio?: boolean | null;
  media?: Array<{ id?: string; url?: string; type?: string; order?: number }>;
};

const MUTED_URL_HINT_RE = /(?:mute|muted|silent|sf=mo|without_audio)/i;
const THUMB_URL_HINT_RE = /(?:thumbnail|thumb|poster|preview|story_pic|\/p\d+x\d+)/i;
const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif)(\?|$)/i;

function isThumbnailVideoUrl(videoUrl: string | null, posterUrl: string | null): boolean {
  const v = String(videoUrl ?? '').trim();
  if (!v) return true;
  const poster = String(posterUrl ?? '').trim();
  if (poster && v === poster) return true;
  if (IMAGE_EXT_RE.test(v)) return true;
  if (THUMB_URL_HINT_RE.test(v) && !/^https?:\/\/(?:video|scontent)\..*\.fbcdn\.net\//i.test(v)) {
    return true;
  }
  return false;
}

function videoUrlLikelyHasAudio(url: string | null | undefined): boolean {
  const v = String(url ?? '').trim();
  if (!v) return false;
  return !MUTED_URL_HINT_RE.test(v);
}

function facebookVideoHasPlayableAudio(post: PostLike, videoUrl: string | null): boolean {
  if (post.facebookVideoHasAudio === true) return true;
  if (post.facebookVideoHasAudio === false) return false;
  return videoUrlLikelyHasAudio(videoUrl);
}

export function isFacebookReelPost(post: PostLike): boolean {
  return String(post.facebookPostType ?? '').toUpperCase() === 'FACEBOOK_REEL';
}

export function getFacebookVideoContainerClass(postType?: string | null): string {
  const isReel = String(postType ?? '').toUpperCase() === 'FACEBOOK_REEL';
  if (isReel) {
    return 'relative mx-auto aspect-[9/16] w-full max-w-[360px] max-h-[75vh] md:max-h-[720px]';
  }
  return 'relative aspect-video w-full max-h-[70vh]';
}

export function isFacebookImportPost(post: PostLike): boolean {
  return (
    post.source === 'FACEBOOK' ||
    Boolean(post.isFacebookPagePost) ||
    String(post.previewSiteName ?? '').toLowerCase().includes('facebook')
  );
}

export function isFacebookVideoPost(post: PostLike): boolean {
  const type = String(post.facebookPostType ?? '').toUpperCase();
  if (type === 'FACEBOOK_VIDEO' || type === 'FACEBOOK_REEL') return true;
  const hasVideoMedia = (post.media ?? []).some((m) => m.type === 'video');
  const hasVideoUrl = Boolean(String(post.videoUrl ?? '').trim());
  return hasVideoUrl || hasVideoMedia;
}

function firstMediaUrl(post: PostLike, mediaType: 'video' | 'image'): string | null {
  const sorted = (post.media ?? [])
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const row = sorted.find((m) => m.type === mediaType);
  return row?.url?.trim() || null;
}

export function resolveFacebookPostMedia(post: PostLike): ResolvedFacebookPostMedia {
  const isFb = isFacebookImportPost(post);
  const isFbVideo = isFacebookVideoPost(post);
  const permalink = String(post.facebookPermalink ?? post.externalUrl ?? '').trim() || null;
  const embedUrl = String(post.facebookEmbedUrl ?? '').trim() || null;
  const posterUrl =
    String(post.facebookVideoThumbnail ?? post.previewImage ?? '').trim() ||
    (isFbVideo ? null : String(post.imageUrl ?? '').trim() || null);

  const videoUrl =
    String(post.videoUrl ?? firstMediaUrl(post, 'video') ?? '').trim() || null;

  if (isFbVideo) {
    if (
      videoUrl &&
      !isThumbnailVideoUrl(videoUrl, posterUrl) &&
      facebookVideoHasPlayableAudio(post, videoUrl)
    ) {
      return {
        mode: 'video',
        videoUrl,
        imageUrl: null,
        posterUrl,
        embedUrl: null,
        permalink,
        isFacebookVideo: true,
      };
    }
    if (embedUrl) {
      return {
        mode: 'facebook-embed',
        videoUrl: null,
        imageUrl: null,
        posterUrl,
        embedUrl,
        permalink,
        isFacebookVideo: true,
      };
    }
    if (permalink) {
      return {
        mode: 'facebook-external',
        videoUrl: null,
        imageUrl: null,
        posterUrl,
        embedUrl: null,
        permalink,
        isFacebookVideo: true,
      };
    }
    return {
      mode: 'none',
      videoUrl: null,
      imageUrl: null,
      posterUrl,
      embedUrl: null,
      permalink,
      isFacebookVideo: true,
    };
  }

  if (videoUrl) {
    return {
      mode: 'video',
      videoUrl,
      imageUrl: null,
      posterUrl,
      embedUrl: null,
      permalink,
      isFacebookVideo: isFbVideo || isFb,
    };
  }

  const imageUrl =
    !isFbVideo
      ? firstMediaUrl(post, 'image') ||
        String(post.imageUrl ?? post.previewImage ?? '').trim() ||
        null
      : null;

  if (imageUrl && !isFbVideo) {
    return {
      mode: 'image',
      videoUrl: null,
      imageUrl,
      posterUrl: null,
      embedUrl: null,
      permalink,
      isFacebookVideo: false,
    };
  }

  if (isFb && embedUrl && !isFbVideo) {
    return {
      mode: 'facebook-embed',
      videoUrl: null,
      imageUrl: null,
      posterUrl,
      embedUrl,
      permalink,
      isFacebookVideo: false,
    };
  }

  return {
    mode: 'none',
    videoUrl: null,
    imageUrl: null,
    posterUrl,
    embedUrl,
    permalink,
    isFacebookVideo: false,
  };
}

export function filterPostMediaForDisplay(
  post: PostLike,
): Array<{ id?: string; url: string; type: string; order: number }> {
  const resolved = resolveFacebookPostMedia(post);
  const sorted = (post.media ?? [])
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .filter((m): m is { id?: string; url: string; type: string; order: number } =>
      Boolean(m.url?.trim() && m.type),
    )
    .map((m, index) => ({
      id: m.id,
      url: m.url!.trim(),
      type: m.type!,
      order: m.order ?? index + 1,
    }));

  if (resolved.mode === 'video') {
    const videos = sorted.filter((m) => m.type === 'video');
    if (videos.length) return videos;
    if (resolved.videoUrl) {
      return [{ url: resolved.videoUrl, type: 'video', order: 1 }];
    }
    return [];
  }

  if (resolved.mode === 'image') {
    return sorted.filter((m) => m.type === 'image');
  }

  if (resolved.isFacebookVideo) {
    return [];
  }

  return sorted;
}
