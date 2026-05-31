import { BadRequestException } from '@nestjs/common';
import { extname } from 'node:path';

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const VIDEO_EXT = new Set(['.mp4', '.mov', '.webm', '.m4v', '.avi', '.mkv']);

export function assertTiparImageFile(file: Express.Multer.File): void {
  const ext = extname(file.originalname || '').toLowerCase();
  if (!IMAGE_EXT.has(ext)) {
    throw new BadRequestException('Nepovolený formát obrázku');
  }
}

export function assertTiparVideoFile(file: Express.Multer.File): void {
  const ext = extname(file.originalname || '').toLowerCase();
  if (!VIDEO_EXT.has(ext)) {
    throw new BadRequestException('Nepovolený formát videa');
  }
}

export function orderUploadedImages(
  imageFiles: Express.Multer.File[],
  imageOrderRaw: unknown,
): Express.Multer.File[] {
  const orderValues = Array.isArray(imageOrderRaw)
    ? imageOrderRaw.filter((x): x is string => typeof x === 'string')
    : typeof imageOrderRaw === 'string'
      ? [imageOrderRaw]
      : [];

  const numericOrder =
    orderValues.length === imageFiles.length &&
    orderValues.every((v) => /^\d+$/.test(String(v).trim()));

  if (numericOrder) {
    return imageFiles
      .map((f, i) => ({
        f,
        order: parseInt(String(orderValues[i]).trim(), 10),
      }))
      .sort((a, b) => a.order - b.order)
      .map((x) => x.f);
  }

  if (orderValues.length > 0) {
    return [...imageFiles].sort((a, b) => {
      const aKey = `${a.originalname}::${a.size}`;
      const bKey = `${b.originalname}::${b.size}`;
      const ai = orderValues.indexOf(aKey);
      const bi = orderValues.indexOf(bKey);
      return (
        (ai === -1 ? Number.MAX_SAFE_INTEGER : ai) -
        (bi === -1 ? Number.MAX_SAFE_INTEGER : bi)
      );
    });
  }

  return imageFiles;
}

export function parseMultipartBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v !== 'string') return false;
  const s = v.trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'on' || s === 'yes';
}

export function parseMultipartInt(v: unknown): number | undefined {
  if (typeof v !== 'string') return undefined;
  const n = Number.parseInt(v.replace(/\s/g, ''), 10);
  return Number.isFinite(n) ? n : undefined;
}

export function parseMultipartStr(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

export function galleryMainImage(images: string[]): string | null {
  const first = images.find((u) => typeof u === 'string' && u.trim().length > 0);
  return first?.trim() ?? null;
}
