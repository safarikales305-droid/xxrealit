import { Injectable, Logger } from '@nestjs/common';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from '../../lib/sharp-instance';
import { v2 as cloudinary } from 'cloudinary';
import { resolveAssetBaseUrl } from '../../lib/image-url';
import { getUploadsPath } from '../../lib/uploads-path';
import { initCloudinary } from '../posts/cloudinary-upload';
import {
  type PropertyOgMediaInput,
  getSiteOriginForOg,
  isValidPublicOgImageUrl,
  normalizeOgImageCandidate,
  pickPropertyMainImage,
  pickVideoThumbnail,
  propertyHasListingMedia,
} from './property-og-media.util';
import { probeOgImageUrl } from './og-image-probe.util';

const TARGET_WIDTH = 1200;
const TARGET_HEIGHT = 630;
const MAX_BYTES = 500 * 1024;

function isCloudinaryConfigured(): boolean {
  if (process.env.CLOUDINARY_URL?.trim()) return true;
  const name = process.env.CLOUDINARY_NAME ?? process.env.CLOUDINARY_CLOUD_NAME ?? '';
  const key = process.env.CLOUDINARY_KEY ?? process.env.CLOUDINARY_API_KEY ?? '';
  const secret = process.env.CLOUDINARY_SECRET ?? process.env.CLOUDINARY_API_SECRET ?? '';
  return Boolean(name && key && secret);
}

function toAbsoluteSourceUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (/^https:\/\//i.test(t)) return t;
  const base = resolveAssetBaseUrl() ?? getSiteOriginForOg();
  if (t.startsWith('/')) return `${base.replace(/\/+$/, '')}${t}`;
  return `${base.replace(/\/+$/, '')}/${t}`;
}

/** Zdroj pro generování — bez facebookShareImageUrl. */
export function pickFacebookShareSourceUrl(input: PropertyOgMediaInput): string | null {
  const candidates = [
    input.thumbnailUrl,
    input.mainImage,
    input.images?.[0],
    pickVideoThumbnail(input),
    input.generatedVideoThumbnail,
  ];
  for (const raw of candidates) {
    const normalized = normalizeOgImageCandidate(raw);
    if (normalized) return normalized;
    const abs = raw?.trim() ? toAbsoluteSourceUrl(raw) : null;
    if (abs && /^https:\/\//i.test(abs)) return abs;
  }
  if (propertyHasListingMedia(input)) {
    const main = pickPropertyMainImage(input.images ?? []);
    if (main) {
      const abs = toAbsoluteSourceUrl(main);
      if (abs) return abs;
    }
  }
  return null;
}

async function fetchImageBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(45_000),
    headers: { Accept: 'image/*' },
  });
  if (!res.ok) {
    throw new Error(`Stažení zdroje selhalo (${res.status})`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function renderFacebookJpeg(sourceBuffer: Buffer): Promise<Buffer> {
  let quality = 85;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const out = await sharp(sourceBuffer)
      .rotate()
      .resize(TARGET_WIDTH, TARGET_HEIGHT, { fit: 'cover', position: 'centre' })
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .jpeg({ quality, mozjpeg: true, chromaSubsampling: '4:2:0' })
      .toBuffer();
    if (out.length <= MAX_BYTES || quality <= 62) return out;
    quality -= 8;
  }
  return sharp(sourceBuffer)
    .rotate()
    .resize(TARGET_WIDTH, TARGET_HEIGHT, { fit: 'cover', position: 'centre' })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .jpeg({ quality: 62, mozjpeg: true })
    .toBuffer();
}

@Injectable()
export class FacebookShareImageService {
  private readonly log = new Logger(FacebookShareImageService.name);

  async uploadJpeg(propertyId: string, jpeg: Buffer): Promise<string> {
    if (isCloudinaryConfigured()) {
      initCloudinary();
      const url = await new Promise<string>((resolve, reject) => {
        const upload = cloudinary.uploader.upload_stream(
          {
            folder: 'share/facebook',
            public_id: `listing-${propertyId}`,
            overwrite: true,
            format: 'jpg',
            resource_type: 'image',
          },
          (error, result) => {
            if (error) return reject(error);
            if (!result?.secure_url) return reject(new Error('Cloudinary upload failed'));
            resolve(result.secure_url);
          },
        );
        upload.end(jpeg);
      });
      return url;
    }

    const dir = join(getUploadsPath(), 'share', 'facebook');
    await mkdir(dir, { recursive: true });
    const filename = `${propertyId}.jpg`;
    await writeFile(join(dir, filename), jpeg);
    const base = resolveAssetBaseUrl() ?? getSiteOriginForOg();
    return `${base.replace(/\/+$/, '')}/uploads/share/facebook/${filename}`;
  }

  async generateFromSource(propertyId: string, sourceUrl: string): Promise<string> {
    const buffer = await fetchImageBuffer(sourceUrl);
    const jpeg = await renderFacebookJpeg(buffer);
    const url = await this.uploadJpeg(propertyId, jpeg);
    const probe = await probeOgImageUrl(url);
    if (!probe.isPublic || probe.imageStatus !== 200) {
      throw new Error(`Facebook share obrázek není veřejně dostupný (${probe.imageStatus})`);
    }
    return url;
  }

  async ensureForProperty(input: {
    id: string;
    facebookShareImageUrl?: string | null;
    thumbnailUrl?: string | null;
    mainImage?: string | null;
    images?: string[];
    generatedVideoThumbnail?: string | null;
    videoUrl?: string | null;
    force?: boolean;
  }): Promise<string | null> {
    const existing = input.facebookShareImageUrl?.trim();
    if (!input.force && existing && isValidPublicOgImageUrl(existing)) {
      const probe = await probeOgImageUrl(existing);
      if (probe.isPublic && probe.imageStatus === 200 && !probe.isWhiteOrBlank) {
        return existing;
      }
    }

    const source = pickFacebookShareSourceUrl(input);
    if (!source) {
      this.log.warn(`Property ${input.id}: žádný zdroj pro Facebook share obrázek`);
      return existing && isValidPublicOgImageUrl(existing) ? existing : null;
    }

    try {
      const url = await this.generateFromSource(input.id, source);
      this.log.log(`Property ${input.id}: facebookShareImageUrl=${url}`);
      return url;
    } catch (e) {
      this.log.warn(
        `Property ${input.id}: generování Facebook share obrázku selhalo: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      return existing && isValidPublicOgImageUrl(existing) ? existing : null;
    }
  }
}
