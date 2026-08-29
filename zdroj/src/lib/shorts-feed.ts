import type { ShortVideo } from '@/lib/nest-client';
import { parseApiListingPrice } from '@/types/property';

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
