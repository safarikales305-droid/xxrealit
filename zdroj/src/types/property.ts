import { normalizePublicVideoUrl } from '@/lib/video-url';

/** Shape returned by GET /properties (Nest may use `city`; treat as location in UI). */
export type PropertyFromApi = {
  id: string;
  title: string;
  price: number;
  city?: string;
  location?: string;
  videoUrl?: string | null;
};

export type PropertyFeedItem = {
  id: string;
  title: string;
  price: number;
  location: string;
  videoUrl: string | null;
};

export function normalizeProperty(p: PropertyFromApi): PropertyFeedItem {
  return {
    id: p.id,
    title: p.title,
    price: p.price,
    location: (p.location ?? p.city ?? '').trim() || 'Neuvedeno',
    videoUrl: normalizePublicVideoUrl(p.videoUrl),
  };
}
