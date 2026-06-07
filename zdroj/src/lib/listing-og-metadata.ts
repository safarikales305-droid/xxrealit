import type { Metadata } from 'next';
import { getAppOrigin } from '@/lib/app-url';
import { listingShareUrl } from '@/lib/public-share-url';
import { upgradeHttpToHttps } from '@/lib/public-urls';

export type ListingOgInput = {
  id: string;
  title: string;
  description?: string | null;
  city?: string | null;
  price?: number | null;
  currency?: string | null;
  listingType?: string | null;
  videoUrl?: string | null;
  thumbnailUrl?: string | null;
  facebookShareImageUrl?: string | null;
  facebookShareImageAt?: string | null;
  mainImage?: string | null;
  updatedAt?: string | null;
  generatedVideoThumbnail?: string | null;
  images?: string[];
  resolvedOgImage?: string | null;
  ogImageSource?: OgImageSource | null;
  ogTitle?: string | null;
  ogDescription?: string | null;
  shareUrl?: string | null;
};

export type OgImageSource =
  | 'facebookShareImage'
  | 'thumbnailUrl'
  | 'mainImage'
  | 'firstGalleryImage'
  | 'videoThumbnail'
  | 'logo';

const OG_IMAGE_TRANSFORM = 'w_1200,h_630,c_fill,f_jpg,q_auto';

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

export function isPortalBrandingUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;
  const u = url.trim().toLowerCase();
  return BRANDING_MARKERS.some((m) => u.includes(m));
}

export function getPortalLogoFallbackUrl(): string {
  return `${getAppOrigin()}/icons/icon-192.png`;
}

export function isValidPublicOgImageUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;
  const u = url.trim();
  if (u.startsWith('blob:') || u.startsWith('data:')) return false;
  if (/localhost|127\.0\.0\.1/i.test(u)) return false;
  if (!/^https:\/\//i.test(u)) return false;
  if (isPortalBrandingUrl(u)) return false;
  return true;
}

/** Převede relativní cestu na absolutní HTTPS — nikdy nevrací logo jako fallback. */
export function toAbsoluteListingImageUrl(url: string): string | null {
  const t = upgradeHttpToHttps(url.trim());
  if (!t || isPortalBrandingUrl(t)) return null;
  if (isValidPublicOgImageUrl(t)) return t;
  if (t.startsWith('//')) {
    const abs = `https:${t}`;
    return isValidPublicOgImageUrl(abs) ? abs : null;
  }
  if (t.startsWith('/')) {
    const abs = `${getAppOrigin()}${t}`;
    return isValidPublicOgImageUrl(abs) ? abs : null;
  }
  const abs = `${getAppOrigin()}/${t}`;
  return isValidPublicOgImageUrl(abs) ? abs : null;
}

function cloudinaryOgImageUrl(imageUrl: string): string | null {
  const u = upgradeHttpToHttps(imageUrl.trim());
  if (isPortalBrandingUrl(u)) return null;
  if (!/res\.cloudinary\.com/i.test(u) || !/\/image\/upload\//i.test(u)) {
    return toAbsoluteListingImageUrl(u);
  }
  const marker = '/image/upload/';
  const idx = u.indexOf(marker);
  if (idx < 0) return toAbsoluteListingImageUrl(u);
  const prefix = u.slice(0, idx + marker.length);
  const rest = u.slice(idx + marker.length);
  if (rest.startsWith(`${OG_IMAGE_TRANSFORM}/`)) return u;
  const out = `${prefix}${OG_IMAGE_TRANSFORM}/${rest}`;
  return isValidPublicOgImageUrl(out) ? out : null;
}

