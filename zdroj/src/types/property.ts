import { getNestPublicOrigin } from '@/lib/api';
import { getFirstValidImage, isValidImageUrl, normalizeImageCandidate } from '@/lib/images';
import { normalizePublicVideoUrl } from '@/lib/video-url';
import { formatListingPrice, normalizePrice } from '@/lib/price';
export { formatListingPrice, normalizePrice } from '@/lib/price';

/** API může vrátit cenu null („na dotaz“), číslo nebo řetězec z JSON. */
export function parseApiListingPrice(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') {
    const normalized = normalizePrice(v);
    return normalized == null ? null : Math.trunc(normalized);
  }
  if (typeof v === 'string') {
    const cleaned = v.trim().replace(/[\s\u00a0\u202f]/g, '');
    if (!cleaned) return null;
    let candidate = cleaned;
    if (/^\d{1,3}(\.\d{3})+(\,\d+)?$/.test(cleaned)) {
      candidate = cleaned.replace(/\./g, '').replace(',', '.');
    }
    const n = Number(candidate.replace(',', '.'));
    const normalized = normalizePrice(n);
    return normalized == null ? null : Math.trunc(normalized);
  }
  const n = Number(v);
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
  price?: number | null | string;
  city?: string;
  /** Ulice / číslo z importu nebo zadavatele. */
  address?: string | null;
  location?: string;
  videoUrl?: string | null;
  /** Jednotná validní náhledová URL z API (nullable). */
  cover?: string | null;
  imageUrl?: string | null;
  thumbnail?: string | null;
  coverImage?: string | null;
  images?: string[];
  galleryImages?: string[];
  mainImage?: string | null;
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
  companyName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  /** Klasifikace importu (GET /properties + filtry). */
  sourcePortalKey?: string | null;
  sourcePortalLabel?: string | null;
  propertyTypeKey?: string | null;
  propertyTypeLabel?: string | null;
  importCategoryKey?: string | null;
  importCategoryLabel?: string | null;
  canGenerateShorts?: boolean;
  shortsGenerated?: boolean;
  shortsSourceType?: string | null;
  region?: string | null;
  district?: string | null;
  importSource?: string | null;
  importMethod?: string | null;
  sourceUrl?: string | null;
  sourcePortal?: string | null;
};

export type PropertyFeedItem = {
  id: string;
  title: string;
  price: number | null;
  location: string;
  address?: string | null;
  videoUrl: string | null;
  cover?: string | null;
  imageUrl?: string | null;
  thumbnail?: string | null;
  coverImage?: string | null;
  images?: string[];
  galleryImages?: string[];
  mainImage?: string | null;
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
  companyName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  sourcePortalKey?: string | null;
  sourcePortalLabel?: string | null;
  propertyTypeKey?: string | null;
  propertyTypeLabel?: string | null;
  importCategoryKey?: string | null;
  importCategoryLabel?: string | null;
  canGenerateShorts?: boolean;
  shortsGenerated?: boolean;
  shortsSourceType?: string | null;
  region?: string | null;
  district?: string | null;
  importSource?: string | null;
  importMethod?: string | null;
  sourceUrl?: string | null;
  sourcePortal?: string | null;
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
      : Array.isArray(p.galleryImages) && p.galleryImages.length > 0
        ? p.galleryImages
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
    [p.mainImage ?? null, coverApi, thumb, imgField, coverLegacy, photo0, primaryImageFromMedia, images[0]],
    assetBase,
  );
  const priceVal = parseApiListingPrice(p.price);

  return {
    id: p.id,
    title: p.title,
    price: priceVal,
    location: (p.location ?? p.city ?? '').trim() || 'Neuvedeno',
    address:
      p.address === null || typeof p.address === 'string'
        ? (typeof p.address === 'string' ? p.address.trim() || null : null)
        : undefined,
    videoUrl: normalizePublicVideoUrl(p.videoUrl),
    thumbnail: thumb || null,
    coverImage: coverLegacy || null,
    cover: resolvedImage,
    photos,
    imageUrl: resolvedImage,
    images,
    galleryImages: images,
    mainImage: resolvedImage,
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
    companyName:
      p.companyName === null || typeof p.companyName === 'string'
        ? p.companyName
        : undefined,
    contactPhone:
      p.contactPhone === null || typeof p.contactPhone === 'string'
        ? p.contactPhone
        : undefined,
    contactEmail:
      p.contactEmail === null || typeof p.contactEmail === 'string'
        ? p.contactEmail
        : undefined,
    sourcePortalKey:
      p.sourcePortalKey === null || typeof p.sourcePortalKey === 'string'
        ? p.sourcePortalKey
        : undefined,
    sourcePortalLabel:
      p.sourcePortalLabel === null || typeof p.sourcePortalLabel === 'string'
        ? p.sourcePortalLabel
        : undefined,
    propertyTypeKey:
      p.propertyTypeKey === null || typeof p.propertyTypeKey === 'string'
        ? p.propertyTypeKey
        : undefined,
    propertyTypeLabel:
      p.propertyTypeLabel === null || typeof p.propertyTypeLabel === 'string'
        ? p.propertyTypeLabel
        : undefined,
    importCategoryKey:
      p.importCategoryKey === null || typeof p.importCategoryKey === 'string'
        ? p.importCategoryKey
        : undefined,
    importCategoryLabel:
      p.importCategoryLabel === null || typeof p.importCategoryLabel === 'string'
        ? p.importCategoryLabel
        : undefined,
    canGenerateShorts: typeof p.canGenerateShorts === 'boolean' ? p.canGenerateShorts : undefined,
    shortsGenerated: typeof p.shortsGenerated === 'boolean' ? p.shortsGenerated : undefined,
    shortsSourceType:
      p.shortsSourceType === null || typeof p.shortsSourceType === 'string'
        ? p.shortsSourceType
        : undefined,
    region: p.region === null || typeof p.region === 'string' ? p.region : undefined,
    district: p.district === null || typeof p.district === 'string' ? p.district : undefined,
    importSource:
      p.importSource === null || typeof p.importSource === 'string' ? p.importSource : undefined,
    importMethod:
      p.importMethod === null || typeof p.importMethod === 'string' ? p.importMethod : undefined,
    sourceUrl:
      p.sourceUrl === null || typeof p.sourceUrl === 'string' ? p.sourceUrl : undefined,
    sourcePortal:
      p.sourcePortal === null || typeof p.sourcePortal === 'string' ? p.sourcePortal : undefined,
  };
}

