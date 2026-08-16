import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { uploadPostMedia } from '../posts/cloudinary-upload';
import {
  isAllowedPostMediaMime,
  logPostUploadRejection,
  userFacingUploadError,
} from '../posts/post-media-upload.util';
import { COMPANY_REVIEW_MEDIA_ENABLED } from './company-directory.constants';

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
  @Post('public/reviews/media')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_VIDEO_BYTES },
      fileFilter: reviewMediaFilter,
    }),
  )
  async uploadReviewMedia(@UploadedFile() file: Express.Multer.File) {
    if (!COMPANY_REVIEW_MEDIA_ENABLED) {
      throw new BadRequestException('Nahrávání médií k recenzím je vypnuté.');
    }
    if (!file) {
      throw new BadRequestException('Soubor nebyl nahrán.');
    }

    try {
      const uploaded = await uploadPostMedia(file);
      return {
        type: uploaded.kind === 'video' ? 'VIDEO' : 'IMAGE',
        url: uploaded.url,
        thumbnailUrl: uploaded.thumbnailUrl ?? null,
        mimeType: file.mimetype,
        fileName: file.originalname,
        fileSize: file.size,
      };
    } catch (err) {
      const kind = file.mimetype.startsWith('video/') ? 'video' : 'image';
      throw new BadRequestException(userFacingUploadError(err, kind));
    }
  }
}