function cloudinaryVideoPosterUrl(videoUrl: string): string | null {
  const u = upgradeHttpToHttps(videoUrl.trim());
  if (!/res\.cloudinary\.com/i.test(u) || !/\/video\/upload\//i.test(u)) return null;
  const marker = '/video/upload/';
  const idx = u.indexOf(marker);
  if (idx < 0) return null;
  const prefix = u.slice(0, idx + marker.length);
  const rest = u.slice(idx + marker.length);
  const transform = `${OG_IMAGE_TRANSFORM},so_2`;
  const withoutExt = rest.replace(/\.[a-z0-9]+$/i, '');
  const out = `${prefix}${transform}/${withoutExt}.jpg`;
  return isValidPublicOgImageUrl(out) ? out : null;
}

function normalizeOgImageCandidate(raw: string | null | undefined): string | null {
  if (!raw?.trim() || isPortalBrandingUrl(raw)) return null;
  if (/\/video\/upload\//i.test(raw)) {
    return cloudinaryVideoPosterUrl(raw);
  }
  return cloudinaryOgImageUrl(raw);
}

function pickVideoThumbnail(listing: ListingOgInput): string | null {
  return (
    normalizeOgImageCandidate(listing.generatedVideoThumbnail) ??
    (listing.videoUrl ? cloudinaryVideoPosterUrl(listing.videoUrl) : null)
  );
}

function listingHasMedia(listing: ListingOgInput): boolean {
  return Boolean(
    listing.thumbnailUrl?.trim() ||
      listing.mainImage?.trim() ||
      listing.images?.some((i) => i?.trim() && !isPortalBrandingUrl(i)) ||
      listing.generatedVideoThumbnail?.trim() ||
      listing.videoUrl?.trim(),
  );
}

export type ResolvedOgImage = {
  url: string;
  source: OgImageSource;
  usedFallbackLogo: boolean;
  isLogoFallback: boolean;
};

function appendOgImageVersion(url: string, version?: string | null): string {
  if (!url.trim()) return url;
  const v = version?.trim() || String(Date.now());
  try {
    const u = new URL(url.trim());
    u.searchParams.set('v', v);
    return u.href;
  } catch {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}v=${v}`;
  }
}

/** Priorita: facebookShareImageUrl → thumbnailUrl → mainImage → galerie → videoThumbnail → logo. */
export function resolveListingOgImage(listing: ListingOgInput): ResolvedOgImage {
  if (
    listing.resolvedOgImage &&
    isValidPublicOgImageUrl(listing.resolvedOgImage) &&
    !isPortalBrandingUrl(listing.resolvedOgImage)
  ) {
    return {
      url: listing.resolvedOgImage,
      source: listing.ogImageSource ?? 'facebookShareImage',
      usedFallbackLogo: false,
      isLogoFallback: false,
    };
  }

  const fb = listing.facebookShareImageUrl?.trim();
  const fbReady =
    Boolean(fb && isValidPublicOgImageUrl(fb)) &&
    Boolean(listing.facebookShareImageAt?.trim());
  if (fbReady && fb) {
    return {
      url: fb,
      source: 'facebookShareImage',
      usedFallbackLogo: false,
      isLogoFallback: false,
    };
  }

  const steps: Array<{ raw: string | null | undefined; source: OgImageSource }> = [
    { raw: listing.thumbnailUrl, source: 'thumbnailUrl' },
    { raw: listing.mainImage, source: 'mainImage' },
    { raw: listing.images?.[0], source: 'firstGalleryImage' },
    { raw: pickVideoThumbnail(listing), source: 'videoThumbnail' },
  ];

  for (const step of steps) {
    const normalized = normalizeOgImageCandidate(step.raw);
    if (normalized) {
      return { url: normalized, source: step.source, usedFallbackLogo: false, isLogoFallback: false };
    }
  }

  if (listingHasMedia(listing)) {
    for (const step of steps) {
      const raw = step.raw?.trim();
      if (!raw || isPortalBrandingUrl(raw)) continue;
      const abs = toAbsoluteListingImageUrl(raw);
      if (abs) {
        return { url: abs, source: step.source, usedFallbackLogo: false, isLogoFallback: false };
      }
    }
  }

  if (!listingHasMedia(listing)) {
    return {
      url: getPortalLogoFallbackUrl(),
      source: 'logo',
      usedFallbackLogo: true,
      isLogoFallback: true,
    };
  }

  const gallery = normalizeOgImageCandidate(listing.images?.[0]);
  if (gallery) {
    return { url: gallery, source: 'firstGalleryImage', usedFallbackLogo: false, isLogoFallback: false };
  }

  return {
    url: getPortalLogoFallbackUrl(),
    source: 'logo',
    usedFallbackLogo: true,
    isLogoFallback: true,
  };
}

export function resolveListingOgImageUrl(listing: ListingOgInput): string {
  return resolveListingOgImage(listing).url;
}

export function formatListingPrice(price: number | null | undefined, currency = 'CZK'): string {
  if (price == null || !Number.isFinite(price) || price <= 0) {
    return 'Cena na dotaz';
  }
  const cur = (currency || 'CZK').trim();
  return `${Math.round(price).toLocaleString('cs-CZ')} ${cur}`;
}

export function buildListingOgTitle(listing: ListingOgInput): string {
  const title = (listing.title || 'Inzerát').trim();
  const priceLine = formatListingPrice(listing.price, listing.currency ?? 'CZK');
  return `${title} | ${priceLine}`;
}

export function buildListingOgDescription(listing: ListingOgInput): string {
  const city = (listing.city || '').trim() || 'Lokalita neuvedena';
  const desc = (listing.description || '').trim().replace(/\s+/g, ' ');
  const combined = desc ? `${city} ${desc}` : city;
  return combined.slice(0, 160);
}

export function buildListingSharePostText(opts: {
  title: string;
  description?: string | null;
  url: string;
}): string {
  const lines = [opts.title.trim(), (opts.description || '').trim(), opts.url.trim()];
  return lines.filter(Boolean).join('\n');
}

export function listingPublicDetailUrl(id: string): string {
  return `${getAppOrigin()}/nemovitost/${encodeURIComponent(id)}`;
}

export function facebookDebuggerUrl(pageUrl: string): string {
  return `https://developers.facebook.com/tools/debug/?q=${encodeURIComponent(pageUrl)}`;
}

export function buildListingOpenGraphMetadata(listing: ListingOgInput): Metadata {
  const isShorts =
    String(listing.listingType ?? '').toUpperCase() === 'SHORTS' ||
    Boolean(listing.videoUrl?.trim());
  const pageUrl =
    listing.shareUrl?.trim() ||
    listingShareUrl(listing.id, {
      listingType: listing.listingType,
      videoUrl: listing.videoUrl,
      force: isShorts ? 'shorts' : 'classic',
    });
  const title = (listing.ogTitle || '').trim() || 'Nový inzerát na portálu XXrealit';
  const description =
    (listing.ogDescription || '').trim() || 'Podívejte se na zajímavou nemovitost na XXrealit.';
  const resolved = resolveListingOgImage(listing);
  const versionSource =
    listing.facebookShareImageAt?.trim() || listing.updatedAt?.trim() || null;
  const versionMs = versionSource ? String(new Date(versionSource).getTime()) : null;
  const imageUrl = appendOgImageVersion(resolved.url, versionMs);
  const videoThumbnail = pickVideoThumbnail(listing);

  // eslint-disable-next-line no-console
  console.log('OG IMAGE SOURCE', {
    listingId: listing.id,
    thumbnailUrl: listing.thumbnailUrl,
    mainImage: listing.mainImage,
    galleryFirst: listing.images?.[0] ?? null,
    videoThumbnail,
    selectedOgImage: imageUrl,
    selectedSource: resolved.source,
    shareUrl: pageUrl,
    priceIncluded: false,
  });
  const ogType = isShorts ? 'video.other' : 'article';
  const videoAbs = listing.videoUrl?.trim()
    ? (() => {
        const t = upgradeHttpToHttps(listing.videoUrl!.trim());
        if (!t || /localhost|127\.0\.0\.1/i.test(t)) return null;
        if (/^https:\/\//i.test(t)) return t;
        if (t.startsWith('//')) return `https:${t}`;
        return t.startsWith('/') ? `${getAppOrigin()}${t}` : `${getAppOrigin()}/${t}`;
      })()
    : null;

  return {
    title,
    description,
    alternates: { canonical: pageUrl },
    openGraph: {
      type: ogType,
      title,
      description,
      url: pageUrl,
      siteName: 'XXrealit.cz',
      locale: 'cs_CZ',
      images: [{ url: imageUrl, width: 1200, height: 630, alt: listing.title, type: 'image/jpeg' }],
      ...(videoAbs
        ? {
            videos: [
              {
                url: videoAbs,
                secureUrl: videoAbs,
                type: 'video/mp4',
                width: 720,
                height: 1280,
              },
            ],
          }
        : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imageUrl],
    },
    other: {
      'og:title': title,
      'og:description': description,
      'og:image': imageUrl,
      'og:image:secure_url': imageUrl,
      'og:image:width': '1200',
      'og:image:height': '630',
      'og:image:type': 'image/jpeg',
      'og:url': pageUrl,
      'og:type': ogType,
      ...(videoAbs
        ? {
            'og:video': videoAbs,
            'og:video:secure_url': videoAbs,
            'og:video:type': 'video/mp4',
            'og:video:width': '720',
            'og:video:height': '1280',
          }
        : {}),
    },
  };
}
