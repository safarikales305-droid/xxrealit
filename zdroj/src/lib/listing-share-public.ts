import { getServerSideApiBaseUrl } from '@/lib/api';
import type { ShortVideo } from '@/lib/nest-client';

export type PublicShareFetchResult =
  | { ok: true; property: Record<string, unknown>; user: Record<string, unknown> }
  | { ok: false; status: number; message: string };

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
  return null;
}

function strArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
}

/** Veřejný detail pro sdílené odkazy (bez JWT). */
export async function fetchPublicListingShare(
  id: string,
  shareAs: 'classic' | 'shorts',
): Promise<PublicShareFetchResult> {
  const apiBase = getServerSideApiBaseUrl();
  const trimmed = id.trim();
  if (!apiBase || !trimmed) {
    return { ok: false, status: 503, message: 'API není dostupné' };
  }

  try {
    const res = await fetch(
      `${apiBase}/properties/${encodeURIComponent(trimmed)}/public-share?shareAs=${encodeURIComponent(shareAs)}`,
      { cache: 'no-store', headers: { Accept: 'application/json' } },
    );
    if (res.status === 404) {
      return { ok: false, status: 404, message: 'Inzerát nenalezen' };
    }
    if (res.status === 410) {
      return { ok: false, status: 410, message: 'Inzerát již není aktivní' };
    }
    if (!res.ok) {
      return { ok: false, status: res.status, message: 'Inzerát se nepodařilo načíst' };
    }
    const body = (await res.json().catch(() => null)) as unknown;
    const root = asRecord(body);
    const property = asRecord(root?.property);
    const user = asRecord(root?.user);
    if (!property) {
      return { ok: false, status: 502, message: 'Neplatná odpověď serveru' };
    }
    return { ok: true, property, user: user ?? {} };
  } catch {
    return { ok: false, status: 503, message: 'Spojení se serverem selhalo' };
  }
}

function videoFromMedia(property: Record<string, unknown>): string | null {
  const media = property.media;
  if (!Array.isArray(media)) return null;
  for (const row of media) {
    const m = asRecord(row);
    if (!m) continue;
    const type = str(m.type)?.toLowerCase();
    const url = str(m.url);
    if (type === 'video' && url) return url;
  }
  return null;
}

export function propertyToShortVideo(
  property: Record<string, unknown>,
  fallbackId: string,
): ShortVideo {
  const images = strArray(property.images);
  const imageUrl =
    str(property.mainImage) ??
    str(property.imageUrl) ??
    str(property.thumbnailUrl) ??
    images[0] ??
    null;
  const videoUrl =
    str(property.videoUrl) ?? videoFromMedia(property) ?? null;

  return {
    id: str(property.id) ?? fallbackId,
    videoUrl: videoUrl ?? undefined,
    url: videoUrl ?? undefined,
    title: str(property.title),
    price: num(property.price),
    city: str(property.city) ?? str(property.location),
    images: images.length ? images : imageUrl ? [imageUrl] : undefined,
    imageUrl,
    createdAt: str(property.createdAt) ?? new Date().toISOString(),
    publishedAt: str(property.publishedAt),
    viewsCount:
      typeof property.viewsCount === 'number' && Number.isFinite(property.viewsCount)
        ? Math.max(0, Math.trunc(property.viewsCount))
        : undefined,
    userId: str(property.userId) ?? undefined,
  };
}

export function propertyHasPlayableVideo(property: Record<string, unknown>): boolean {
  return Boolean(str(property.videoUrl)?.trim() || videoFromMedia(property));
}
