import { BadRequestException } from '@nestjs/common';
import { extname } from 'node:path';

const PHONE_REQUIRED_MSG = 'Telefonní kontakt je povinný.';

/** Odstraní mezery; ponechá úvodní + a číslice. */
export function normalizeTiparPhone(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (hasPlus) return `+${digits}`.slice(0, 40);
  return digits.slice(0, 40);
}

export function requireTiparPhone(raw: string): string {
  const phone = normalizeTiparPhone(raw);
  const digitCount = phone.replace(/\D/g, '').length;
  if (!phone || digitCount < 9) {
    throw new BadRequestException(PHONE_REQUIRED_MSG);
  }
  return phone;
}

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

/** Sestaví finální galerii z existujících URL a nově nahraných souborů dle pořadí slotů. */
export async function resolveImageGalleryFromSlots(
  slotsJson: unknown,
  orderedNewFiles: Express.Multer.File[],
  upload: (file: Express.Multer.File) => Promise<string>,
): Promise<string[]> {
  let slots: string[] = [];
  if (typeof slotsJson === 'string' && slotsJson.trim()) {
    try {
      const parsed = JSON.parse(slotsJson) as unknown;
      if (Array.isArray(parsed)) {
        slots = parsed.filter((s): s is string => typeof s === 'string');
      }
    } catch {
      slots = [];
    }
  }
  if (slots.length === 0 && orderedNewFiles.length > 0) {
    const urls: string[] = [];
    for (const f of orderedNewFiles) {
      urls.push(await upload(f));
    }
    return urls;
  }
  const urls: string[] = [];
  let newIdx = 0;
  for (const slot of slots) {
    if (slot.startsWith('existing:')) {
      const url = slot.slice('existing:'.length).trim();
      if (url) urls.push(url);
    } else if (slot.startsWith('new:')) {
      const file = orderedNewFiles[newIdx];
      newIdx += 1;
      if (file) urls.push(await upload(file));
    }
  }
  while (newIdx < orderedNewFiles.length) {
    urls.push(await upload(orderedNewFiles[newIdx]));
    newIdx += 1;
  }
  return urls;
}
