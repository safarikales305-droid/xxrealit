import type { ShortVideo } from '@/lib/nest-client';
import { isShortVideoPlayable } from '@/lib/feed/loop-feed';
import { parseApiListingPrice } from '@/types/property';

const YOUTUBE_ID_RE = /^[a-zA-Z0-9_-]{11}$/;
const YOUTUBE_URL_RE =
  /(?:youtube\.com\/(?:watch\?(?:[^&\s]+&)*v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i;

export type ShortsItemType =
  | 'property'
  | 'property-video'
  | 'youtube'
  | 'article'
  | 'news'
  | 'editorial'
  | 'post'
  | 'finance';

export type ShortsFeedItem = {
  feedKey: string;
  contentType: ShortsItemType;
  score?: number;
  publishedAt: string | null;
  payload: Record<string, unknown>;
};

export type ShortsFeedResponse = {
  items: ShortsFeedItem[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type ShortsFeedSettings = {
  showProperties: boolean;
  showYoutube: boolean;
  showArticles: boolean;
  showNews: boolean;
  showEditorial: boolean;
  showUserPosts: boolean;
  showFinanceNews: boolean;
  propertyPriority: 'high' | 'medium' | 'low';
  contentEveryNItems: number;
  minPropertyRatioPercent: number;
  propertyRatioTierLow: number;
  propertyRatioTierMid: number;
  propertyRatioTierHigh: number;
  preferNewContent: boolean;
  preferYoutubeWhenLowCatalog: boolean;
  lowCatalogThreshold: number;
  youtubePriority: 'high' | 'medium' | 'low';
  maxArticlesPer10Shorts: number;
};

export const SHORTS_BADGE_LABELS: Record<ShortsItemType, string> = {
  property: '🏠 Reality',
  'property-video': '🎥 Video',
  youtube: '▶ YouTube',
  article: '💡 Článek',
  news: '📰 Aktualita',
  editorial: '💡 Tip',
  post: '📝 Příspěvek',
  finance: '💰 Finance',
};

export function isPropertyShortsItem(item: ShortsFeedItem): boolean {
  return item.contentType === 'property' || item.contentType === 'property-video';
}

export function normalizeShortsFeedItem(item: ShortsFeedItem): ShortsFeedItem {
  const raw = String(item.contentType ?? '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
  const contentTypeMap: Record<string, ShortsItemType> = {
    property: 'property',
    property_video: 'property-video',
    youtube: 'youtube',
    youtube_video: 'youtube',
    article: 'article',
    news: 'news',
    editorial: 'editorial',
    editorial_post: 'editorial',
    post: 'post',
    user_post: 'post',
    finance: 'finance',
    finance_news: 'finance',
  };
  const contentType = contentTypeMap[raw] ?? item.contentType;
  const payload = { ...item.payload };
  if (contentType === 'youtube') {
    const videoId = resolveYoutubeVideoId(payload);
    if (videoId) {
      payload.youtubeVideoId = videoId;
      if (!resolveShortsMediaUrl(payload)) {
        payload.imageUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
        payload.youtubeThumbnailUrl = payload.imageUrl;
      }
    }
  }
  return { ...item, contentType, payload };
}

export function shortsPayloadToShortVideo(payload: Record<string, unknown>): ShortVideo | null {
  const id = payload.id != null ? String(payload.id) : '';
  if (!id) return null;
  const rawCreated = payload.createdAt;
  const createdAt =
    typeof rawCreated === 'string'
      ? rawCreated
      : rawCreated instanceof Date
        ? rawCreated.toISOString()
        : new Date().toISOString();
  const userIdRaw = payload.userId ?? payload.ownerId ?? (payload.user as { id?: unknown } | undefined)?.id;
  const userId = userIdRaw != null && String(userIdRaw).trim() ? String(userIdRaw).trim() : undefined;
  const pubRaw = payload.publishedAt;
  const publishedAt =
    typeof pubRaw === 'string'
      ? pubRaw
      : pubRaw instanceof Date
        ? pubRaw.toISOString()
        : null;
  const viewsRaw = payload.viewsCount ?? payload.views ?? payload.viewCount;
  const viewsCount =
    typeof viewsRaw === 'number'
      ? Math.max(0, Math.trunc(viewsRaw))
      : typeof viewsRaw === 'string'
        ? Math.max(0, Math.trunc(Number.parseInt(viewsRaw, 10) || 0))
        : undefined;

  return {
    id,
    videoUrl: typeof payload.videoUrl === 'string' ? payload.videoUrl : null,
    url: typeof payload.url === 'string' ? payload.url : undefined,
    title: payload.title != null ? String(payload.title) : null,
    price: parseApiListingPrice(payload.price),
    city: typeof payload.city === 'string' ? payload.city : null,
    createdAt,
    publishedAt,
    viewsCount,
    userId,
    liked: typeof payload.liked === 'boolean' ? payload.liked : undefined,
    images: Array.isArray(payload.images)
      ? (payload.images as unknown[]).filter((x): x is string => typeof x === 'string' && x.length > 0)
      : undefined,
    imageUrl: typeof payload.imageUrl === 'string' ? payload.imageUrl : null,
    isTiparTip: payload.isTiparTip === true || payload.isTip === true,
    isTip: payload.isTip === true || payload.isTiparTip === true,
    listingType: typeof payload.listingType === 'string' ? payload.listingType : null,
    contactUnlocked: payload.contactUnlocked === true,
    sellerContactVisible: payload.sellerContactVisible === true,
    buyerInterestSubmitted: payload.buyerInterestSubmitted === true,
    contactUnlockPrice:
      typeof payload.contactUnlockPrice === 'number' && Number.isFinite(payload.contactUnlockPrice)
        ? payload.contactUnlockPrice
        : undefined,
    contactUnlockAvailable: payload.contactUnlockAvailable !== false,
  };
}

export function formatShortsDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function parseYoutubeVideoIdFromText(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (YOUTUBE_ID_RE.test(trimmed)) return trimmed;
  const match = trimmed.match(YOUTUBE_URL_RE);
  return match?.[1] && YOUTUBE_ID_RE.test(match[1]) ? match[1] : null;
}

export function resolveYoutubeVideoId(payload: Record<string, unknown>): string | null {
  const direct = payload.youtubeVideoId ?? payload.youtube_video_id;
  if (typeof direct === 'string') {
    const id = direct.trim();
    if (YOUTUBE_ID_RE.test(id)) return id;
  }
  const fromUrl = [
    payload.videoUrl,
    payload.externalUrl,
    payload.href,
    payload.youtubeUrl,
  ]
    .map((v) => (typeof v === 'string' ? parseYoutubeVideoIdFromText(v) : null))
    .find((v): v is string => Boolean(v));
  if (fromUrl) return fromUrl;
  const thumb =
    typeof payload.youtubeThumbnailUrl === 'string'
      ? payload.youtubeThumbnailUrl
      : typeof payload.imageUrl === 'string'
        ? payload.imageUrl
        : '';
  const thumbMatch = thumb.match(/\/vi\/([a-zA-Z0-9_-]{11})\//);
  return thumbMatch?.[1] && YOUTUBE_ID_RE.test(thumbMatch[1]) ? thumbMatch[1] : null;
}

export function resolveShortsMediaUrl(payload: Record<string, unknown>): string | null {
  const candidates = [
    payload.imageUrl,
    payload.thumbnailUrl,
    payload.youtubeThumbnailUrl,
    payload.previewImage,
    payload.ogImageUrl,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  const ytId = resolveYoutubeVideoId(payload);
  return ytId ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : null;
}

export function isRenderableShortsItem(item: ShortsFeedItem): boolean {
  const normalized = normalizeShortsFeedItem(item);
  const p = normalized.payload;
  const title = String(p.title ?? '').trim();

  if (isPropertyShortsItem(normalized)) {
    const video = shortsPayloadToShortVideo(p);
    return video != null && isShortVideoPlayable(video);
  }

  if (normalized.contentType === 'youtube') {
    return Boolean(resolveYoutubeVideoId(p) && title);
  }

  if (['article', 'news', 'editorial', 'finance', 'post'].includes(normalized.contentType)) {
    return Boolean(title && resolveShortsMediaUrl(p));
  }

  return false;
}

/** @deprecated Use isRenderableShortsItem */
export function isPlayableShortsItem(item: ShortsFeedItem): boolean {
  return isRenderableShortsItem(item);
}
