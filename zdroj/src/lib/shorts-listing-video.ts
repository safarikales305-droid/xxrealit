import { upgradeHttpToHttps } from '@/lib/public-urls';

function str(v: unknown): string | null {
  if (typeof v === 'string') {
    const t = v.trim();
    return t.length ? t : null;
  }
  return null;
}

function videoFromMedia(property: Record<string, unknown>): string | null {
  const media = property.media;
  if (!Array.isArray(media)) return null;
  for (const row of media) {
    if (!row || typeof row !== 'object') continue;
    const m = row as Record<string, unknown>;
    const type = str(m.type)?.toLowerCase();
    const url = str(m.url);
    if (type === 'video' && url) return url;
  }
  return null;
}

/** Priorita zdroje videa pro veřejný Shorts detail. */
export function resolveShortsListingVideoUrl(property: Record<string, unknown>): string | null {
  const candidates = [
    str(property.generatedVideoUrl),
    str(property.videoUrl),
    str(property.importedVideoUrl),
    videoFromMedia(property),
  ];
  for (const raw of candidates) {
    if (raw) return upgradeHttpToHttps(raw);
  }
  return null;
}

export function resolveShortsListingImageUrl(property: Record<string, unknown>): string | null {
  const gallery = property.galleryImages ?? property.images;
  const images = Array.isArray(gallery)
    ? gallery.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    : [];
  const candidates = [
    str(property.mainImage),
    str(property.imageUrl),
    str(property.thumbnailUrl),
    str(property.generatedVideoThumbnail),
    images[0] ?? null,
  ];
  for (const raw of candidates) {
    if (raw) return upgradeHttpToHttps(raw);
  }
  return null;
}

export type PublicShortsListing = {
  id: string;
  title: string;
  city: string | null;
  videoUrl: string | null;
  imageUrl: string | null;
  isShorts: boolean;
  isActive: boolean;
  isVisible: boolean;
};

export function parsePublicShortsListing(
  property: Record<string, unknown>,
  fallbackId: string,
): PublicShortsListing {
  return {
    id: str(property.id) ?? fallbackId,
    title: str(property.title) ?? 'Inzerát',
    city: str(property.city) ?? str(property.location),
    videoUrl: resolveShortsListingVideoUrl(property),
    imageUrl: resolveShortsListingImageUrl(property),
    isShorts: property.isShorts === true || String(property.listingType ?? '').toUpperCase() === 'SHORTS',
    isActive: property.isActive !== false,
    isVisible: property.isVisible !== false,
  };
}
