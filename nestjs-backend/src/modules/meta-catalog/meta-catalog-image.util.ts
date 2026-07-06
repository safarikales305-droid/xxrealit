import {
  canUseFacebookShareOgImage,
  getSiteOriginForOg,
  isPortalBrandingUrl,
  isValidPublicOgImageUrl,
  normalizeOgImageCandidate,
  type PropertyOgMediaInput,
} from '../properties/property-og-media.util';

const ALLOWED_IMAGE_CT = new Set(['image/jpeg', 'image/png', 'image/webp']);
const META_MIN_EDGE = 500;
const META_MAX_GALLERY = 20;

const BLOCKED_HOST_RE =
  /^(localhost|127\.0\.0\.1|0\.0\.0\.0|.*\.railway\.internal)$/i;

export type CatalogPropertyImagesInput = PropertyOgMediaInput & {
  id?: string;
  images?: unknown;
  mainImage?: unknown;
  thumbnailUrl?: unknown;
  facebookShareImageUrl?: unknown;
  generatedVideoThumbnail?: unknown;
};

/** Parsuje pole obrázků z DB (pole, JSON řetězec nebo jedna URL). */
export function coerceImageList(raw: unknown): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw.map((v) => String(v ?? '').trim()).filter(Boolean);
  }
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) return [];
    if (t.startsWith('[')) {
      try {
        const parsed = JSON.parse(t) as unknown;
        if (Array.isArray(parsed)) {
          return parsed.map((v) => String(v ?? '').trim()).filter(Boolean);
        }
      } catch {
        return [t];
      }
    }
    return [t];
  }
  return [];
}

function catalogPublicOrigin(): string {
  return (
    process.env.PUBLIC_MEDIA_URL?.trim() ||
    process.env.FRONTEND_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    getSiteOriginForOg()
  ).replace(/\/+$/, '');
}

function isBlockedImageUrl(url: string): boolean {
  const u = url.trim().toLowerCase();
  if (!u) return true;
  if (u.startsWith('blob:') || u.startsWith('data:')) return true;
  if (/localhost|127\.0\.0\.1/i.test(u)) return true;
  try {
    const host = new URL(u).hostname;
    if (BLOCKED_HOST_RE.test(host)) return true;
  } catch {
    return true;
  }
  return false;
}

/** Railway / interní host → veřejná doména portálu pro /uploads/… */
function rewriteUploadsToPublicPortal(abs: string): string {
  try {
    const parsed = new URL(abs);
    if (!parsed.pathname.startsWith('/uploads/')) return abs;
    const host = parsed.hostname.toLowerCase();
    const portal = catalogPublicOrigin();
    if (
      host.endsWith('.railway.app') ||
      host === 'localhost' ||
      host === '127.0.0.1' ||
      (portal && !host.includes('xxrealit.cz') && !host.includes('cloudinary.com'))
    ) {
      return `${portal}${parsed.pathname}${parsed.search}`;
    }
    return abs;
  } catch {
    return abs;
  }
}

