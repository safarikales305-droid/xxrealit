import { upgradeHttpToHttpsForApi } from '../../lib/secure-url';

export type PropertyOgMediaInput = {
  thumbnailUrl?: string | null;
  mainImage?: string | null;
  images?: string[];
  generatedVideoThumbnail?: string | null;
  videoUrl?: string | null;
};

export type OgImageSource =
  | 'thumbnailUrl'
  | 'generatedVideoThumbnail'
  | 'mainImage'
  | 'firstGalleryImage'
  | 'videoPoster'
  | 'logo';

export type ResolvedOgImage = {
  url: string;
  source: OgImageSource;
  usedFallbackLogo: boolean;
};

/** Ověří veřejnou HTTPS URL vhodnou pro og:image. */
export function isValidPublicOgImageUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;
  const u = url.trim();
  if (u.startsWith('blob:') || u.startsWith('data:')) return false;
  if (/localhost|127\.0\.0\.1/i.test(u)) return false;
  if (!/^https:\/\//i.test(u)) return false;
  return true;
}

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
  let candidate: string | null;
  if (/\/video\/upload\//i.test(u)) {
    candidate = cloudinaryVideoPosterUrl(u) ?? u;
  } else {
    candidate = cloudinaryOgImageUrl(u) ?? u;
  }
  return isValidPublicOgImageUrl(candidate) ? candidate : null;
}

/**
 * Priorita OG obrázku:
 * thumbnailUrl → generatedVideoThumbnail → mainImage → první fotka → video poster → logo
 */
export function resolvePropertyOgImageWithSource(
  input: PropertyOgMediaInput,
  siteFallbackUrl: string,
): ResolvedOgImage {
  const steps: Array<{ raw: string | null | undefined; source: OgImageSource }> = [
    { raw: input.thumbnailUrl, source: 'thumbnailUrl' },
    { raw: input.generatedVideoThumbnail, source: 'generatedVideoThumbnail' },
    { raw: input.mainImage, source: 'mainImage' },
    { raw: input.images?.[0], source: 'firstGalleryImage' },
    { raw: cloudinaryVideoPosterUrl(input.videoUrl), source: 'videoPoster' },
  ];

  for (const step of steps) {
    const normalized = normalizeOgImageCandidate(step.raw);
    if (normalized) {
      return { url: normalized, source: step.source, usedFallbackLogo: false };
    }
  }

  const fallback = isValidPublicOgImageUrl(siteFallbackUrl)
    ? siteFallbackUrl
    : siteFallbackUrl.startsWith('http')
      ? siteFallbackUrl
      : siteFallbackUrl;

  return { url: fallback, source: 'logo', usedFallbackLogo: true };
}

export function resolvePropertyOgImageUrl(
  input: PropertyOgMediaInput,
  siteFallbackUrl: string,
): string {
  return resolvePropertyOgImageWithSource(input, siteFallbackUrl).url;
}

export function buildOgTitle(
  title: string,
  price: number | null | undefined,
  currency = 'CZK',
): string {
  const t = title.trim() || 'Inzerát';
  if (price == null || !Number.isFinite(price) || price <= 0) {
    return `${t} | Cena na dotaz`;
  }
  return `${t} | ${Math.round(price).toLocaleString('cs-CZ')} ${(currency || 'CZK').trim()}`;
}

export function buildOgDescription(city: string, description: string): string {
  const loc = city.trim() || 'Lokalita neuvedena';
  const desc = description.trim().replace(/\s+/g, ' ');
  const combined = desc ? `${loc} ${desc}` : loc;
  return combined.slice(0, 160);
}

export function getSiteOriginForOg(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    'https://www.xxrealit.cz'
  ).replace(/\/+$/, '');
}

export function getPortalLogoFallbackUrl(): string {
  return `${getSiteOriginForOg()}/icons/icon-192.png`;
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
