import { BadRequestException } from '@nestjs/common';
import sharp from '../../lib/sharp-instance';

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/avif',
]);

export type ProcessedUploadImage = {
  pngBuffer: Buffer;
  previewJpegBuffer: Buffer;
  width: number;
  height: number;
  mime: string;
};

export async function processUploadImage(
  buffer: Buffer,
  mime: string,
  maxBytes: number,
): Promise<ProcessedUploadImage> {
  if (!buffer?.length) {
    throw new BadRequestException('Soubor je prázdný.');
  }
  if (buffer.length > maxBytes) {
    throw new BadRequestException('Fotografie je příliš velká.');
  }

  const normalizedMime = mime.split(';')[0]?.trim().toLowerCase() ?? '';
  if (!ALLOWED_MIME.has(normalizedMime)) {
    throw new BadRequestException('Nepodporovaný formát fotografie.');
  }

  let pipeline = sharp(buffer, { failOn: 'none' }).rotate();
  const meta = await pipeline.metadata();
  if (!meta.width || !meta.height) {
    throw new BadRequestException('Soubor není platný obrázek.');
  }

  const maxEdge = 2048;
  if (meta.width > maxEdge || meta.height > maxEdge) {
    pipeline = pipeline.resize({
      width: maxEdge,
      height: maxEdge,
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  const pngBuffer = await pipeline.clone().png({ compressionLevel: 8 }).toBuffer();
  const previewJpegBuffer = await pipeline
    .clone()
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();

  const outMeta = await sharp(pngBuffer).metadata();

  return {
    pngBuffer,
    previewJpegBuffer,
    width: outMeta.width ?? meta.width,
    height: outMeta.height ?? meta.height,
    mime: 'image/png',
  };
}
