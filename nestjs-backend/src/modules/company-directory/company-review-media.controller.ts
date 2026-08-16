import {
  BadRequestException,
  Controller,
  Logger,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Request } from 'express';
import {
  isAllowedPostMediaMime,
  logPostUploadRejection,
  userFacingUploadError,
} from '../posts/post-media-upload.util';
import { COMPANY_REVIEW_MEDIA_ENABLED } from './company-directory.constants';
import { CompanyReviewMediaStorageService } from './company-review-media-storage.service';

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_VIDEO_BYTES = 300 * 1024 * 1024;

const reviewMediaFilter = (
  _req: Express.Request,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void,
) => {
  if (!isAllowedPostMediaMime(file.mimetype)) {
    logPostUploadRejection(file, `review_unsupported_mime:${file.mimetype}`);
    cb(new Error('Nepodporovaný typ souboru.'), false);
    return;
  }
  const isVideo = file.mimetype.startsWith('video/');
  const max = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (file.size > max) {
    logPostUploadRejection(file, 'review_too_large');
    cb(new Error('Soubor je příliš velký.'), false);
    return;
  }
  cb(null, true);
};

@Controller('company-directory')
export class CompanyReviewMediaController {
  private readonly log = new Logger(CompanyReviewMediaController.name);

  constructor(private readonly storage: CompanyReviewMediaStorageService) {}

  private resolvePublicOrigin(req: Request): string {
    const forwardedProto = String(req.headers['x-forwarded-proto'] ?? '').split(',')[0]?.trim();
    const forwardedHost = String(req.headers['x-forwarded-host'] ?? '').split(',')[0]?.trim();
    const host = forwardedHost || req.get('host') || '';
    const proto = forwardedProto || req.protocol || 'https';
    if (host) return `${proto}://${host}`;

    const fallback =
      process.env.PUBLIC_APP_URL?.trim() ||
      process.env.NEXT_PUBLIC_API_URL?.trim() ||
      process.env.FRONTEND_URL?.trim() ||
      '';
    return fallback.replace(/\/+$/, '').replace(/\/api$/i, '');
  }

  @Post('public/reviews/media')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_VIDEO_BYTES },
      fileFilter: reviewMediaFilter,
    }),
  )
  async uploadReviewMedia(@UploadedFile() file: Express.Multer.File, @Req() req: Request) {
    if (!COMPANY_REVIEW_MEDIA_ENABLED) {
      throw new BadRequestException('Nahrávání médií k recenzím je vypnuté.');
    }
    if (!file) {
      throw new BadRequestException('Soubor nebyl nahrán.');
    }

    try {
      const stored = await this.storage.store(file, this.resolvePublicOrigin(req));
      this.log.log(
        JSON.stringify({
          event: 'REVIEW_MEDIA_UPLOADED',
          type: stored.type,
          mimeType: stored.mimeType,
          urlHost: (() => {
            try {
              return new URL(stored.url).host;
            } catch {
              return 'relative';
            }
          })(),
        }),
      );
      return {
        type: stored.type,
        url: stored.url,
        thumbnailUrl: stored.thumbnailUrl ?? null,
        mimeType: stored.mimeType,
        fileName: file.originalname,
        fileSize: file.size,
      };
    } catch (err) {
      const kind = file.mimetype.startsWith('video/') ? 'video' : 'image';
      this.log.warn(`Review media upload failed: ${String(err)}`);
      throw new BadRequestException(userFacingUploadError(err, kind));
    }
  }
}
