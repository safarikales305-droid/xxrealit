import { getServerSideApiBaseUrl } from '@/lib/api';
import type { ListingOgInput, OgImageSource } from '@/lib/listing-og-metadata';

function asRecord(v: unknown): Record<string, unknown> | null {
  return v != null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function str(v: unknown): string | null {
  if (typeof v === 'string') {
    const t = v.trim();
    return t.length ? t : null;
  }
  return null;
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function strArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
}

/** Veřejný fetch inzerátu pro SSR metadata (Facebook crawler). */
export async function fetchPropertyForOgMetadata(
  id: string,
  shareAs?: 'classic' | 'shorts',
): Promise<ListingOgInput | null> {
  const apiBase = getServerSideApiBaseUrl();
  const trimmed = id.trim();
  if (!apiBase || !trimmed) return null;

  const ogSource = (v: unknown): OgImageSource | null => {
    const s = str(v);
    if (
      s === 'thumbnailUrl' ||
      s === 'mainImage' ||
      s === 'firstGalleryImage' ||
      s === 'videoThumbnail' ||
      s === 'generatedVideoThumbnail' ||
      s === 'videoPoster' ||
      s === 'logo'
    ) {
      if (s === 'generatedVideoThumbnail' || s === 'videoPoster') return 'videoThumbnail';
      return s;
    }
    return null;
  };

  const mapOgPayload = (prop: Record<string, unknown>): ListingOgInput => ({
    id: str(prop.id) ?? trimmed,
    title: str(prop.title) ?? 'Inzerát',
    description: str(prop.description),
    city: str(prop.city) ?? str(prop.location),
    price: num(prop.price),
    currency: str(prop.currency) ?? 'CZK',
    listingType: str(prop.listingType),
    videoUrl: str(prop.videoUrl),
    thumbnailUrl: str(prop.thumbnailUrl) ?? str(prop.thumbnail),
    mainImage: str(prop.mainImage) ?? str(prop.coverImage),
    generatedVideoThumbnail: str(prop.generatedVideoThumbnail),
    images: strArray(prop.images).length ? strArray(prop.images) : strArray(prop.galleryImages),
    resolvedOgImage:
      str(prop.selectedOgImage) ?? str(prop.ogImage) ?? str(prop.image),
    ogImageSource:
      ogSource(prop.selectedSource) ??
      ogSource(prop.source) ??
      ogSource(prop.ogImageSource),
    ogTitle: str(prop.ogTitle),
    ogDescription: str(prop.ogDescription),
    shareUrl: str(prop.shareUrl) ?? str(prop.publicUrl),
  });

  try {
    const ogQuery = shareAs ? `?shareAs=${encodeURIComponent(shareAs)}` : '';
    const ogRes = await fetch(
      `${apiBase}/properties/${encodeURIComponent(trimmed)}/og-meta${ogQuery}`,
      {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      },
    );
    if (ogRes.ok) {
      const ogBody = (await ogRes.json().catch(() => null)) as unknown;
      const og = asRecord(ogBody);
      if (og) return mapOgPayload(og);
    }

    const res = await fetch(`${apiBase}/properties/${encodeURIComponent(trimmed)}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as unknown;
    const root = asRecord(body);
    if (!root) return null;
    const prop = asRecord(root.property) ?? root;
    return mapOgPayload(prop);
  } catch {
    return null;
  }
}
