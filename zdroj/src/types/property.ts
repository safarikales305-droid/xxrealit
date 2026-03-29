import { normalizePublicVideoUrl } from '@/lib/video-url';

/** Shape returned by GET /properties (Nest may use `city`; treat as location in UI). */
export type PropertyFromApi = {
  id: string;
  title: string;
  price: number;
  city?: string;
  location?: string;
  videoUrl?: string | null;
  userId?: string;
  ownerCity?: string | null;
  likeCount?: number;
  liked?: boolean;
};

export type PropertyFeedItem = {
  id: string;
  title: string;
  price: number;
  location: string;
  videoUrl: string | null;
  userId?: string;
  ownerCity?: string | null;
  likeCount?: number;
  liked?: boolean;
};

export function normalizeProperty(p: PropertyFromApi): PropertyFeedItem {
  const likeCount =
    typeof p.likeCount === 'number' && Number.isFinite(p.likeCount)
      ? Math.max(0, Math.floor(p.likeCount))
      : undefined;
  return {
    id: p.id,
    title: p.title,
    price: p.price,
    location: (p.location ?? p.city ?? '').trim() || 'Neuvedeno',
    videoUrl: normalizePublicVideoUrl(p.videoUrl),
    userId: typeof p.userId === 'string' ? p.userId : undefined,
    ownerCity:
      p.ownerCity === null || typeof p.ownerCity === 'string'
        ? p.ownerCity
        : undefined,
    likeCount,
    liked: typeof p.liked === 'boolean' ? p.liked : undefined,
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
      userId: typeof o.userId === 'string' ? o.userId : undefined,
      ownerCity:
        o.ownerCity === null || typeof o.ownerCity === 'string'
          ? o.ownerCity
          : undefined,
      likeCount,
      liked: typeof o.liked === 'boolean' ? o.liked : undefined,
    });
  } catch {
    return null;
  }
}
