import { BadRequestException, Injectable } from '@nestjs/common';
import sharp from 'sharp';

/** Vstupní upload — 20 MB. Výstup cílíme pod ~5 MB při zachování rozumné kvality. */
export const PROFILE_UPLOAD_MAX_BYTES = 20 * 1024 * 1024;
const TARGET_MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

@Injectable()
export class ProfileImagesService {
  assertImageMime(mimetype: string | undefined, originalname: string): void {
    const mt = (mimetype ?? '').toLowerCase().split(';')[0]!.trim();
    if (!ALLOWED_MIME.has(mt)) {
      throw new BadRequestException(
        'Nepodporovaný formát obrázku. Povolené typy: JPEG, PNG, WebP.',
      );
    }
    const lower = (originalname ?? '').toLowerCase();
    if (!/\.(jpe?g|png|webp)$/.test(lower)) {
      throw new BadRequestException(
        'Nepodporovaná přípona souboru. Použijte .jpg, .jpeg, .png nebo .webp.',
      );
    }
  }

  /**
   * Komprese a zmenšení pro avatar (~512 px, WebP, snižování kvality až pod TARGET_MAX_BYTES).
   * Kompresi provádí knihovna `sharp` (řetězení `.rotate().resize().webp()`).
   */
  async processAvatarWebp(input: Buffer): Promise<Buffer> {
    const pipeline = (q: number) =>
      sharp(input)
        .rotate()
        .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: q, effort: 4 });

    let quality = 88;
    let buf = await pipeline(quality).toBuffer();
    while (buf.length > TARGET_MAX_BYTES && quality >= 55) {
      quality -= 5;
      buf = await pipeline(quality).toBuffer();
    }
    if (buf.length > TARGET_MAX_BYTES) {
      buf = await sharp(input)
        .rotate()
        .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 70, effort: 4 })
        .toBuffer();
    }
    return buf;
  }

  /** Široký banner (~1920×640 cover), WebP s kompresí pod ~5 MB (`sharp`). */
  async processCoverWebp(input: Buffer): Promise<Buffer> {
    const pipeline = (q: number, h: number) =>
      sharp(input)
        .rotate()
        .resize(1920, h, { fit: 'cover', position: 'attention' })
        .webp({ quality: q, effort: 4 });

    let quality = 82;
    let buf = await pipeline(quality, 640).toBuffer();
    while (buf.length > TARGET_MAX_BYTES && quality >= 55) {
      quality -= 4;
      buf = await pipeline(quality, 600).toBuffer();
    }
    if (buf.length > TARGET_MAX_BYTES) {
      buf = await sharp(input)
        .rotate()
        .resize(1600, 520, { fit: 'cover', position: 'attention' })
        .webp({ quality: 68, effort: 4 })
        .toBuffer();
    }
    return buf;
  }
}
