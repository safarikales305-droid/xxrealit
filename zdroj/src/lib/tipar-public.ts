import { getServerSideApiBaseUrl } from '@/lib/api';
import { upgradeHttpToHttps } from '@/lib/public-urls';

export type TiparPostPublic = {
  id: string;
  title: string;
  description: string;
  images: string[];
  mainImage?: string | null;
  videoUrl?: string | null;
  generatedVideoUrl?: string | null;
  city: string;
  isShorts: boolean;
  publishedPropertyId?: string | null;
  propertyPrice?: number | null;
};

export async function fetchTiparPostPublic(id: string): Promise<TiparPostPublic | null> {
  const trimmed = id.trim();
  const apiBase = getServerSideApiBaseUrl();
  if (!apiBase || !trimmed) return null;
  try {
    const res = await fetch(`${apiBase}/tipar/posts/${encodeURIComponent(trimmed)}`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    return (await res.json().catch(() => null)) as TiparPostPublic | null;
  } catch {
    return null;
  }
}

export function tiparPostVideoUrl(post: Pick<TiparPostPublic, 'videoUrl' | 'generatedVideoUrl'>): string {
  return upgradeHttpToHttps((post.videoUrl || post.generatedVideoUrl || '').trim());
}

export function tiparPostImageUrl(
  post: Pick<TiparPostPublic, 'mainImage' | 'images'>,
): string {
  return upgradeHttpToHttps((post.mainImage || post.images?.[0] || '').trim());
}
