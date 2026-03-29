/**
 * Normalizes video URLs for `<video src>` so files under `public/videos/` resolve
 * correctly and legacy paths like `/video/...` map to `/videos/...`.
 */
export function normalizePublicVideoUrl(
  input: string | null | undefined,
): string | null {
  if (input == null) return null;
  let u = input.trim();
  if (!u) return null;

  u = u.replace(/^\.\/video\//i, '/videos/').replace(/^\/video\//i, '/videos/');

  if (/^https?:\/\//i.test(u) || u.startsWith('//')) {
    return u;
  }

  if (!u.startsWith('/')) {
    u = `/videos/${u.replace(/^\.?\/?videos\/?/i, '')}`;
  }

  return u;
}

/** Served from `public/videos` — demo + per-row fallback when API has no local `/videos/*` URL. */
export const PUBLIC_SHORTS_FALLBACKS = [
  '/videos/byt.mp4',
  '/videos/dum.mp4',
  '/videos/pozemek.mp4',
] as const;

/**
 * Shorts feed: only same-origin `/videos/*` (Vercel-safe). Remote `http(s)` URLs
 * are ignored so `<video src>` always points at `public/videos`.
 */
export function toPublicShortsVideoSrc(
  input: string | null | undefined,
): string | null {
  if (input == null) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('//')) {
    return null;
  }

  const normalized = normalizePublicVideoUrl(trimmed);
  if (!normalized) return null;
  if (/^https?:\/\//i.test(normalized) || normalized.startsWith('//')) {
    return null;
  }
  if (!normalized.startsWith('/videos/')) {
    return null;
  }
  return normalized;
}

export function resolveShortsPublicSrc(
  item: { videoUrl: string | null | undefined },
  index: number,
): string {
  const fromApi = toPublicShortsVideoSrc(item.videoUrl);
  if (fromApi) return fromApi;
  return PUBLIC_SHORTS_FALLBACKS[index % PUBLIC_SHORTS_FALLBACKS.length]!;
}
