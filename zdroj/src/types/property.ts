import { normalizePublicVideoUrl } from '@/lib/video-url';

/** Shape returned by GET /properties (Nest may use `city`; treat as location in UI). */
export type PropertyFromApi = {
  id: string;
  title: string;
  price: number;
  city?: string;
  location?: string;
  videoUrl?: string | null;
  imageUrl?: string | null;
  images?: string[];
  media?: Array<{
    url?: string | null;
    type?: string | null;
    order?: number | null;
    sortOrder?: number | null;
  }>;
  description?: string | null;
  userId?: string;
  ownerCity?: string | null;
  likeCount?: number;
  viewsCount?: number;
  liked?: boolean;
  isOwnerListing?: boolean;
  ownerContactConsent?: boolean;
  directContactVisible?: boolean;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
};

export type PropertyFeedItem = {
  id: string;
  title: string;
  price: number;
  location: string;
  videoUrl: string | null;
  imageUrl?: string | null;
  images?: string[];
  media?: Array<{
    url: string;
    type: 'image' | 'video';
    order: number;
  }>;
  description?: string | null;
  userId?: string;
  ownerCity?: string | null;
  likeCount?: number;
  viewsCount?: number;
  liked?: boolean;
  isOwnerListing?: boolean;
  ownerContactConsent?: boolean;
  directContactVisible?: boolean;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
};

export function normalizeProperty(p: PropertyFromApi): PropertyFeedItem {
  const likeCount =
    typeof p.likeCount === 'number' && Number.isFinite(p.likeCount)
      ? Math.max(0, Math.floor(p.likeCount))
      : undefined;
  const viewsCount =
    typeof p.viewsCount === 'number' && Number.isFinite(p.viewsCount)
      ? Math.max(0, Math.floor(p.viewsCount))
      : undefined;
  const images =
    Array.isArray(p.images) && p.images.length > 0
      ? p.images.filter((x): x is string => typeof x === 'string' && x.length > 0)
      : [];
  const media =
    Array.isArray(p.media) && p.media.length > 0
      ? p.media
          .filter((m): m is { url: string; type: 'image' | 'video'; order: number } => {
            const type = m?.type === 'image' || m?.type === 'video' ? m.type : null;
            const url = typeof m?.url === 'string' ? m.url : '';
            const order =
              typeof m?.order === 'number' && Number.isFinite(m.order)
                ? m.order
                : typeof m?.sortOrder === 'number' && Number.isFinite(m.sortOrder)
                  ? m.sortOrder
                  : 0;
            return Boolean(type && url);
          })
          .sort((a, b) => a.order - b.order)
      : undefined;
  const primaryImageFromMedia = media?.find((m) => m.type === 'image')?.url ?? null;
  return {
    id: p.id,
    title: p.title,
    price: p.price,
    location: (p.location ?? p.city ?? '').trim() || 'Neuvedeno',
    videoUrl: normalizePublicVideoUrl(p.videoUrl),
    imageUrl:
      p.imageUrl === null || typeof p.imageUrl === 'string'
        ? p.imageUrl ?? primaryImageFromMedia ?? images[0] ?? null
        : primaryImageFromMedia ?? images[0] ?? undefined,
    images,
    media,
    description:
      p.description === null || typeof p.description === 'string'
        ? p.description
        : undefined,
    userId: typeof p.userId === 'string' ? p.userId : undefined,
    ownerCity:
      p.ownerCity === null || typeof p.ownerCity === 'string'
        ? p.ownerCity
        : undefined,
    likeCount,
    viewsCount,
    liked: typeof p.liked === 'boolean' ? p.liked : undefined,
    isOwnerListing: typeof p.isOwnerListing === 'boolean' ? p.isOwnerListing : undefined,
    ownerContactConsent:
      typeof p.ownerContactConsent === 'boolean' ? p.ownerContactConsent : undefined,
    directContactVisible:
      typeof p.directContactVisible === 'boolean' ? p.directContactVisible : undefined,
    contactName:
      p.contactName === null || typeof p.contactName === 'string'
        ? p.contactName
        : undefined,
    contactPhone:
      p.contactPhone === null || typeof p.contactPhone === 'string'
        ? p.contactPhone
        : undefined,
    contactEmail:
      p.contactEmail === null || typeof p.contactEmail === 'string'
        ? p.contactEmail
        : undefined,
  };
}

/** Tolerates malformed API rows so a bad item never tears down the whole page. */
export function safeNormalizePropertyFromApi(
  raw: unknown,
): PropertyFeedItem | null {
  if (raw == null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = o.id != null ? String(o.id) : '';
  const title = o.title != null ? String(o.title) : '';
  const price = Number(o.price);
  if (!id || !title || !Number.isFinite(price)) return null;

  try {
    const likeCountRaw = o.likeCount;
    const likeCount =
      typeof likeCountRaw === 'number' ? likeCountRaw : undefined;
    return normalizeProperty({
      id,
      title,
      price,
      city: typeof o.city === 'string' ? o.city : undefined,
      location: typeof o.location === 'string' ? o.location : undefined,
      videoUrl:
        o.videoUrl === null || typeof o.videoUrl === 'string'
          ? o.videoUrl
          : undefined,
      imageUrl:
        o.imageUrl === null || typeof o.imageUrl === 'string'
          ? o.imageUrl
          : undefined,
      images: Array.isArray(o.images)
        ? o.images.filter((x): x is string => typeof x === 'string')
        : undefined,
      media: Array.isArray(o.media)
        ? (o.media as Array<Record<string, unknown>>).map((m) => ({
            url: typeof m.url === 'string' ? m.url : '',
            type: m.type === 'video' ? 'video' : 'image',
            order:
              typeof m.order === 'number'
                ? m.order
                : typeof m.sortOrder === 'number'
                  ? m.sortOrder
                  : 0,
          }))
        : undefined,
      description:
        o.description === null || typeof o.description === 'string'
          ? o.description
          : undefined,
      userId: typeof o.userId === 'string' ? o.userId : undefined,
      ownerCity:
        o.ownerCity === null || typeof o.ownerCity === 'string'
          ? o.ownerCity
          : undefined,
      likeCount,
      viewsCount:
        typeof o.viewsCount === 'number' && Number.isFinite(o.viewsCount)
          ? o.viewsCount
          : undefined,
      liked: typeof o.liked === 'boolean' ? o.liked : undefined,
      isOwnerListing: typeof o.isOwnerListing === 'boolean' ? o.isOwnerListing : undefined,
      ownerContactConsent:
        typeof o.ownerContactConsent === 'boolean' ? o.ownerContactConsent : undefined,
      directContactVisible:
        typeof o.directContactVisible === 'boolean' ? o.directContactVisible : undefined,
      contactName:
        o.contactName === null || typeof o.contactName === 'string'
          ? o.contactName
          : undefined,
      contactPhone:
        o.contactPhone === null || typeof o.contactPhone === 'string'
          ? o.contactPhone
          : undefined,
      contactEmail:
        o.contactEmail === null || typeof o.contactEmail === 'string'
          ? o.contactEmail
          : undefined,
    });
  } catch {
    return null;
  }
}
