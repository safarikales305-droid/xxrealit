import sharp from 'sharp';
import {
  type OgImageSource,
  type PropertyOgMediaInput,
  type ResolvedOgImage,
  OG_IMAGE_PRIORITY_STEPS,
  canUseFacebookShareOgImage,
  getPortalLogoFallbackUrl,
  isPortalBrandingUrl,
  isValidPublicOgImageUrl,
  normalizeOgImageCandidate,
  pickVideoThumbnail,
  propertyHasListingMedia,
  resolvePropertyOgImageWithSource,
} from './property-og-media.util';

export type OgImageProbeResult = {
  imageStatus: number | null;
  contentType: string | null;
  contentLength: number | null;
  width: number | null;
  height: number | null;
  isPublic: boolean;
  isWhiteOrBlank: boolean;
};

export async function isImageBufferWhiteOrBlank(buffer: Buffer): Promise<boolean> {
  if (!buffer.length) return true;
  try {
    const { data, info } = await sharp(buffer)
      .resize(48, 48, { fit: 'inside' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const channels = info.channels;
    let sum = 0;
    let sumSq = 0;
    let count = 0;
    for (let i = 0; i < data.length; i += channels) {
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      sum += lum;
      sumSq += lum * lum;
      count += 1;
    }
    if (count === 0) return true;
    const mean = sum / count;
    const variance = sumSq / count - mean * mean;
    return mean > 238 && variance < 180;
  } catch {
    return false;
  }
}

export async function probeOgImageUrl(url: string): Promise<OgImageProbeResult> {
  const empty: OgImageProbeResult = {
    imageStatus: null,
    contentType: null,
    contentLength: null,
    width: null,
    height: null,
    isPublic: false,
    isWhiteOrBlank: false,
  };

  if (isPortalBrandingUrl(url)) return empty;

  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
      headers: { Accept: 'image/*' },
    });
    const imageStatus = res.status;
    const contentType = res.headers.get('content-type');
    const headerLen = res.headers.get('content-length');
    if (!res.ok) {
      return {
        ...empty,
        imageStatus,
        contentType,
        contentLength: headerLen ? Number(headerLen) || null : null,
      };
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    if (!buffer.length) {
      return { ...empty, imageStatus, contentType, contentLength: 0, isWhiteOrBlank: true };
    }
    const ct = contentType ?? 'application/octet-stream';
    if (!ct.startsWith('image/')) {
      return {
        ...empty,
        imageStatus,
        contentType: ct,
        contentLength: buffer.length,
      };
    }
    const meta = await sharp(buffer).metadata();
    const width = meta.width ?? null;
    const height = meta.height ?? null;
    const isWhiteOrBlank = await isImageBufferWhiteOrBlank(buffer);
    const tooSmall = (width ?? 0) < 200 || (height ?? 0) < 200;
    return {
      imageStatus,
      contentType: ct,
      contentLength: buffer.length,
      width,
      height,
      isPublic: true,
      isWhiteOrBlank: isWhiteOrBlank || tooSmall,
    };
  } catch {
    return empty;
  }
}

export type ResolvedOgImageWithProbe = ResolvedOgImage & {
  probe: OgImageProbeResult | null;
};

/**
 * Vybere og:image — fotky bez probe, video thumbnail s probe (přeskočí bílý).
 * Nikdy logo, pokud inzerát má jakékoliv médium.
 */
export async function resolvePropertyOgImageBest(
  input: PropertyOgMediaInput,
  siteFallbackUrl = getPortalLogoFallbackUrl(),
): Promise<ResolvedOgImageWithProbe> {
  const fb = input.facebookShareImageUrl?.trim();
  if (fb && canUseFacebookShareOgImage(input)) {
    return {
      url: fb,
      source: 'facebookShareImage',
      usedFallbackLogo: false,
      isLogoFallback: false,
      probe: null,
    };
  }

  const photoSteps = OG_IMAGE_PRIORITY_STEPS.filter(
    (s) => s.source !== 'videoThumbnail' && s.source !== 'facebookShareImage',
  );
  const videoStep = OG_IMAGE_PRIORITY_STEPS.find((s) => s.source === 'videoThumbnail');

  for (const step of photoSteps) {
    const normalized = normalizeOgImageCandidate(step.pick(input));
    if (!normalized || isPortalBrandingUrl(normalized)) continue;
    return {
      url: normalized,
      source: step.source,
      usedFallbackLogo: false,
      isLogoFallback: false,
      probe: await probeOgImageUrl(normalized),
    };
  }

  if (videoStep) {
    const normalized = pickVideoThumbnail(input);
    if (normalized && !isPortalBrandingUrl(normalized)) {
      const probe = await probeOgImageUrl(normalized);
      if (!probe.isWhiteOrBlank) {
        return {
          url: normalized,
          source: 'videoThumbnail',
          usedFallbackLogo: false,
          isLogoFallback: false,
          probe,
        };
      }
    }
  }

  if (propertyHasListingMedia(input)) {
    const sync = resolvePropertyOgImageWithSource(input, siteFallbackUrl);
    if (!sync.isLogoFallback) {
      return { ...sync, probe: await probeOgImageUrl(sync.url) };
    }
  }

  if (!propertyHasListingMedia(input)) {
    const fallback = siteFallbackUrl;
    return {
      url: fallback,
      source: 'logo',
      usedFallbackLogo: true,
      isLogoFallback: true,
      probe: await probeOgImageUrl(fallback),
    };
  }

  const sync = resolvePropertyOgImageWithSource(input, siteFallbackUrl);
  return { ...sync, probe: null };
}

export function mapSourceToApiLabel(source: OgImageSource): string {
  return source;
}
