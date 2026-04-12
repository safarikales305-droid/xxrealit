import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { Metadata, Sharp, SharpOptions } from 'sharp';
import { extname } from 'node:path';

/**
 * Sharp je CJS `export =`. `import sharp from 'sharp'` se po buildu často přeloží na
 * `require('sharp').default`, které u sharp není funkce → runtime "(0, sharp_1.default) is not a function".
 * `import = require` emituje přímé `require('sharp')` a funguje v Nest buildu.
 */
import sharp = require('sharp');

/** Vstupní upload — 20 MB. Výstup cílíme pod ~5 MB. */
export const PROFILE_UPLOAD_MAX_BYTES = 20 * 1024 * 1024;
const TARGET_MAX_BYTES = 5 * 1024 * 1024;

const AVATAR_PX = 768;
const AVATAR_FALLBACK_PX = 512;

/** MIME z hlavičky multipart — často `application/octet-stream` nebo prázdné. */
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/pjpeg',
  'image/png',
  'image/x-png',
  'image/webp',
  'application/octet-stream',
]);

const RASTER_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif', 'tiff']);

function normalizeMime(mimetype: string | undefined): string {
  return (mimetype ?? '').toLowerCase().split(';')[0]!.trim();
}

function extLooksLikeImage(name: string | undefined): boolean {
  const e = extname(name ?? '').toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.webp'].includes(e);
}

@Injectable()
export class ProfileImagesService {
  private readonly log = new Logger(ProfileImagesService.name);

  /**
   * Sharp pipeline: `failOn: 'none'`, první snímek u GIF, EXIF auto-rotate.
   */
  private sharpRasterFromBuffer(buffer: Buffer, meta: Metadata): Sharp {
    const usePages =
      meta.format === 'gif' || (meta.format === 'tiff' && (meta.pages ?? 0) > 1);
    const opts: SharpOptions = { failOn: 'none' };
    if (usePages) {
      (opts as SharpOptions & { pages?: number }).pages = 1;
    }
    return sharp(buffer, opts).rotate();
  }

  /**
   * Načte metadata, loguje MIME / velikost / rozměry; nevyžaduje příponu souboru (blob, prázdné jméno).
   */
  async validateRasterInput(
    buffer: Buffer,
    mimetype: string | undefined,
    originalname: string | undefined,
  ): Promise<Metadata> {
    const mt = normalizeMime(mimetype);
    const bytes = buffer?.length ?? 0;
    this.log.log(
      `[profile] validate mimetype="${mt}" originalname=${JSON.stringify(originalname)} bytes=${bytes}`,
    );

    if (!bytes) {
      throw new BadRequestException('Soubor je prázdný.');
    }

    let meta: Metadata;
    try {
      meta = await sharp(buffer, { failOn: 'none' }).metadata();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.error(`[profile] sharp.metadata() threw: ${msg}`, err instanceof Error ? err.stack : undefined);
      throw new BadRequestException(`Obrázek nelze načíst: ${msg}`);
    }

    const fmt = meta.format?.toLowerCase();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    this.log.log(
      `[profile] metadata format=${fmt ?? '?'} width=${w} height=${h} space=${meta.space ?? '?'} orientation=${meta.orientation ?? 'n/a'} channels=${meta.channels ?? '?'}`,
    );

    if (!w || !h) {
      this.log.warn(`[profile] reject: missing dimensions width=${w} height=${h}`);
      throw new BadRequestException(
        'Soubor neobsahuje platný obrázek (chybí rozměry). Zkuste jiný soubor.',
      );
    }

    if (fmt === 'svg') {
      this.log.warn('[profile] reject: SVG not supported for profile raster');
      throw new BadRequestException('Formát SVG zde nepodporujeme. Nahrajte JPG, PNG nebo WebP.');
    }

    if (fmt && RASTER_FORMATS.has(fmt)) {
      return meta;
    }

    const mimeOk =
      ALLOWED_MIME.has(mt) || mt.startsWith('image/') || extLooksLikeImage(originalname);
    if (mimeOk) {
      this.log.warn(
        `[profile] accept by MIME/filename despite unusual format=${fmt ?? 'undefined'}`,
      );
      return meta;
    }

    this.log.warn(
      `[profile] reject: format=${fmt} mimetype=${mt} name=${JSON.stringify(originalname)}`,
    );
    throw new BadRequestException(
      'Nepodporovaný formát. Nahrajte prosím JPG, PNG nebo WebP.',
    );
  }

