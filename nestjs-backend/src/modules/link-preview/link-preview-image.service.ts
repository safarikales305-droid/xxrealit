import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { v2 as cloudinary } from 'cloudinary';
import { resolveAssetBaseUrl } from '../../lib/image-url';
import { getUploadsPath } from '../../lib/uploads-path';
import { initCloudinary } from '../posts/cloudinary-upload';

const IMAGE_TIMEOUT_MS = 5_000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function isCloudinaryConfigured(): boolean {
  if (process.env.CLOUDINARY_URL?.trim()) return true;
  const name = process.env.CLOUDINARY_NAME ?? process.env.CLOUDINARY_CLOUD_NAME ?? '';
  const key = process.env.CLOUDINARY_KEY ?? process.env.CLOUDINARY_API_KEY ?? '';
  const secret = process.env.CLOUDINARY_SECRET ?? process.env.CLOUDINARY_API_SECRET ?? '';
  return Boolean(name && key && secret);
}

@Injectable()
export class LinkPreviewImageService {
  private readonly log = new Logger(LinkPreviewImageService.name);
  private placeholderUrl: string | null = null;

  async getPlaceholderUrl(): Promise<string> {
    if (this.placeholderUrl) return this.placeholderUrl;
    const dir = join(getUploadsPath(), 'link-previews');
    await mkdir(dir, { recursive: true });
    const filename = 'placeholder.jpg';
    const filePath = join(dir, filename);
    const jpeg = await sharp({
      create: {
        width: 1200,
        height: 630,
        channels: 3,
        background: { r: 226, g: 232, b: 240 },
      },
    })
      .jpeg({ quality: 80 })
      .toBuffer();
    await writeFile(filePath, jpeg);
    const base = resolveAssetBaseUrl() ?? 'http://localhost:8080';
    this.placeholderUrl = `${base.replace(/\/+$/, '')}/uploads/link-previews/${filename}`;
    return this.placeholderUrl;
  }

  async mirrorRemoteImage(remoteUrl: string, pageUrl: string): Promise<string> {
    try {
      const res = await fetch(remoteUrl, {
        redirect: 'follow',
        signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
        headers: {
          Accept: 'image/*',
          'User-Agent': 'XXrealitLinkPreview/1.0',
          Referer: pageUrl,
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > MAX_IMAGE_BYTES) throw new Error('Obrázek je příliš velký');
      const ct = (res.headers.get('content-type') ?? '').toLowerCase();
      if (!ct.startsWith('image/')) throw new Error('Neplatný content-type');

      if (isCloudinaryConfigured()) {
        initCloudinary();
        const hash = createHash('sha256').update(remoteUrl).digest('hex').slice(0, 16);
        const url = await new Promise<string>((resolve, reject) => {
          const upload = cloudinary.uploader.upload_stream(
            {
              folder: 'link-previews',
              public_id: hash,
              overwrite: true,
              resource_type: 'image',
            },
            (error, result) => {
              if (error) return reject(error);
              if (!result?.secure_url) return reject(new Error('Cloudinary upload failed'));
              resolve(result.secure_url);
            },
          );
          upload.end(buf);
        });
        return url;
      }

      const dir = join(getUploadsPath(), 'link-previews');
      await mkdir(dir, { recursive: true });
      const hash = createHash('sha256').update(remoteUrl).digest('hex').slice(0, 20);
      const filename = `${hash}.jpg`;
      const normalized = await sharp(buf)
        .rotate()
        .resize(1200, 630, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82 })
        .toBuffer();
      await writeFile(join(dir, filename), normalized);
      const base = resolveAssetBaseUrl() ?? 'http://localhost:8080';
      return `${base.replace(/\/+$/, '')}/uploads/link-previews/${filename}`;
    } catch (e) {
      this.log.warn(
        `Mirror obrázku selhal (${remoteUrl}): ${e instanceof Error ? e.message : String(e)}`,
      );
      return this.getPlaceholderUrl();
    }
  }
}
