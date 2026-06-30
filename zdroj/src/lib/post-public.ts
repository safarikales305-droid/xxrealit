import { getServerSideApiBaseUrl } from '@/lib/api';

export type PostOgMeta = {
  id: string;
  slug: string;
  hasVideo: boolean;
  canonicalPath: string;
  canonicalUrl: string;
  seoTitle: string;
  seoDescription: string;
  imageUrl: string | null;
  videoUrl: string | null;
  videoDurationSec: number | null;
  publishedAt: string;
  authorName: string | null;
};

export async function fetchPostOgMeta(postId: string): Promise<PostOgMeta | null> {
  const apiBase = getServerSideApiBaseUrl();
  const id = postId.trim();
  if (!apiBase || !id) return null;
  const res = await fetch(`${apiBase}/seo/posts/${encodeURIComponent(id)}/og-meta`, {
    next: { revalidate: 300 },
  });
  if (!res.ok) return null;
  return (await res.json()) as PostOgMeta;
}

export async function fetchPostOgMetaBySlug(slug: string): Promise<PostOgMeta | null> {
  const apiBase = getServerSideApiBaseUrl();
  const s = slug.trim();
  if (!apiBase || !s) return null;
  const res = await fetch(`${apiBase}/seo/posts/by-slug/${encodeURIComponent(s)}`, {
    next: { revalidate: 300 },
  });
  if (!res.ok) return null;
  const row = (await res.json()) as { id: string };
  return fetchPostOgMeta(row.id);
}
