import { createHash } from 'node:crypto';
import type { Metadata } from 'sharp';
import sharp from 'sharp';
import {
  buildSrealityImageFetchCandidates,
  imageDedupeKey,
  normalizeSrealityImageUrl,
  normalizeSrealityImageUrlRaw,
} from './sreality-image.util';
import { isAllowedSrealityImageUrl } from './sreality-import-security.util';

export type SrealityImageCaptureMethod =
  | 'DIRECT_HTTP'
  | 'BROWSER_RESPONSE'
  | 'BROWSER_CONTEXT'
  | 'DOM_BLOB'
  | 'ELEMENT_CAPTURE';

export const SREALITY_BROWSER_MEDIA_TIMEOUTS = {
  PAGE_LOAD_MS: 35_000,
  GALLERY_OPEN_MS: 15_000,
  IMAGE_LOAD_MS: 8_000,
  CONTACT_CLICK_MS: 6_000,
  ELEMENT_CAPTURE_MS: 6_000,
  PER_IMAGE_PIPELINE_MS: 12_000,
  RESPONSE_DRAIN_MS: 2_000,
} as const;

export const SREALITY_BROWSER_MEDIA_LIMITS = {
  MIN_BYTES: 4 * 1024,
  MAX_BYTES: 8 * 1024 * 1024,
  MIN_WIDTH: 160,
  MIN_HEIGHT: 120,
} as const;

export type SrealityValidatedImageBuffer = {
  buffer: Buffer;
  contentType: string;
  width: number;
  height: number;
  contentHash: string;
};

export type SrealityBrowserCapturedImage = SrealityValidatedImageBuffer & {
  sourceUrl: string;
  matchKey: string;
  method: SrealityImageCaptureMethod;
};

export function isSrealityCdnResponseUrl(url: string): boolean {
  try {
    return isAllowedSrealityImageUrl(url);
  } catch {
    return false;
  }
}

export function matchKeysForImageUrl(url: string): string[] {
  const keys = new Set<string>();
  for (const candidate of [
    ...buildSrealityImageFetchCandidates(url),
    ...buildSdnFullSizeCandidates(url),
  ]) {
    keys.add(imageDedupeKey(candidate));
    const raw = normalizeSrealityImageUrlRaw(candidate);
    if (raw) keys.add(imageDedupeKey(raw));
    const upgraded = normalizeSrealityImageUrl(candidate);
    if (upgraded) keys.add(imageDedupeKey(upgraded));
  }
  keys.add(imageDedupeKey(url));
  return [...keys];
}

export function imageContentHash(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export async function inspectSrealityImageBuffer(
  buffer: Buffer,
  contentTypeHint?: string | null,
): Promise<SrealityValidatedImageBuffer | null> {
  if (buffer.length < 512) return null;
  if (buffer.length > SREALITY_BROWSER_MEDIA_LIMITS.MAX_BYTES) return null;
  if (buffer.slice(0, 15).toString('utf8').toLowerCase().includes('<!doctype')) return null;
  if (buffer.slice(0, 5).toString('utf8').toLowerCase().startsWith('<html')) return null;

  let meta: Metadata;
  try {
    meta = await sharp(buffer).metadata();
  } catch {
    return null;
  }
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width < 1 || height < 1) return null;

  const contentType =
    contentTypeHint?.split(';')[0]?.trim() ||
    (meta.format === 'png'
      ? 'image/png'
      : meta.format === 'webp'
        ? 'image/webp'
        : meta.format === 'gif'
          ? 'image/gif'
          : 'image/jpeg');

  return {
    buffer,
    contentType,
    width,
    height,
    contentHash: imageContentHash(buffer),
  };
}

export async function validateSrealityImageBuffer(
  buffer: Buffer,
  contentTypeHint?: string | null,
): Promise<SrealityValidatedImageBuffer | null> {
  const inspected = await inspectSrealityImageBuffer(buffer, contentTypeHint);
  if (!inspected) return null;
  if (inspected.buffer.length < SREALITY_BROWSER_MEDIA_LIMITS.MIN_BYTES) return null;
  if (
    inspected.width < SREALITY_BROWSER_MEDIA_LIMITS.MIN_WIDTH ||
    inspected.height < SREALITY_BROWSER_MEDIA_LIMITS.MIN_HEIGHT
  ) {
    return null;
  }
  return inspected;
}

export function buildSdnFullSizeCandidates(url: string): string[] {
  const out: string[] = [];
  const push = (candidate: string) => {
    if (!out.includes(candidate)) out.push(candidate);
  };
  push(url);
  try {
    const base = new URL(url);
    base.search = '';
    push(base.href);
    for (const size of ['1920,1280', '1600,1200', '1200,900', '800,800']) {
      const sized = new URL(base.href);
      sized.searchParams.set('fl', `res,${size},1|web`);
      push(sized.href);
      const jpeg = new URL(base.href);
      jpeg.searchParams.set('fl', `res,${size},1|jpg,90`);
      push(jpeg.href);
    }
  } catch {
    /* ignore */
  }
  return out;
}

export function shouldSuggestBrowserMediaFallback(httpStatus: number | null): boolean {
  return httpStatus === 401 || httpStatus === 403;
}

/** SDN CDN vyžaduje browser session — direct server-side fetch typicky vrací 401. */
export function isSdnProtectedImageUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'sdn.cz' || host.endsWith('.sdn.cz');
  } catch {
    return false;
  }
}

export function isBrowserRequiredImageUrl(url: string): boolean {
  return isSdnProtectedImageUrl(url);
}

export function isLikelyImageResponse(contentType: string | null | undefined): boolean {
  const ct = (contentType ?? '').toLowerCase();
  if (!ct) return true;
  return (
    ct.startsWith('image/') ||
    ct.includes('jpeg') ||
    ct.includes('png') ||
    ct.includes('webp') ||
    ct.includes('avif')
  );
}

export function isSuccessfulImageStatus(status: number): boolean {
  return status === 200 || status === 206;
}

export function findBestCapturedForTargetUrl<
  T extends { sourceUrl: string; matchKey: string; contentHash: string; buffer: Buffer },
>(targetUrl: string, pool: Map<string, T>): T | undefined {
  for (const key of matchKeysForImageUrl(targetUrl)) {
    const hit = pool.get(key);
    if (hit) return hit;
  }
  const targetKey = imageDedupeKey(targetUrl);
  for (const [key, value] of pool.entries()) {
    if (key === targetKey) return value;
    if (value.sourceUrl && imageDedupeKey(value.sourceUrl) === targetKey) return value;
  }
  return undefined;
}

export function extFromContentType(contentType: string): string {
  const ct = contentType.toLowerCase();
  if (ct.includes('png')) return 'png';
  if (ct.includes('webp')) return 'webp';
  if (ct.includes('gif')) return 'gif';
  return 'jpg';
}
