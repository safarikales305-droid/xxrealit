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
};

const OG_IMAGE_TRANSFORM = 'w_1200,h_630,c_fill,f_jpg,q_auto';

export function getPortalLogoFallbackUrl(): string {
  return `${getAppOrigin()}/icons/icon-192.png`;
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

/** Priorita: thumbnailUrl → mainImage → galerie → generatedVideoThumbnail → poster z videa → logo. */
export function resolveListingOgImageUrl(listing: ListingOgInput): string {
  const candidates = [
    listing.thumbnailUrl,
    listing.mainImage,
    listing.images?.[0],
    listing.generatedVideoThumbnail,
    listing.videoUrl ? cloudinaryVideoPosterUrl(listing.videoUrl) : null,
  ];
  for (const raw of candidates) {
    if (typeof raw !== 'string' || !raw.trim()) continue;
    const url = cloudinaryOgImageUrl(raw);
    if (url) return url;
  }
  return getPortalLogoFallbackUrl();
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
  return `${title} · ${priceLine}`;
}

export function buildListingOgDescription(listing: ListingOgInput): string {
  const city = (listing.city || '').trim() || 'Lokalita neuvedena';
  const desc = (listing.description || '').trim().replace(/\s+/g, ' ');
  const short = desc.slice(0, 160);
  return short ? `${city} — ${short}` : city;
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
  const imageUrl = resolveListingOgImageUrl(listing);
  const isShorts =
    String(listing.listingType ?? '').toUpperCase() === 'SHORTS' ||
    Boolean(listing.videoUrl?.trim());

  return {
    title,
    description,
    alternates: { canonical: pageUrl },
    openGraph: {
      type: isShorts ? 'video.other' : 'article',
      title,
      description,
      url: pageUrl,
      siteName: 'XXrealit',
      locale: 'cs_CZ',
      images: [{ url: imageUrl, width: 1200, height: 630, alt: listing.title }],
      ...(listing.videoUrl?.trim()
        ? {
            videos: [
              {
                url: upgradeHttpToHttps(listing.videoUrl.trim()),
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
    other: listing.videoUrl?.trim()
      ? {
          'og:video': upgradeHttpToHttps(listing.videoUrl.trim()),
          'og:video:type': 'video/mp4',
          'og:video:width': '720',
          'og:video:height': '1280',
        }
      : undefined,
  };
}