  async processAvatarForUpload(buffer: Buffer): Promise<{ buffer: Buffer; ext: string }> {
    const meta = await sharp(buffer, { failOn: 'none' }).metadata();
    const base = this.sharpRasterFromBuffer(buffer, meta);

    const mkWebp = (px: number, q: number) =>
      base
        .clone()
        .resize(px, px, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: q, effort: 2 });

    try {
      let quality = 88;
      let buf = await mkWebp(AVATAR_PX, quality).toBuffer();
      while (buf.length > TARGET_MAX_BYTES && quality >= 55) {
        quality -= 6;
        buf = await mkWebp(AVATAR_PX, quality).toBuffer();
      }
      if (buf.length > TARGET_MAX_BYTES) {
        buf = await mkWebp(AVATAR_FALLBACK_PX, 78).toBuffer();
      }
      this.log.log(`[profile] avatar out webp bytes=${buf.length}`);
      return { buffer: buf, ext: '.webp' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.warn(`[profile] avatar webp failed (${msg}), JPEG fallback`);
      try {
        const buf = await this.sharpRasterFromBuffer(buffer, meta)
          .resize(AVATAR_PX, AVATAR_PX, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 85, mozjpeg: true })
          .toBuffer();
        this.log.log(`[profile] avatar out jpeg bytes=${buf.length}`);
        return { buffer: buf, ext: '.jpg' };
      } catch (err2) {
        const msg2 = err2 instanceof Error ? err2.message : String(err2);
        this.log.error(
          `[profile] avatar jpeg fallback failed: ${msg2}`,
          err2 instanceof Error ? err2.stack : undefined,
        );
        throw new BadRequestException(`Obrázek se nepodařilo zpracovat: ${msg2}`);
      }
    }
  }

  async processCoverForUpload(buffer: Buffer): Promise<{ buffer: Buffer; ext: string }> {
    const meta = await sharp(buffer, { failOn: 'none' }).metadata();
    const base = this.sharpRasterFromBuffer(buffer, meta);

    const mkWebp = (w: number, h: number, q: number) =>
      base.clone().resize(w, h, { fit: 'cover', position: 'centre' }).webp({ quality: q, effort: 2 });

    try {
      let quality = 82;
      let buf = await mkWebp(1920, 640, quality).toBuffer();
      while (buf.length > TARGET_MAX_BYTES && quality >= 55) {
        quality -= 4;
        buf = await mkWebp(1920, 600, quality).toBuffer();
      }
      if (buf.length > TARGET_MAX_BYTES) {
        buf = await mkWebp(1600, 520, 70).toBuffer();
      }
      this.log.log(`[profile] cover out webp bytes=${buf.length}`);
      return { buffer: buf, ext: '.webp' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.warn(`[profile] cover webp failed (${msg}), JPEG fallback`);
      try {
        const buf = await this.sharpRasterFromBuffer(buffer, meta)
          .resize(1920, 640, { fit: 'cover', position: 'centre' })
          .jpeg({ quality: 82, mozjpeg: true })
          .toBuffer();
        this.log.log(`[profile] cover out jpeg bytes=${buf.length}`);
        return { buffer: buf, ext: '.jpg' };
      } catch (err2) {
        const msg2 = err2 instanceof Error ? err2.message : String(err2);
        this.log.error(
          `[profile] cover jpeg fallback failed: ${msg2}`,
          err2 instanceof Error ? err2.stack : undefined,
        );
        throw new BadRequestException(`Cover se nepodařilo zpracovat: ${msg2}`);
      }
    }
  }
}
