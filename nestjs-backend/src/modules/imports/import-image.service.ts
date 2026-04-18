import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { getUploadsPath } from '../../lib/uploads-path';
import { PropertyMediaCloudinaryService } from '../properties/property-media-cloudinary.service';
import { ProfileImagesService } from '../upload/profile-images.service';
import { isProfileRemoteStorageConfigured } from '../upload/profile-media-storage.service';
import { normalizeStoredImageUrl } from './import-image-urls';

const MAX_DOWNLOAD_BYTES = 15 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 45_000;
const DEFAULT_DELAY_MS = 120;
const MAX_IMAGES_PER_LISTING = 24;

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
  return h === 'reality.cz' || h.endsWith('.reality.cz');
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
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
      let res: Response;
      try {
        res = await fetch(originalUrl, {
          redirect: 'follow',
          signal: ctrl.signal,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (compatible; XXRealitImport/1.0; +https://www.xxrealit.cz)',
            Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
          },
        });
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) {
        this.log.warn(`[import-image] HTTP ${res.status} ${originalUrl.slice(0, 120)}`);
        return null;
      }
      const cl = res.headers.get('content-length');
      if (cl && Number(cl) > MAX_DOWNLOAD_BYTES) {
        this.log.warn(`[import-image] content-length too large url=${originalUrl.slice(0, 80)}`);
        return null;
      }
      const arr = new Uint8Array(await res.arrayBuffer());
      if (arr.byteLength > MAX_DOWNLOAD_BYTES) {
        this.log.warn(`[import-image] body too large bytes=${arr.byteLength}`);
        return null;
      }
      buffer = Buffer.from(arr);
      contentType = res.headers.get('content-type');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(`[import-image] fetch failed ${originalUrl.slice(0, 100)}: ${msg}`);
      return null;
    }

    const originalnameGuess = `import-${params.sourcePortalKey}-${params.index}.${extFromMimeOrUrl(contentType, originalUrl)}`;

    let meta: { format?: string };
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

    const ext = extFromMimeOrUrl(contentType, originalUrl, meta.format);
    const base = `${safeFileBasePart(params.sourcePortalKey)}-${safeFileBasePart(params.propertyId)}-${params.index}-${Date.now()}`;

    let storedUrl: string;
    if (isProfileRemoteStorageConfigured()) {
      try {
        const name = `${base}.${ext}`;
        storedUrl = await this.propertyMediaCloudinary.uploadImageBuffer(buffer, name);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.log.error(`[import-image] cloudinary upload failed: ${msg}`);
        return null;
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
      return { originalUrl, storedUrl };
    }
    return { originalUrl, storedUrl: normalizedOut ?? storedUrl };
  }

  /**
   * Pro každou URL: Reality.cz (a subdomény) zrcadlíme k našemu storage, ostatní necháme beze změny.
   */
  async mirrorRealityListingImages(params: {
    urls: string[];
    propertyId: string;
    sourcePortalKey: string;
    delayMsBetweenFetches?: number;
  }): Promise<string[]> {
    const delay = params.delayMsBetweenFetches ?? DEFAULT_DELAY_MS;
    const slice = params.urls.slice(0, MAX_IMAGES_PER_LISTING);
    const out: string[] = [];

    for (let i = 0; i < slice.length; i += 1) {
      const raw = slice[i]!;
      const normalized = normalizeStoredImageUrl(raw);
      if (!normalized) continue;

      if (!shouldMirrorRealityImportedImageUrl(normalized)) {
        out.push(normalized);
        continue;
      }

      const done = await this.importExternalImageToPortal({
        imageUrl: normalized,
        propertyId: params.propertyId,
        sourcePortalKey: params.sourcePortalKey,
        index: i,
      });
      if (done?.storedUrl) {
        const u = normalizeStoredImageUrl(done.storedUrl) ?? done.storedUrl;
        if (u && !out.includes(u)) out.push(u);
      }
      if (delay > 0 && i < slice.length - 1) {
        await sleep(delay);
      }
    }

    return out;
  }
}
