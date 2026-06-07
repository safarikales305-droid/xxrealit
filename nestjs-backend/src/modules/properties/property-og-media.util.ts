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

/**
 * Priorita OG obrázku:
 * thumbnailUrl → mainImage → první fotka → generatedVideoThumbnail → poster z videa
 */
export function resolvePropertyOgImageUrl(
  input: PropertyOgMediaInput,
  siteFallbackUrl: string,
): string {
  const candidates = [
    input.thumbnailUrl,
    input.mainImage,
    input.images?.[0],
    input.generatedVideoThumbnail,
    cloudinaryVideoPosterUrl(input.videoUrl),
  ];
  for (const raw of candidates) {
    const transformed = cloudinaryOgImageUrl(raw) ?? raw?.trim();
    if (transformed) return transformed;
  }
  return siteFallbackUrl;
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
  if (!generatedVideoThumbnail && !mainImage && input.videoUrl?.trim()) {
    generatedVideoThumbnail = cloudinaryVideoPosterUrl(input.videoUrl);
  }
  const thumbnailSource = mainImage ?? generatedVideoThumbnail;
  const thumbnailUrl = thumbnailSource ? cloudinaryOgImageUrl(thumbnailSource) : null;
  return {
    mainImage,
    thumbnailUrl,
    generatedVideoThumbnail,
  };
}