function transformCloudinaryCatalog(abs: string): string {
  const marker = '/image/upload/';
  const idx = abs.indexOf(marker);
  if (idx < 0) return abs;
  const prefix = abs.slice(0, idx + marker.length);
  const rest = abs.slice(idx + marker.length);
  const transform = 'w_1200,h_1200,c_fill,f_jpg,q_auto';
  if (rest.startsWith(`${transform}/`)) return abs;
  const stripped = rest.replace(/^[^/]+\//, '');
  return `${prefix}${transform}/${stripped}`;
}

function cloudinaryCatalogImageUrl(imageUrl: string | null | undefined): string | null {
  const abs = normalizeOgImageCandidate(imageUrl) ?? null;
  if (!abs) {
    const raw = String(imageUrl ?? '').trim();
    if (!raw || isPortalBrandingUrl(raw)) return null;
    const normalized = normalizePublicImageUrl(raw);
    if (!normalized) return null;
    if (!/res\.cloudinary\.com/i.test(normalized)) return normalized;
    return transformCloudinaryCatalog(normalized);
  }
  if (!/res\.cloudinary\.com/i.test(abs)) return abs;
  return transformCloudinaryCatalog(abs);
}

/**
 * Normalizuje URL obrázku pro Meta katalog — veřejná HTTPS adresa bez auth.
 * Preferuje Cloudinary; lokální /uploads/ mapuje na www.xxrealit.cz.
 */
export function normalizePublicImageUrl(raw: string | null | undefined): string | null {
  if (!raw?.trim() || isPortalBrandingUrl(raw)) return null;
  const trimmed = String(raw).trim();

  if (isBlockedImageUrl(trimmed)) return null;

  if (/^https:\/\//i.test(trimmed)) {
    if (!isValidPublicOgImageUrl(trimmed)) return null;
    if (/res\.cloudinary\.com/i.test(trimmed)) {
      return cloudinaryCatalogImageUrl(trimmed);
    }
    return rewriteUploadsToPublicPortal(trimmed);
  }

  if (/^http:\/\//i.test(trimmed)) {
    const https = trimmed.replace(/^http:/i, 'https:');
    return normalizePublicImageUrl(https);
  }

  if (trimmed.startsWith('/')) {
    const abs = `${catalogPublicOrigin()}${trimmed}`;
    if (!isValidPublicOgImageUrl(abs)) return null;
    if (/res\.cloudinary\.com/i.test(abs)) return cloudinaryCatalogImageUrl(abs);
    return rewriteUploadsToPublicPortal(abs);
  }

  const og = normalizeOgImageCandidate(trimmed);
  if (og) {
    if (/res\.cloudinary\.com/i.test(og)) return cloudinaryCatalogImageUrl(og);
    return rewriteUploadsToPublicPortal(og);
  }

  const abs = `${catalogPublicOrigin()}/${trimmed.replace(/^\/+/, '')}`;
  if (!isValidPublicOgImageUrl(abs)) return null;
  return rewriteUploadsToPublicPortal(abs);
}

/** @deprecated alias */
export const normalizeCatalogImageUrl = normalizePublicImageUrl;

export function resolveCatalogMainImage(p: CatalogPropertyImagesInput): string | null {
  const images = coerceImageList(p.images);
  const mainImage = coerceImageList(p.mainImage)[0] ?? null;
  const thumbnail = coerceImageList(p.thumbnailUrl)[0] ?? null;
  const fbShare = coerceImageList(p.facebookShareImageUrl)[0] ?? null;
  const videoThumb = coerceImageList(p.generatedVideoThumbnail)[0] ?? null;

  const input = { ...p, images, mainImage, thumbnailUrl: thumbnail, facebookShareImageUrl: fbShare };

  if (fbShare && canUseFacebookShareOgImage(input)) {
    const fb = normalizePublicImageUrl(fbShare);
    if (fb) return fb;
  }

  const candidates = [mainImage, thumbnail, images[0], videoThumb];
  for (const c of candidates) {
    const url = normalizePublicImageUrl(c);
    if (url) return url;
  }

  for (const raw of images) {
    const url = normalizePublicImageUrl(raw);
    if (url) return url;
  }

  return null;
}

export function resolveCatalogGalleryImages(
  p: CatalogPropertyImagesInput,
  mainImage: string | null,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const all = [
    ...coerceImageList(p.images),
    ...coerceImageList(p.mainImage),
    ...coerceImageList(p.thumbnailUrl),
  ];

  for (const raw of all) {
    const url = normalizePublicImageUrl(raw);
    if (!url || url === mainImage || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
    if (out.length >= META_MAX_GALLERY) break;
  }
  return out;
}

export function isAllowedCatalogContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  const ct = contentType.split(';')[0].trim().toLowerCase();
  return ALLOWED_IMAGE_CT.has(ct);
}

export function catalogImageMeetsMetaSize(width: number | null, height: number | null): boolean {
  if (width == null || height == null) return true;
  return width >= META_MIN_EDGE && height >= META_MIN_EDGE;
}
