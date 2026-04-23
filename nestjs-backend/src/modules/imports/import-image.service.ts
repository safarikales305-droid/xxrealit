import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as fs from 'node:fs';
import { join } from 'node:path';
import type { Metadata } from 'sharp';
import { getUploadsPath } from '../../lib/uploads-path';
import { PropertyMediaCloudinaryService } from '../properties/property-media-cloudinary.service';
import { ProfileImagesService } from '../upload/profile-images.service';
import { isProfileRemoteStorageConfigured } from '../upload/profile-media-storage.service';
import { normalizeStoredImageUrl } from './import-image-urls';

const MAX_DOWNLOAD_BYTES = 15 * 1024 * 1024;
const MIN_DOWNLOAD_BYTES = 12 * 1024;
const MIN_IMAGE_WIDTH = 480;
const MIN_IMAGE_HEIGHT = 320;
const FETCH_TIMEOUT_MS = 45_000;
const DEFAULT_DELAY_MS = 120;
const MAX_IMAGES_PER_LISTING = 24;
/** Paralelní stažení fotek jednoho inzerátu (omezení zahlcení). */
const MIRROR_IMAGE_CONCURRENCY = 4;

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Externí obrázky z Reality CDN — stáhneme a nahrajeme k nám. */
export function shouldMirrorRealityImportedImageUrl(url: string): boolean {
  const n = normalizeStoredImageUrl(url);
  if (!n) return false;
  const h = hostnameOf(n);
  if (!h) return false;
  return (
    h === 'reality.cz' ||
    h.endsWith('.reality.cz') ||
    h.endsWith('century21.cz') ||
    h.includes('igluu.cz')
  );
}

function safeFileBasePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9-_]+/g, '_').slice(0, 96) || 'x';
}

