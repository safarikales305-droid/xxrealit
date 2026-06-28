import { resolveAssetBaseUrl } from '../../lib/image-url';
import { upgradeHttpToHttpsForApi } from '../../lib/secure-url';

export type PropertyOgMediaInput = {
  facebookShareImageUrl?: string | null;
  /** Nastaveno až po úspěšném vygenerování statického JPG — bez něj použij fallback fotku. */
  facebookShareImageAt?: Date | string | null;
  thumbnailUrl?: string | null;
  mainImage?: string | null;
  images?: string[];
  generatedVideoThumbnail?: string | null;
  videoUrl?: string | null;
};

export type OgImageSource =
  | 'facebookShareImage'
  | 'thumbnailUrl'
  | 'mainImage'
  | 'firstGalleryImage'
  | 'videoThumbnail'
  | 'logo';

export type ResolvedOgImage = {
  url: string;
  source: OgImageSource;
  usedFallbackLogo: boolean;
  isLogoFallback: boolean;
};

const BRANDING_MARKERS = [
  'logo',
  'favicon',
  'icon-',
  '/icons/',
  'x-logo',
  'portal',
  '/logo',
  '/favicon',
] as const;

/** URL nesmí být logo/favicon portálu. */
export function isPortalBrandingUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;
  const u = url.trim().toLowerCase();
  return BRANDING_MARKERS.some((m) => u.includes(m));
}

/** Ověří veřejnou HTTPS URL vhodnou pro og:image. */
export function isValidPublicOgImageUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;
  const u = url.trim();
  if (u.startsWith('blob:') || u.startsWith('data:')) return false;
  if (/localhost|127\.0\.0\.1/i.test(u)) return false;
  if (!/^https:\/\//i.test(u)) return false;
  if (isPortalBrandingUrl(u)) return false;
  return true;
}

export function getSiteOriginForOg(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    'https://xxrealit.cz'
  ).replace(/\/+$/, '');
}

export function getPortalLogoFallbackUrl(): string {
  return `${getSiteOriginForOg()}/icons/icon-192.png`;
}

function toAbsoluteHttps(raw: string): string | null {
  const upgraded = upgradeHttpToHttpsForApi(raw.trim()) ?? raw.trim();
  if (isValidPublicOgImageUrl(upgraded)) return upgraded;
  if (upgraded.startsWith('/')) {
    const bases = [resolveAssetBaseUrl(), getSiteOriginForOg()].filter(Boolean) as string[];
    for (const base of bases) {
      const abs = `${base.replace(/\/+$/, '')}${upgraded}`;
      if (isValidPublicOgImageUrl(abs)) return abs;
    }
  }
  return null;
}

/** První platná fotka z galerie. */
export function pickPropertyMainImage(images: string[]): string | null {
  for (const raw of images) {
    const u = typeof raw === 'string' ? raw.trim() : '';
    if (u && !isPortalBrandingUrl(u)) return u;
  }
  return null;
}

export function propertyHasListingMedia(input: PropertyOgMediaInput): boolean {
  return Boolean(
    input.thumbnailUrl?.trim() ||
      input.mainImage?.trim() ||
      input.images?.some((i) => i?.trim() && !isPortalBrandingUrl(i)) ||
      input.generatedVideoThumbnail?.trim() ||
      input.videoUrl?.trim(),
  );
}

/** Cloudinary poster z videa — snímek z 2. sekundy. */
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
  const transform = 'w_1200,h_630,c_fill,so_2,f_jpg,q_auto';
  if (rest.startsWith(`${transform}/`)) return u;
  const withoutExt = rest.replace(/\.[a-z0-9]+$/i, '');
  return `${prefix}${transform}/${withoutExt}.jpg`;
}

/** Cloudinary transformace obrázku na 1200×630 JPG pro OG. */
export function cloudinaryOgImageUrl(imageUrl: string | null | undefined): string | null {
  const abs = toAbsoluteHttps(imageUrl?.trim() ?? '');
  if (!abs) return null;
  if (!/res\.cloudinary\.com/i.test(abs) || !/\/image\/upload\//i.test(abs)) {
    return abs;
  }
  const marker = '/image/upload/';
  const idx = abs.indexOf(marker);
  if (idx < 0) return abs;
  const prefix = abs.slice(0, idx + marker.length);
  const rest = abs.slice(idx + marker.length);
  const transform = 'w_1200,h_630,c_fill,f_jpg,q_auto';
  if (rest.startsWith(`${transform}/`)) return abs;
  return `${prefix}${transform}/${rest}`;
}

/** Normalizuje kandidáta na OG obrázek (absolutní HTTPS JPG). */
export function normalizeOgImageCandidate(raw: string | null | undefined): string | null {
  if (!raw?.trim() || isPortalBrandingUrl(raw)) return null;
  if (/\/video\/upload\//i.test(raw)) {
    const poster = cloudinaryVideoPosterUrl(raw);
    return poster && isValidPublicOgImageUrl(poster) ? poster : null;
  }
  const img = cloudinaryOgImageUrl(raw);
  return img && isValidPublicOgImageUrl(img) ? img : null;
}

