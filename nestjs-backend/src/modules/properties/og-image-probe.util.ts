import sharp from 'sharp';
import {
  type OgImageSource,
  type PropertyOgMediaInput,
  type ResolvedOgImage,
  cloudinaryVideoPosterUrl,
  getPortalLogoFallbackUrl,
  normalizeOgImageCandidate,
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

/** Detekce prázdného / bílého snímku (typické u ffmpeg z času 0s). */
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

const OG_CANDIDATE_STEPS: Array<{
  pick: (input: PropertyOgMediaInput) => string | null | undefined;
  source: OgImageSource;
  rejectIfWhite: boolean;
}> = [
  { pick: (i) => i.thumbnailUrl, source: 'thumbnailUrl', rejectIfWhite: true },
  { pick: (i) => i.images?.[0], source: 'firstGalleryImage', rejectIfWhite: false },
  { pick: (i) => i.mainImage, source: 'mainImage', rejectIfWhite: false },
  {
    pick: (i) => i.generatedVideoThumbnail,
    source: 'generatedVideoThumbnail',
    rejectIfWhite: true,
  },
  {
    pick: (i) => cloudinaryVideoPosterUrl(i.videoUrl),
    source: 'videoPoster',
    rejectIfWhite: true,
  },
];

export type ResolvedOgImageWithProbe = ResolvedOgImage & {
  probe: OgImageProbeResult | null;
};

/**
 * Vybere nejlepší og:image — přeskočí 404, neveřejné a bílé video thumbnaily.
 * Priorita: thumbnailUrl → galerie → mainImage → generatedVideoThumbnail → video poster → logo.
 */
export async function resolvePropertyOgImageBest(
  input: PropertyOgMediaInput,
  siteFallbackUrl = getPortalLogoFallbackUrl(),
): Promise<ResolvedOgImageWithProbe> {
  for (const step of OG_CANDIDATE_STEPS) {
    const normalized = normalizeOgImageCandidate(step.pick(input));
    if (!normalized) continue;

    const probe = await probeOgImageUrl(normalized);
    if (!probe.isPublic) continue;
    if (step.rejectIfWhite && probe.isWhiteOrBlank) continue;

    return {
      url: normalized,
      source: step.source,
      usedFallbackLogo: false,
      probe,
    };
  }

  const fallback = siteFallbackUrl;
  const probe = await probeOgImageUrl(fallback);
  return {
    url: fallback,
    source: 'logo',
    usedFallbackLogo: true,
    probe,
  };
}