/** Tolerates malformed API rows so a bad item never tears down the whole page. */
export function safeNormalizePropertyFromApi(
  raw: unknown,
): PropertyFeedItem | null {
  if (raw == null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = o.id != null ? String(o.id) : '';
  const titleRaw = o.title != null ? String(o.title).trim() : '';
  const title = titleRaw || 'Inzerát bez názvu';
  if (!id) return null;

  try {
    const likeCountRaw = o.likeCount;
    const likeCount =
      typeof likeCountRaw === 'number' ? likeCountRaw : undefined;
    return normalizeProperty({
      id,
      title,
      price: o.price as PropertyFromApi['price'],
      city: typeof o.city === 'string' ? o.city : undefined,
      address:
        o.address === null || typeof o.address === 'string' ? (o.address as string | null) : undefined,
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
      galleryImages: Array.isArray(o.galleryImages)
        ? o.galleryImages.filter((x): x is string => typeof x === 'string')
        : undefined,
      mainImage:
        o.mainImage === null || typeof o.mainImage === 'string' ? o.mainImage : undefined,
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
      companyName:
        o.companyName === null || typeof o.companyName === 'string'
          ? o.companyName
          : undefined,
      contactPhone:
        o.contactPhone === null || typeof o.contactPhone === 'string'
          ? o.contactPhone
          : undefined,
      contactEmail:
        o.contactEmail === null || typeof o.contactEmail === 'string'
          ? o.contactEmail
          : undefined,
      sourcePortalKey:
        o.sourcePortalKey === null || typeof o.sourcePortalKey === 'string'
          ? o.sourcePortalKey
          : undefined,
      sourcePortalLabel:
        o.sourcePortalLabel === null || typeof o.sourcePortalLabel === 'string'
          ? o.sourcePortalLabel
          : undefined,
      propertyTypeKey:
        o.propertyTypeKey === null || typeof o.propertyTypeKey === 'string'
          ? o.propertyTypeKey
          : undefined,
      propertyTypeLabel:
        o.propertyTypeLabel === null || typeof o.propertyTypeLabel === 'string'
          ? o.propertyTypeLabel
          : undefined,
      importCategoryKey:
        o.importCategoryKey === null || typeof o.importCategoryKey === 'string'
          ? o.importCategoryKey
          : undefined,
      importCategoryLabel:
        o.importCategoryLabel === null || typeof o.importCategoryLabel === 'string'
          ? o.importCategoryLabel
          : undefined,
      canGenerateShorts: typeof o.canGenerateShorts === 'boolean' ? o.canGenerateShorts : undefined,
      shortsGenerated: typeof o.shortsGenerated === 'boolean' ? o.shortsGenerated : undefined,
      shortsSourceType:
        o.shortsSourceType === null || typeof o.shortsSourceType === 'string'
          ? o.shortsSourceType
          : undefined,
      region: o.region === null || typeof o.region === 'string' ? o.region : undefined,
      district: o.district === null || typeof o.district === 'string' ? o.district : undefined,
      importSource:
        o.importSource === null || typeof o.importSource === 'string' ? o.importSource : undefined,
      importMethod:
        o.importMethod === null || typeof o.importMethod === 'string' ? o.importMethod : undefined,
      sourceUrl:
        o.sourceUrl === null || typeof o.sourceUrl === 'string' ? o.sourceUrl : undefined,
      sourcePortal:
        o.sourcePortal === null || typeof o.sourcePortal === 'string'
          ? o.sourcePortal
          : undefined,
    });
  } catch {
    return null;
  }
}
