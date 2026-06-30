import { generatePropertySlug } from './property-seo.util';

/** Krátký suffix z ID pro unikátnost slugu (např. …-abc12). */
export function slugIdSuffix(id: string): string {
  const digits = id.replace(/\D/g, '');
  if (digits.length >= 5) return digits.slice(-5);
  return id.slice(-6).toLowerCase();
}

export function generatePostSlug(title: string, id: string): string {
  const base = generatePropertySlug(title || 'prispevek');
  const suffix = slugIdSuffix(id);
  const slug = `${base}-${suffix}`.replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 150);
  return slug || `prispevek-${suffix}`;
}

export function buildPostSeoTitle(input: {
  title?: string | null;
  description?: string | null;
  hasVideo?: boolean;
}): string {
  const headline =
    input.title?.trim() ||
    (input.description ?? '').replace(/\s+/g, ' ').trim().slice(0, 80) ||
    (input.hasVideo ? 'Video příspěvek' : 'Příspěvek');
  return `${headline} | XXREALIT`;
}

export function buildPostSeoDescription(input: {
  title?: string | null;
  description?: string | null;
  content?: string | null;
  authorName?: string | null;
  hasVideo?: boolean;
}): string {
  const text = (input.content ?? input.description ?? input.title ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
  const author = input.authorName?.trim() ? ` Autor: ${input.authorName.trim()}.` : '';
  const kind = input.hasVideo ? 'Video příspěvek' : 'Příspěvek';
  return `${kind} na XXREALIT.${author} ${text}`.trim().slice(0, 300);
}

export async function ensureUniquePostSlug(
  prisma: { post: { findFirst: (args: unknown) => Promise<{ id: string } | null> } },
  baseSlug: string,
  excludeId?: string,
): Promise<string> {
  let slug = baseSlug || 'prispevek';
  let n = 0;
  while (true) {
    const candidate = n === 0 ? slug : `${slug}-${n}`;
    const existing = await prisma.post.findFirst({
      where: {
        slug: candidate,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (!existing) return candidate;
    n += 1;
  }
}

export function postHasVideo(post: {
  videoUrl?: string | null;
  media?: Array<{ type?: string | null }>;
}): boolean {
  if (post.videoUrl?.trim()) return true;
  return (post.media ?? []).some((m) => String(m.type ?? '').toLowerCase() === 'video');
}

export function postSeoPath(slug: string, hasVideo: boolean): string {
  return hasVideo ? `/video/${slug}` : `/prispevek/${slug}`;
}

export function listingSeoPath(slug: string, contentType: 'classic' | 'shorts'): string {
  return contentType === 'shorts' ? `/shorts/${slug}` : `/inzerat/${slug}`;
}

export function buildPostPublicUrl(
  origin: string,
  post: { id: string; slug?: string | null; videoUrl?: string | null; media?: Array<{ type?: string | null }> },
): string {
  const base = origin.replace(/\/+$/, '');
  if (post.slug) {
    return `${base}${postSeoPath(post.slug, postHasVideo(post))}`;
  }
  return `${base}/prispevky/${encodeURIComponent(post.id)}`;
}

export function buildListingPublicSeoUrl(
  origin: string,
  property: { id: string; slug?: string | null; listingType?: string | null; videoUrl?: string | null },
  contentType?: 'classic' | 'shorts',
): string {
  const base = origin.replace(/\/+$/, '');
  const isShorts =
    contentType === 'shorts' ||
    String(property.listingType ?? '').toUpperCase() === 'SHORTS' ||
    Boolean(property.videoUrl?.trim());
  const type = isShorts ? 'shorts' : 'classic';
  if (property.slug) {
    return `${base}${listingSeoPath(property.slug, type)}`;
  }
  return isShorts
    ? `${base}/shorts/${encodeURIComponent(property.id)}`
    : `${base}/nemovitost/${encodeURIComponent(property.id)}`;
}
