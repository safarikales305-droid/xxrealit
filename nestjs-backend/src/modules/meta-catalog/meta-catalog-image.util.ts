import {
  canUseFacebookShareOgImage,
  cloudinaryOgImageUrl,
  isPortalBrandingUrl,
  isValidPublicOgImageUrl,
  normalizeOgImageCandidate,
  type PropertyOgMediaInput,
} from '../properties/property-og-media.util';
import { resolvePublicHttpsImageUrl } from '../whatsapp/whatsapp-image-url.util';

const ALLOWED_IMAGE_CT = new Set(['image/jpeg', 'image/png']);
const META_MIN_EDGE = 500;

export type CatalogPropertyImagesInput = PropertyOgMediaInput & {
  id?: string;
  images?: string[];
};

/** Cloudinary → JPG 1200×1200 min pro Meta katalog (čtverec, min. 500 px). */
export function cloudinaryCatalogImageUrl(imageUrl: string | null | undefined): string | null {
  const abs = normalizeOgImageCandidate(imageUrl) ?? null;
  if (!abs) {
    const raw = imageUrl?.trim();
    if (!raw || isPortalBrandingUrl(raw)) return null;
    try {
      const resolved = resolvePublicHttpsImageUrl(raw.startsWith('/') ? raw : raw);
      if (!isValidPublicOgImageUrl(resolved)) return null;
      if (!/res\.cloudinary\.com/i.test(resolved)) return resolved;
      return transformCloudinaryCatalog(resolved);
    } catch {
      return null;
    }
  }
  if (!/res\.cloudinary\.com/i.test(abs)) return abs;
  return transformCloudinaryCatalog(abs);
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

export function normalizeCatalogImageUrl(raw: string | null | undefined): string | null {
  if (!raw?.trim() || isPortalBrandingUrl(raw)) return null;
  const cloudinary = cloudinaryCatalogImageUrl(raw);
  if (cloudinary) return cloudinary;
  const normalized = normalizeOgImageCandidate(raw);
  if (normalized) return normalized;
  try {
    const abs = resolvePublicHttpsImageUrl(raw.trim().startsWith('/') ? raw.trim() : raw.trim());
    return isValidPublicOgImageUrl(abs) ? abs : null;
  } catch {
    return null;
  }
}

export function resolveCatalogMainImage(p: CatalogPropertyImagesInput): string | null {
  if (p.facebookShareImageUrl?.trim() && canUseFacebookShareOgImage(p)) {
    const fb = normalizeCatalogImageUrl(p.facebookShareImageUrl);
    if (fb) return fb;
  }

  const candidates = [
    p.mainImage,
    p.thumbnailUrl,
    p.images?.[0],
    p.generatedVideoThumbnail,
  ];

  for (const c of candidates) {
    const url = normalizeCatalogImageUrl(c);
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
  const all = [...(p.images ?? []), p.mainImage, p.thumbnailUrl].filter(Boolean) as string[];

  for (const raw of all) {
    const url = normalizeCatalogImageUrl(raw);
    if (!url || url === mainImage || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
    if (out.length >= 20) break;
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
