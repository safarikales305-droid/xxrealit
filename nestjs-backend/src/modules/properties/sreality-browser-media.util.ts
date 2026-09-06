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
  | 'ELEMENT_CAPTURE';

export const SREALITY_BROWSER_MEDIA_TIMEOUTS = {
  PAGE_LOAD_MS: 12_000,
  GALLERY_OPEN_MS: 8_000,
  IMAGE_LOAD_MS: 6_000,
  CONTACT_CLICK_MS: 5_000,
  ELEMENT_CAPTURE_MS: 8_000,
} as const;

export const SREALITY_BROWSER_MEDIA_LIMITS = {
  MIN_BYTES: 12 * 1024,
  MAX_BYTES: 8 * 1024 * 1024,
  MIN_WIDTH: 320,
  MIN_HEIGHT: 240,
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
  for (const candidate of buildSrealityImageFetchCandidates(url)) {
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

export async function validateSrealityImageBuffer(
  buffer: Buffer,
  contentTypeHint?: string | null,
): Promise<SrealityValidatedImageBuffer | null> {
  if (buffer.length < SREALITY_BROWSER_MEDIA_LIMITS.MIN_BYTES) return null;
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
  if (width < SREALITY_BROWSER_MEDIA_LIMITS.MIN_WIDTH || height < SREALITY_BROWSER_MEDIA_LIMITS.MIN_HEIGHT) {
    return null;
  }

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

export function shouldSuggestBrowserMediaFallback(httpStatus: number | null): boolean {
  return httpStatus === 401 || httpStatus === 403;
}

export function extFromContentType(contentType: string): string {
  const ct = contentType.toLowerCase();
  if (ct.includes('png')) return 'png';
  if (ct.includes('webp')) return 'webp';
  if (ct.includes('gif')) return 'gif';
  return 'jpg';
}