export function pickVideoThumbnail(input: PropertyOgMediaInput): string | null {
  return (
    normalizeOgImageCandidate(input.generatedVideoThumbnail) ??
    normalizeOgImageCandidate(cloudinaryVideoPosterUrl(input.videoUrl))
  );
}

export function appendOgImageCacheVersion(
  url: string,
  versionMs: number | string | Date | null | undefined,
): string {
  if (!url.trim()) return url;
  const v =
    versionMs instanceof Date
      ? versionMs.getTime()
      : versionMs != null && String(versionMs).trim()
        ? String(versionMs).trim()
        : Date.now();
  try {
    const u = new URL(url.trim());
    u.searchParams.set('v', String(v));
    return u.href;
  } catch {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}v=${v}`;
  }
}

export function isFacebookShareImageReady(
  url: string | null | undefined,
  generatedAt?: Date | string | null,
): boolean {
  if (!isValidPublicOgImageUrl(url)) return false;
  if (!generatedAt) return false;
  if (generatedAt instanceof Date) return !Number.isNaN(generatedAt.getTime());
  return Boolean(String(generatedAt).trim());
}

export function canUseFacebookShareOgImage(input: PropertyOgMediaInput): boolean {
  return isFacebookShareImageReady(
    input.facebookShareImageUrl,
    input.facebookShareImageAt,
  );
}

export const OG_IMAGE_PRIORITY_STEPS: Array<{
  pick: (input: PropertyOgMediaInput) => string | null | undefined;
  source: OgImageSource;
}> = [
  { pick: (i) => i.facebookShareImageUrl, source: 'facebookShareImage' },
  { pick: (i) => i.thumbnailUrl, source: 'thumbnailUrl' },
  { pick: (i) => i.mainImage, source: 'mainImage' },
  { pick: (i) => i.images?.[0], source: 'firstGalleryImage' },
  {
    pick: (i) => i.generatedVideoThumbnail ?? cloudinaryVideoPosterUrl(i.videoUrl),
    source: 'videoThumbnail',
  },
];

/**
 * Priorita: facebookShareImageUrl → thumbnailUrl → mainImage → galerie → videoThumbnail → logo.
 */
export function resolvePropertyOgImageWithSource(
  input: PropertyOgMediaInput,
  siteFallbackUrl = getPortalLogoFallbackUrl(),
): ResolvedOgImage {
  const fb = input.facebookShareImageUrl?.trim();
  if (fb && canUseFacebookShareOgImage(input)) {
    return {
      url: fb,
      source: 'facebookShareImage',
      usedFallbackLogo: false,
      isLogoFallback: false,
    };
  }

  for (const step of OG_IMAGE_PRIORITY_STEPS) {
    if (step.source === 'facebookShareImage') continue;
    const normalized = normalizeOgImageCandidate(step.pick(input));
    if (normalized) {
      return {
        url: normalized,
        source: step.source,
        usedFallbackLogo: false,
        isLogoFallback: false,
      };
    }
  }

  if (propertyHasListingMedia(input)) {
    for (const step of OG_IMAGE_PRIORITY_STEPS) {
      const raw = step.pick(input)?.trim();
      if (!raw || isPortalBrandingUrl(raw)) continue;
      const abs = toAbsoluteHttps(raw);
      if (abs) {
        return {
          url: abs,
          source: step.source,
          usedFallbackLogo: false,
          isLogoFallback: false,
        };
      }
    }
  }

  const fallback = siteFallbackUrl;
  const isLogo = true;
  return {
    url: fallback,
    source: 'logo',
    usedFallbackLogo: isLogo,
    isLogoFallback: isLogo,
  };
}

export function resolvePropertyOgImageUrl(
  input: PropertyOgMediaInput,
  siteFallbackUrl?: string,
): string {
  return resolvePropertyOgImageWithSource(input, siteFallbackUrl).url;
}

/** Odvodí a uloží thumbnailUrl z mainImage / galerie, pokud chybí. */
export function deriveThumbnailUrlFromListing(input: {
  mainImage?: string | null;
  images?: string[];
  generatedVideoThumbnail?: string | null;
  videoUrl?: string | null;
}): string | null {
  return (
    normalizeOgImageCandidate(input.mainImage) ??
    normalizeOgImageCandidate(input.images?.[0]) ??
    normalizeOgImageCandidate(input.generatedVideoThumbnail) ??
    normalizeOgImageCandidate(cloudinaryVideoPosterUrl(input.videoUrl))
  );
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
    normalizeOgImageCandidate(mainImage) ??
    normalizeOgImageCandidate(input.images[0]) ??
    normalizeOgImageCandidate(generatedVideoThumbnail) ??
    null;
  return {
    mainImage,
    thumbnailUrl,
    generatedVideoThumbnail,
  };
}
