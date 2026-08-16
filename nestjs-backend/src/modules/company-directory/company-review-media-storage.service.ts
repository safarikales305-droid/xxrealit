import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import { extname, join } from 'node:path';
import { getUploadsPath } from '../../lib/uploads-path';
import { uploadPostMedia } from '../posts/cloudinary-upload';
import { isProfileRemoteStorageConfigured } from '../upload/profile-media-storage.service';

export type StoredReviewMedia = {
  type: 'IMAGE' | 'VIDEO';
  url: string;
  thumbnailUrl?: string | null;
  mimeType: string;
};

@Injectable()
export class CompanyReviewMediaStorageService {
  private readonly log = new Logger(CompanyReviewMediaStorageService.name);

  async store(file: Express.Multer.File, publicOrigin: string): Promise<StoredReviewMedia> {
    if (isProfileRemoteStorageConfigured()) {
      try {
        const uploaded = await uploadPostMedia(file, { folder: 'company-reviews' });
        return {
          type: uploaded.kind === 'video' ? 'VIDEO' : 'IMAGE',
          url: uploaded.url,
          thumbnailUrl: uploaded.thumbnailUrl ?? null,
          mimeType: file.mimetype,
        };
      } catch (err) {
        this.log.warn(
          `Cloudinary review media upload failed, falling back to local disk: ${String(err)}`,
        );
      }
    }

    const isVideo = file.mimetype.startsWith('video/');
    const ext = extname(file.originalname || '') || (isVideo ? '.mp4' : '.jpg');
    const name = `${Date.now()}-${randomBytes(8).toString('hex')}${ext}`;
    const dir = join(getUploadsPath(), 'company-reviews');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(join(dir, name), file.buffer);

    const relative = `/uploads/company-reviews/${name}`;
    const origin = publicOrigin.replace(/\/+$/, '');
    const absolute = `${origin}${relative}`;

    return {
      type: isVideo ? 'VIDEO' : 'IMAGE',
      url: absolute,
      thumbnailUrl: isVideo ? null : absolute,
      mimeType: file.mimetype,
    };
  }
}
