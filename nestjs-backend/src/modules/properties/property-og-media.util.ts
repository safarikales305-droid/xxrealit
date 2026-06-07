import { upgradeHttpToHttpsForApi } from '../../lib/secure-url';

export type PropertyOgMediaInput = {
  thumbnailUrl?: string | null;
  mainImage?: string | null;
  images?: string[];
  generatedVideoThumbnail?: string | null;
  videoUrl?: string | null;
};

/** První platná fotka z galerie. */
export function pickPropertyMainImage(images: string[]): string | null {
  for (const raw of images) {
    const u = typeof raw === 'string' ? raw.trim() : '';
    if (u) return u;
  }
  return null;
}

/** Cloudinary poster z videa (bez re-uploadu). */
export function cloudinaryVideoPosterUrl(videoUrl: string | null | undefined): string | null {
  const u = upgradeHttpToHttpsForApi(videoUrl?.trim() ?? '') ?? '';
  if (!u || !/res\.cloudinary\.com/i.test(u) || !/\/video\/upload\//i.test(u)) {
    return null;
  }
  const marker = '/video/upload/';
  const idx = u.indexOf(marker);
  if (idx < 0) return null;
  const prefix = u.slice(0, idx + marker.length);
  const rest = u.slice(idx + marker.length);
  const transform = 'w_1200,h_630,c_fill,so_1,f_jpg,q_auto';
  if (rest.startsWith(transform + '/')) return u;
  const withoutExt = rest.replace(/\.[a-z0-9]+$/i, '');
  return `${prefix}${transform}/${withoutExt}.jpg`;
}

/** Cloudinary transformace obrázku na 1200×630 pro OG. */
export function cloudinaryOgImageUrl(imageUrl: string | null | undefined): string | null {
  const u = upgradeHttpToHttpsForApi(imageUrl?.trim() ?? '') ?? '';
  if (!u) return null;
  if (!/res\.cloudinary\.com/i.test(u) || !/\/image\/upload\//i.test(u)) {
    return u;
  }
  const marker = '/image/upload/';
  const idx = u.indexOf(marker);
  if (idx < 0) return u;
  const prefix = u.slice(0, idx + marker.length);
  const rest = u.slice(idx + marker.length);
  const transform = 'w_1200,h_630,c_fill,f_jpg,q_auto';
  if (rest.startsWith(transform + '/')) return u;
  return `${prefix}${transform}/${rest}`;
}

/** Normalizuje kandidáta na OG obrázek (Cloudinary image/video poster → JPG 1200×630). */
export function normalizeOgImageCandidate(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const u = upgradeHttpToHttpsForApi(raw.trim()) ?? raw.trim();
  if (/\/video\/upload\//i.test(u)) {
    return cloudinaryVideoPosterUrl(u) ?? u;
  }
  return cloudinaryOgImageUrl(u) ?? u;
}

/**
 * Priorita OG obrázku:
 * thumbnailUrl → generatedVideoThumbnail → mainImage → první fotka → logo
 */
export function resolvePropertyOgImageUrl(
  input: PropertyOgMediaInput,
  siteFallbackUrl: string,
): string {
  const candidates = [
    input.thumbnailUrl,
    input.generatedVideoThumbnail,
    input.mainImage,
    input.images?.[0],
    cloudinaryVideoPosterUrl(input.videoUrl),
  ];
  for (const raw of candidates) {
    const normalized = normalizeOgImageCandidate(raw);
    if (normalized) return normalized;
  }
  return siteFallbackUrl;
}

export function buildOgTitle(
  title: string,
  price: number | null | undefined,
  currency = 'CZK',
): string {
  const t = title.trim() || 'Inzerát';
  if (price == null || !Number.isFinite(price) || price <= 0) {
    return `${t} · Cena na dotaz`;
  }
  return `${t} · ${Math.round(price).toLocaleString('cs-CZ')} ${(currency || 'CZK').trim()}`;
}

export function buildOgDescription(city: string, description: string): string {
  const loc = city.trim() || 'Lokalita neuvedena';
  const desc = description.trim().replace(/\s+/g, ' ').slice(0, 160);
  return desc ? `${loc} — ${desc}` : loc;
}

export function computeStoredOgMediaFields(input: {
  images: string[];
  videoUrl?: string | null;
  generatedVideoThumbnail?: string | null;
}): {
  mainImage: string | null;
  thumbnailUrl: string | null;
  generatedVideoThumbnail: string | null;
} {
  const mainImage = pickPropertyMainImage(input.images);
  let generatedVideoThumbnail = input.generatedVideoThumbnail?.trim() || null;
  if (!generatedVideoThumbnail && input.videoUrl?.trim()) {
    generatedVideoThumbnail = cloudinaryVideoPosterUrl(input.videoUrl);
  }
  const thumbnailUrl =
    normalizeOgImageCandidate(generatedVideoThumbnail) ??
    normalizeOgImageCandidate(mainImage) ??
    normalizeOgImageCandidate(input.images[0]) ??
    null;
  return {
    mainImage,
    thumbnailUrl,
    generatedVideoThumbnail,
  };
}
