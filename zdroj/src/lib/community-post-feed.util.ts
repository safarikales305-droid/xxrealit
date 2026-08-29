import type { ListingPost } from '@/lib/nest-client';

const PORTAL_HOST_RE = /(^|\.)xxrealit\.cz$/i;

function normalizeImageUrl(url: string | null | undefined): string {
  return (url ?? '').trim().toLowerCase();
}

/** Vybere jediný hlavní obrázek článku (featured / og / preview / image). */
export function pickArticleHeroImageUrl(
  post: Pick<ListingPost, 'imageUrl' | 'previewImage'> & {
    media?: Array<{ url?: string | null }>;
  },
): string | null {
  const candidates = [
    post.imageUrl,
    post.previewImage,
    ...(post.media ?? []).map((m) => m.url),
  ]
    .map((u) => (u ?? '').trim())
    .filter(Boolean);

  const seen = new Set<string>();
  for (const url of candidates) {
    const key = normalizeImageUrl(url);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    return url;
  }
  return null;
}

function isPortalUrl(url: string): boolean {
  try {
    const u = new URL(url, 'https://www.xxrealit.cz');
    return PORTAL_HOST_RE.test(u.hostname);
  } catch {
    return url.startsWith('/');
  }
}

/** Interní detail příspěvku / článku — nikdy URL obrázku. */
export function resolveCommunityPostDetailHref(post: ListingPost): string {
  const slug = String((post as { slug?: string }).slug ?? '').trim();
  if (slug) return `/prispevek/${encodeURIComponent(slug)}`;

  const external = String(post.externalUrl ?? '').trim();
  if (external) {
    if (external.startsWith('/')) return external;
    if (isPortalUrl(external)) {
      try {
        const u = new URL(external);
        return `${u.pathname}${u.search}${u.hash}`;
      } catch {
        return external;
      }
    }
    return external;
  }

  const id = String(post.id ?? '').trim();
  return id ? `/prispevky/${encodeURIComponent(id)}` : '/?tab=posts';
}

export function communityPostFeedDate(post: ListingPost): number {
  const raw = post.publishedAt ?? post.createdAt;
  const t = raw ? Date.parse(String(raw)) : NaN;
  return Number.isFinite(t) ? t : 0;
}

export function sortCommunityPostsByFeedDate<T extends ListingPost>(posts: T[]): T[] {
  return [...posts].sort((a, b) => communityPostFeedDate(b) - communityPostFeedDate(a));
}
