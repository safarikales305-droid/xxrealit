import { upgradeHttpToHttps } from '@/lib/public-urls';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/+$/, '');

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
};

export async function fetchTiparPostPublic(id: string): Promise<TiparPostPublic | null> {
  const trimmed = id.trim();
  if (!API_BASE || !trimmed) return null;
  try {
    const res = await fetch(`${API_BASE}/tipar/posts/${encodeURIComponent(trimmed)}`, {
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
