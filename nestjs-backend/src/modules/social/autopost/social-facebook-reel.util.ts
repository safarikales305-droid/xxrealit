/** Max. velikost videa pro Reels upload (500 MB). */
export const FACEBOOK_REEL_MAX_BYTES = 500 * 1024 * 1024;

/** Doporučená max. délka Reelu (sekundy). */
export const FACEBOOK_REEL_MAX_SECONDS = 90;

export type RemoteVideoValidation = {
  ok: boolean;
  contentLength?: number;
  contentType?: string;
  error?: string;
};

export function isShortsVideoProperty(property: {
  listingType?: string | null;
  videoUrl?: string | null;
}): boolean {
  const isShorts = String(property.listingType ?? '').toUpperCase() === 'SHORTS';
  const hasVideo = Boolean(property.videoUrl?.trim());
  return isShorts && hasVideo;
}

export function propertyHasPublishableVideo(property: {
  videoUrl?: string | null;
}): boolean {
  return Boolean(property.videoUrl?.trim());
}

/** Ověří HTTPS dostupnost videa a základní metadata (typ, velikost). */
export async function validateRemoteVideoForFacebook(
  videoUrl: string,
  opts: { maxBytes?: number } = {},
): Promise<RemoteVideoValidation> {
  const maxBytes = opts.maxBytes ?? FACEBOOK_REEL_MAX_BYTES;
  if (!/^https:\/\//i.test(videoUrl.trim())) {
    return { ok: false, error: 'Video musí být dostupné přes HTTPS URL.' };
  }

  try {
    const head = await fetch(videoUrl, {
      method: 'HEAD',
      signal: AbortSignal.timeout(20_000),
      redirect: 'follow',
    });

    if (!head.ok) {
      return {
        ok: false,
        error: `Video URL není dostupné (HTTP ${head.status}).`,
      };
    }

    const contentType = head.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
    const lengthRaw = head.headers.get('content-length');
    const contentLength = lengthRaw ? Number.parseInt(lengthRaw, 10) : undefined;

    if (contentType && !contentType.startsWith('video/') && contentType !== 'application/octet-stream') {
      return {
        ok: false,
        error: `URL neobsahuje video (Content-Type: ${contentType || 'neznámý'}).`,
      };
    }

    if (contentLength != null && Number.isFinite(contentLength)) {
      if (contentLength > maxBytes) {
        const mb = Math.round(contentLength / (1024 * 1024));
        const maxMb = Math.round(maxBytes / (1024 * 1024));
        return {
          ok: false,
          error: `Video je příliš velké (${mb} MB, max. ${maxMb} MB).`,
          contentLength,
          contentType,
        };
      }
      if (contentLength < 1024) {
        return {
          ok: false,
          error: 'Video soubor je prázdný nebo poškozený.',
          contentLength,
          contentType,
        };
      }
    }

    return { ok: true, contentLength, contentType: contentType || undefined };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Video nelze ověřit: ${message}` };
  }
}

export function facebookReelPermalink(videoId: string): string {
  const id = videoId.trim();
  if (!id) return 'https://www.facebook.com/';
  return `https://www.facebook.com/reel/${encodeURIComponent(id)}`;
}
