import { getNestPublicOrigin } from '@/lib/api';
import { getFirstValidImage, isValidImageUrl, normalizeImageCandidate } from '@/lib/images';
import { normalizePublicVideoUrl } from '@/lib/video-url';
import { formatListingPrice, normalizePrice } from '@/lib/price';
export { formatListingPrice, normalizePrice } from '@/lib/price';

/** API může vrátit cenu null („na dotaz“). */
export function parseApiListingPrice(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  const normalized = normalizePrice(n);
  return normalized == null ? null : Math.trunc(normalized);
}

export function formatListingPriceCzk(price: number | null | undefined): string {
  return formatListingPrice(price);
}

function firstPhotoUrlFromPhotos(photos: unknown): string | null {
  if (!Array.isArray(photos) || photos.length === 0) return null;
  const x = photos[0];
  if (typeof x === 'string' && x.trim()) return x.trim();
  if (x && typeof x === 'object' && 'url' in x) {
    const u = (x as { url?: unknown }).url;
    if (typeof u === 'string' && u.trim()) return u.trim();
  }
  return null;
}

/** Náhled klasické karty: `cover` z API, pak thumbnail / imageUrl / coverImage / photos / media / images. */
export function classicListingCoverUrl(p: PropertyFeedItem): string | null {
  const ext = p as PropertyFeedItem & {
    cover?: string | null;
    thumbnail?: string | null;
    coverImage?: string | null;
    photos?: Array<{ url?: string } | string>;
  };
  const ph = firstPhotoUrlFromPhotos(ext.photos);
  const fromMedia = ext.media?.find((m) => m.type === 'image')?.url?.trim();
  const base = getNestPublicOrigin() || undefined;
  return getFirstValidImage(
    [
      typeof ext.cover === 'string' ? ext.cover.trim() : '',
      ext.thumbnail?.trim(),
      ext.imageUrl?.trim(),
      ext.coverImage?.trim(),
      ph,
      fromMedia,
      ext.images?.[0]?.trim(),
    ],
    base,
  );
}

/** Shape returned by GET /properties (Nest may use `city`; treat as location in UI). */
export type PropertyFromApi = {
  id: string;
  title: string;
  price: number | null;
  city?: string;
  location?: string;
  videoUrl?: string | null;
  /** Jednotná validní náhledová URL z API (nullable). */
  cover?: string | null;
  imageUrl?: string | null;
  thumbnail?: string | null;
  coverImage?: string | null;
  images?: string[];
  photos?: Array<{ url: string } | string>;
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
  price: number | null;
  location: string;
  videoUrl: string | null;
  cover?: string | null;
  imageUrl?: string | null;
  thumbnail?: string | null;
  coverImage?: string | null;
  images?: string[];
  photos?: Array<{ url: string } | string>;
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
  const assetBase = getNestPublicOrigin() || undefined;
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
      ? p.images
          .filter((x): x is string => typeof x === 'string' && x.length > 0)
          .map((x) => normalizeImageCandidate(x.trim(), assetBase))
          .filter((x): x is string => isValidImageUrl(x))
      : [];
  const photos = Array.isArray(p.photos) ? p.photos : undefined;
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
          .map((m) => {
            if (m.type === 'video') {
              return { url: m.url.trim(), type: 'video' as const, order: m.order };
            }
            const normalized =
              normalizeImageCandidate(m.url.trim(), assetBase) ?? '';
            return { url: normalized, type: 'image' as const, order: m.order };
          })
          .filter((m) =>
            m.type === 'video' ? Boolean(m.url) : isValidImageUrl(m.url),
          )
      : undefined;
  const primaryImageFromMedia = media?.find((m) => m.type === 'image')?.url ?? null;
  const photo0 = firstPhotoUrlFromPhotos(photos);
  const thumb = typeof p.thumbnail === 'string' ? p.thumbnail.trim() : '';
  const coverLegacy = typeof p.coverImage === 'string' ? p.coverImage.trim() : '';
  const coverApi = typeof p.cover === 'string' ? p.cover.trim() : '';
  const imgField =
    typeof p.imageUrl === 'string' && p.imageUrl.trim() ? p.imageUrl.trim() : '';
  const resolvedImage = getFirstValidImage(
    [coverApi, thumb, imgField, coverLegacy, photo0, primaryImageFromMedia, images[0]],
    assetBase,
  );
  const priceVal = parseApiListingPrice(p.price);

  return {
    id: p.id,
    title: p.title,
    price: priceVal,
    location: (p.location ?? p.city ?? '').trim() || 'Neuvedeno',
    videoUrl: normalizePublicVideoUrl(p.videoUrl),
    thumbnail: thumb || null,
    coverImage: coverLegacy || null,
    cover: resolvedImage,
    photos,
    imageUrl: resolvedImage,
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
  if (!id || !title) return null;

  try {
    const likeCountRaw = o.likeCount;
    const likeCount =
      typeof likeCountRaw === 'number' ? likeCountRaw : undefined;
    return normalizeProperty({
      id,
      title,
      price: parseApiListingPrice(o.price),
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
      cover: o.cover === null || typeof o.cover === 'string' ? o.cover : undefined,
      thumbnail:
        o.thumbnail === null || typeof o.thumbnail === 'string' ? o.thumbnail : undefined,
      coverImage:
        o.coverImage === null || typeof o.coverImage === 'string' ? o.coverImage : undefined,
      images: Array.isArray(o.images)
        ? o.images.filter((x): x is string => typeof x === 'string')
        : undefined,
      photos: Array.isArray(o.photos) ? (o.photos as PropertyFromApi['photos']) : undefined,
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
