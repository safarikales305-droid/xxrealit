import { Injectable } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { initCloudinary, isCloudinaryConfigured } from '../posts/cloudinary-upload';

export type StoredVisualizationAsset = {
  publicId: string;
  secureUrl: string;
};

@Injectable()
export class AiVisualizationStorageService {
  private ensureCloudinary() {
    if (!isCloudinaryConfigured()) {
      throw new Error('Cloudinary není nakonfigurováno.');
    }
    initCloudinary();
  }

  async uploadOriginal(previewJpeg: Buffer): Promise<StoredVisualizationAsset> {
    this.ensureCloudinary();
    return this.uploadBuffer(previewJpeg, 'ai-visualization/originals', 'jpg');
  }

  async uploadResult(pngOrJpeg: Buffer, ext: 'png' | 'jpg'): Promise<StoredVisualizationAsset> {
    this.ensureCloudinary();
    return this.uploadBuffer(pngOrJpeg, 'ai-visualization/results', ext);
  }

  private uploadBuffer(buffer: Buffer, folder: string, ext: string): Promise<StoredVisualizationAsset> {
    return new Promise((resolve, reject) => {
      const upload = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'image',
          format: ext,
          quality: 'auto:good',
        },
        (error, result) => {
          if (error || !result?.public_id || !result.secure_url) {
            reject(error ?? new Error('Cloudinary upload failed'));
            return;
          }
          resolve({ publicId: result.public_id, secureUrl: result.secure_url });
        },
      );
      upload.end(buffer);
    });
  }

  async downloadBuffer(publicId: string): Promise<Buffer> {
    this.ensureCloudinary();
    const url = cloudinary.url(publicId, { secure: true, resource_type: 'image' });
    const res = await fetch(url);
    if (!res.ok) throw new Error('Asset download failed');
    return Buffer.from(await res.arrayBuffer());
  }

  signedDownloadUrl(publicId: string, ttlSec = 120): string {
    this.ensureCloudinary();
    return cloudinary.url(publicId, {
      secure: true,
      resource_type: 'image',
      sign_url: true,
      type: 'authenticated',
      expires_at: Math.floor(Date.now() / 1000) + ttlSec,
    });
  }

  isConfigured(): boolean {
    return isCloudinaryConfigured();
  }
}
