import type { Metadata } from 'next';
import { getAppOrigin } from '@/lib/app-url';
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
  mainImage?: string | null;
  generatedVideoThumbnail?: string | null;
  images?: string[];
  /** Předpočítané z API /api/properties/:id/og-meta */
  resolvedOgImage?: string | null;
  ogImageSource?: OgImageSource | null;
};

export type OgImageSource =
  | 'thumbnailUrl'
  | 'generatedVideoThumbnail'
  | 'mainImage'
  | 'firstGalleryImage'
  | 'videoPoster'
  | 'logo';

const OG_IMAGE_TRANSFORM = 'w_1200,h_630,c_fill,f_jpg,q_auto';

export function getPortalLogoFallbackUrl(): string {
  return ensureAbsoluteOgUrl('/icons/icon-192.png');
}

/** Ověří, že URL je veřejná HTTPS adresa vhodná pro og:image. */
export function isValidPublicOgImageUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;
  const u = url.trim();
  if (u.startsWith('blob:') || u.startsWith('data:')) return false;
  if (/localhost|127\.0\.0\.1/i.test(u)) return false;
  if (!/^https:\/\//i.test(u)) return false;
  return true;
}

export function ensureAbsoluteOgUrl(url: string): string {
  const t = upgradeHttpToHttps(url.trim());
  if (!t) return getPortalLogoFallbackUrl();
  if (/^https:\/\//i.test(t)) return t;
  if (t.startsWith('//')) return `https:${t}`;
  const origin = getAppOrigin();
  const abs = t.startsWith('/') ? `${origin}${t}` : `${origin}/${t}`;
  return isValidPublicOgImageUrl(abs) ? abs : getPortalLogoFallbackUrl();
}

function cloudinaryOgImageUrl(imageUrl: string): string {
  const u = upgradeHttpToHttps(imageUrl.trim());
  if (!/res\.cloudinary\.com/i.test(u) || !/\/image\/upload\//i.test(u)) {
    return u;
  }
  const marker = '/image/upload/';
  const idx = u.indexOf(marker);
  if (idx < 0) return u;
  const prefix = u.slice(0, idx + marker.length);
  const rest = u.slice(idx + marker.length);
  if (rest.startsWith(`${OG_IMAGE_TRANSFORM}/`)) return u;
  return `${prefix}${OG_IMAGE_TRANSFORM}/${rest}`;
}

function cloudinaryVideoPosterUrl(videoUrl: string): string | null {
  const u = upgradeHttpToHttps(videoUrl.trim());
  if (!/res\.cloudinary\.com/i.test(u) || !/\/video\/upload\//i.test(u)) return null;
  const marker = '/video/upload/';
  const idx = u.indexOf(marker);
  if (idx < 0) return null;
  const prefix = u.slice(0, idx + marker.length);
  const rest = u.slice(idx + marker.length);
  const transform = `${OG_IMAGE_TRANSFORM},so_1`;
  const withoutExt = rest.replace(/\.[a-z0-9]+$/i, '');
  return `${prefix}${transform}/${withoutExt}.jpg`;
}

function normalizeOgImageCandidate(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  if (/\/video\/upload\//i.test(raw)) {
    const poster = cloudinaryVideoPosterUrl(raw);
    if (!poster) return null;
    const abs = ensureAbsoluteOgUrl(poster);
    return isValidPublicOgImageUrl(abs) ? abs : null;
  }
  const img = cloudinaryOgImageUrl(raw);
  if (!img) return null;
  const abs = ensureAbsoluteOgUrl(img);
  return isValidPublicOgImageUrl(abs) ? abs : null;
}

export type ResolvedOgImage = {
  url: string;
  source: OgImageSource;
  usedFallbackLogo: boolean;
};

/** Priorita: thumbnailUrl → generatedVideoThumbnail → mainImage → galerie → video poster → logo. */
export function resolveListingOgImage(listing: ListingOgInput): ResolvedOgImage {
  if (listing.resolvedOgImage && isValidPublicOgImageUrl(listing.resolvedOgImage)) {
    const source = listing.ogImageSource ?? 'thumbnailUrl';
    return {
      url: listing.resolvedOgImage,
      source,
      usedFallbackLogo: source === 'logo',
    };
  }

  const steps: Array<{ raw: string | null | undefined; source: OgImageSource }> = [
    { raw: listing.thumbnailUrl, source: 'thumbnailUrl' },
    { raw: listing.generatedVideoThumbnail, source: 'generatedVideoThumbnail' },
    { raw: listing.mainImage, source: 'mainImage' },
    { raw: listing.images?.[0], source: 'firstGalleryImage' },
    {
      raw: listing.videoUrl ? cloudinaryVideoPosterUrl(listing.videoUrl) : null,
      source: 'videoPoster',
    },
  ];

  for (const step of steps) {
    const normalized = normalizeOgImageCandidate(step.raw);
    if (normalized) {
      return { url: normalized, source: step.source, usedFallbackLogo: false };
    }
  }

  return {
    url: getPortalLogoFallbackUrl(),
    source: 'logo',
    usedFallbackLogo: true,
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
  city?: string | null;
  price?: number | null;
  currency?: string | null;
  url: string;
}): string {
  const lines = [
    opts.title.trim(),
    formatListingPrice(opts.price, opts.currency ?? 'CZK'),
    (opts.city || '').trim() || 'Lokalita neuvedena',
    opts.url.trim(),
  ];
  return lines.filter(Boolean).join('\n');
}

export function listingPublicDetailUrl(id: string): string {
  return `${getAppOrigin()}/nemovitost/${encodeURIComponent(id)}`;
}

export function facebookDebuggerUrl(pageUrl: string): string {
  return `https://developers.facebook.com/tools/debug/?q=${encodeURIComponent(pageUrl)}`;
}

export function buildListingOpenGraphMetadata(listing: ListingOgInput): Metadata {
  const pageUrl = listingPublicDetailUrl(listing.id);
  const title = buildListingOgTitle(listing);
  const description = buildListingOgDescription(listing);
  const { url: imageUrl } = resolveListingOgImage(listing);
  const isShorts =
    String(listing.listingType ?? '').toUpperCase() === 'SHORTS' ||
    Boolean(listing.videoUrl?.trim());
  const ogType = isShorts ? 'video.other' : 'article';
  const videoAbs = listing.videoUrl?.trim()
    ? ensureAbsoluteOgUrl(listing.videoUrl.trim())
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
