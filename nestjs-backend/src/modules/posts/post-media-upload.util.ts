import { Logger } from '@nestjs/common';

const log = new Logger('PostMediaUpload');

const ALLOWED_VIDEO_MIME = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-msvideo',
  'video/mpeg',
]);

export function isAllowedPostVideoMime(mime: string): boolean {
  const m = (mime || '').toLowerCase();
  if (ALLOWED_VIDEO_MIME.has(m)) return true;
  return m.startsWith('video/');
}

export function isAllowedPostImageMime(mime: string): boolean {
  return (mime || '').toLowerCase().startsWith('image/');
}

export function isAllowedPostMediaMime(mime: string): boolean {
  return isAllowedPostVideoMime(mime) || isAllowedPostImageMime(mime);
}

export function logPostUploadRejection(
  file: Express.Multer.File | undefined,
  reason: string,
): void {
  log.warn(
    `[post-upload] rejected mimetype=${file?.mimetype ?? '(none)'} size=${file?.size ?? 0} name=${JSON.stringify(file?.originalname ?? '')} reason=${reason}`,
  );
}

export function userFacingUploadError(err: unknown, kind: 'video' | 'image' | 'media'): string {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();
  if (lower.includes('cloudinary') || lower.includes('eager')) {
    return kind === 'video'
      ? 'Video se nepodařilo zpracovat. Zkuste kratší soubor (max. 120 s) ve formátu MP4, MOV nebo WebM.'
      : 'Obrázek se nepodařilo nahrát. Zkuste JPG nebo PNG.';
  }
  if (lower.includes('unsupported') || lower.includes('mime')) {
    return 'Nepodporovaný formát souboru. Video: MP4, MOV, WebM. Obrázek: JPG, PNG, WebP.';
  }
  if (lower.includes('too large') || lower.includes('max')) {
    return 'Soubor je příliš velký (max. 300 MB před kompresí).';
  }
  return kind === 'video'
    ? 'Nahrání videa selhalo. Zkuste jiný formát nebo kratší záznam.'
    : 'Nahrání média selhalo. Zkuste to prosím znovu.';
}