function extFromMimeOrUrl(
  contentType: string | null | undefined,
  imageUrl: string,
  formatHint?: string,
): string {
  const mt = (contentType ?? '').toLowerCase().split(';')[0]!.trim();
  if (mt.includes('png')) return 'png';
  if (mt.includes('webp')) return 'webp';
  if (mt.includes('gif')) return 'gif';
  if (mt.includes('jpeg') || mt === 'image/jpg') return 'jpg';
  const f = (formatHint ?? '').toLowerCase();
  if (f === 'png') return 'png';
  if (f === 'webp') return 'webp';
  if (f === 'gif') return 'gif';
  try {
    const p = new URL(imageUrl).pathname.toLowerCase();
    if (p.endsWith('.png')) return 'png';
    if (p.endsWith('.webp')) return 'webp';
    if (p.endsWith('.gif')) return 'gif';
  } catch {
    /* ignore */
  }
  return 'jpg';
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export type ImportExternalImageParams = {
  imageUrl: string;
  propertyId: string;
  sourcePortalKey: string;
  index: number;
};

export type ImportExternalImageResult = {
  originalUrl: string;
  storedUrl: string;
  watermarkedUrl?: string | null;
  mediaId?: string;
};

@Injectable()
export class ImportImageService {
  private readonly log = new Logger(ImportImageService.name);

  constructor(
    private readonly propertyMediaCloudinary: PropertyMediaCloudinaryService,
    private readonly profileImages: ProfileImagesService,
  ) {}

  /**
   * Stáhne binární data z externí URL a nahraje je stejným způsobem jako fotky z formuláře inzerátu
   * (Cloudinary `properties/` nebo lokální `uploads/properties/` bez Cloudinary).
   */
  async importExternalImageToPortal(
    params: ImportExternalImageParams,
  ): Promise<ImportExternalImageResult | null> {
    const originalUrl = normalizeStoredImageUrl(params.imageUrl);
    if (!originalUrl) return null;

    let buffer: Buffer;
    let contentType: string | null;
    try {
      const res = await axios.get(originalUrl, {
        responseType: 'arraybuffer',
        timeout: FETCH_TIMEOUT_MS,
        maxRedirects: 5,
        validateStatus: (s: number) => s >= 200 && s < 300,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; XXRealitImport/1.0; +https://www.xxrealit.cz)',
          Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        },
      });
      const cl = String(res.headers['content-length'] ?? '');
      if (cl && Number(cl) > MAX_DOWNLOAD_BYTES) {
        this.log.warn(`[import-image] content-length too large url=${originalUrl.slice(0, 80)}`);
        return null;
      }
      const ct = String(res.headers['content-type'] ?? '').toLowerCase();
      if (!ct.startsWith('image/')) {
        this.log.warn(`[import-image] non-image content-type="${ct}" url=${originalUrl.slice(0, 100)}`);
        return null;
      }
      const arr = new Uint8Array(res.data);
      if (arr.byteLength <= 0) {
        this.log.warn(`[import-image] empty response body url=${originalUrl.slice(0, 100)}`);
        return null;
      }
      if (arr.byteLength < MIN_DOWNLOAD_BYTES) {
        this.log.warn(
          `[import-image] body too small bytes=${arr.byteLength} min=${MIN_DOWNLOAD_BYTES} url=${originalUrl.slice(0, 100)}`,
        );
        return null;
      }
      if (arr.byteLength > MAX_DOWNLOAD_BYTES) {
        this.log.warn(`[import-image] body too large bytes=${arr.byteLength}`);
        return null;
      }
      buffer = Buffer.from(arr);
      contentType = String(res.headers['content-type'] ?? '');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(`[import-image] fetch failed ${originalUrl.slice(0, 100)}: ${msg}`);
      return null;
    }

    const originalnameGuess = `import-${params.sourcePortalKey}-${params.index}.${extFromMimeOrUrl(contentType, originalUrl)}`;

    let meta: Metadata;
    try {
      meta = await this.profileImages.validateRasterInput(
        buffer,
        contentType ?? undefined,
        originalnameGuess,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(`[import-image] validate failed: ${msg}`);
      return null;
    }
    const width = typeof meta.width === 'number' ? meta.width : null;
    const height = typeof meta.height === 'number' ? meta.height : null;
    if (width === null || height === null || width <= 0 || height <= 0) {
      this.log.warn(`[import-image] invalid dimensions width=${width} height=${height}`);
      return null;
    }
    if (width < MIN_IMAGE_WIDTH || height < MIN_IMAGE_HEIGHT) {
      this.log.warn(
        `[import-image] image too small ${width}x${height} min=${MIN_IMAGE_WIDTH}x${MIN_IMAGE_HEIGHT} url=${originalUrl.slice(0, 100)}`,
      );
      return null;
    }
    const ratio = Math.max(width / height, height / width);
    if (ratio > 5) {
      this.log.warn(
        `[import-image] extreme aspect ratio width=${width} height=${height} ratio=${ratio.toFixed(2)} url=${originalUrl.slice(0, 100)}`,
      );
      return null;
    }

    const ext = extFromMimeOrUrl(contentType, originalUrl, meta.format);
    const base = `${safeFileBasePart(params.sourcePortalKey)}-${safeFileBasePart(params.propertyId)}-${params.index}-${Date.now()}`;

    let storedUrl: string;
    let watermarkedUrl: string | null = null;
    if (isProfileRemoteStorageConfigured()) {
      try {
        const name = `${base}.${ext}`;
        const uploaded =
          await this.propertyMediaCloudinary.uploadImageBufferWithWatermarkVariants(
            buffer,
            name,
          );
        storedUrl = uploaded.originalUrl;
        watermarkedUrl = uploaded.watermarkedUrl ?? null;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.log.error(`[import-image] cloudinary upload failed, zkouším lokální zálohu: ${msg}`);
        const dir = join(getUploadsPath(), 'properties');
        try {
          fs.mkdirSync(dir, { recursive: true });
          const name = `${base}.${ext}`;
          const outPath = join(dir, name);
          fs.writeFileSync(outPath, buffer);
          storedUrl = `/uploads/properties/${name}`;
          watermarkedUrl = null;
          this.log.warn(`[import-image] uloženo lokálně po selhání watermarku: ${storedUrl}`);
        } catch (e2) {
          const m2 = e2 instanceof Error ? e2.message : String(e2);
          this.log.error(`[import-image] ani lokální záloha po Cloudinary selhání: ${m2}`);
          return null;
        }
      }
    } else {
      const dir = join(getUploadsPath(), 'properties');
      fs.mkdirSync(dir, { recursive: true });
      const name = `${base}.${ext}`;
      const outPath = join(dir, name);
      try {
        fs.writeFileSync(outPath, buffer);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.log.error(`[import-image] local write failed: ${msg}`);
        return null;
      }
      storedUrl = `/uploads/properties/${name}`;
      this.log.warn(
        `[import-image] Cloudinary není nastaveno — uloženo lokálně ${storedUrl} (nepersistní např. na Railway).`,
      );
    }

    const normalizedOut = normalizeStoredImageUrl(storedUrl);
    if (!normalizedOut && storedUrl.startsWith('/')) {
      return { originalUrl, storedUrl, watermarkedUrl };
    }
    return {
      originalUrl,
      storedUrl: normalizedOut ?? storedUrl,
      watermarkedUrl: watermarkedUrl
        ? normalizeStoredImageUrl(watermarkedUrl) ?? watermarkedUrl
        : null,
    };
  }

  /**
   * Pro každou URL: Reality.cz (a subdomény) zrcadlíme k našemu storage, ostatní necháme beze změny.
   */
  async mirrorRealityListingImageVariants(params: {
    urls: string[];
    propertyId: string;
    sourcePortalKey: string;
    delayMsBetweenFetches?: number;
    /** Inkrementuje se při úspěšném stažení+zrcadlení z reality.cz CDN. */
    stats?: { mirroredSuccess?: number };
  }): Promise<Array<{ originalUrl: string; watermarkedUrl: string | null }>> {
    const delay = params.delayMsBetweenFetches ?? DEFAULT_DELAY_MS;
    const slice = params.urls.slice(0, MAX_IMAGES_PER_LISTING);
    const out: Array<{ originalUrl: string; watermarkedUrl: string | null }> = [];

    type Variant = { originalUrl: string; watermarkedUrl: string | null };
    const mirrorOne = async (i: number): Promise<{ items: Variant[]; mirroredInc: number }> => {
      const raw = slice[i]!;
      try {
        const normalized = normalizeStoredImageUrl(raw);
        if (!normalized) return { items: [], mirroredInc: 0 };

        if (!shouldMirrorRealityImportedImageUrl(normalized)) {
          return { items: [{ originalUrl: normalized, watermarkedUrl: null }], mirroredInc: 0 };
        }

        const done = await this.importExternalImageToPortal({
          imageUrl: normalized,
          propertyId: params.propertyId,
          sourcePortalKey: params.sourcePortalKey,
          index: i,
        });
        if (done?.storedUrl) {
          const orig = normalizeStoredImageUrl(done.storedUrl) ?? done.storedUrl;
          const wm = done.watermarkedUrl
            ? normalizeStoredImageUrl(done.watermarkedUrl) ?? done.watermarkedUrl
            : null;
          if (orig) {
            return { items: [{ originalUrl: orig, watermarkedUrl: wm }], mirroredInc: 1 };
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.log.warn(`[import-image] mirror slot ${i} failed: ${msg.slice(0, 160)}`);
      }
      return { items: [], mirroredInc: 0 };
    };

    for (let i = 0; i < slice.length; ) {
      const batchEnd = Math.min(slice.length, i + MIRROR_IMAGE_CONCURRENCY);
      const batch = await Promise.all(
        Array.from({ length: batchEnd - i }, (_, k) => mirrorOne(i + k)),
      );
      for (const { items, mirroredInc } of batch) {
        if (params.stats && mirroredInc > 0) {
          params.stats.mirroredSuccess = (params.stats.mirroredSuccess ?? 0) + mirroredInc;
        }
        for (const item of items) {
          if (item.originalUrl && !out.some((x) => x.originalUrl === item.originalUrl)) {
            out.push(item);
          }
        }
      }
      i = batchEnd;
      if (delay > 0 && i < slice.length) {
        await sleep(delay);
      }
    }

    return out;
  }

  /**
   * Legacy helper (jen seznam URL) – vrací původní URL bez watermarku.
   */
  async mirrorRealityListingImages(params: {
    urls: string[];
    propertyId: string;
    sourcePortalKey: string;
    delayMsBetweenFetches?: number;
  }): Promise<string[]> {
    const variants = await this.mirrorRealityListingImageVariants(params);
    return variants.map((v) => v.originalUrl);
  }
}
