import { Injectable } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { initCloudinary } from '../posts/cloudinary-upload';

function uploadPropertyVideoBuffer(file: Express.Multer.File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    if (!file.buffer?.length) {
      return reject(new Error('Video buffer is empty'));
    }
    const upload = cloudinary.uploader.upload_stream(
      {
        resource_type: 'video',
        folder: 'properties',
        eager: [
          [
            { duration: '120' },
            { quality: 'auto:low' },
            { fetch_format: 'mp4' },
            { bit_rate: '800k' },
          ],
        ],
        eager_async: false,
      },
      (error, result) => {
        if (error) {
          return reject(error);
        }
        if (!result) {
          return reject(new Error('Empty Cloudinary result'));
        }
        const eagerUrl = result.eager?.[0]?.secure_url;
        if (!eagerUrl) {
          return reject(
            new Error('Cloudinary nepodařilo zpracovat video (eager transformace).'),
          );
        }
        return resolve(eagerUrl);
      },
    );

    upload.end(file.buffer);
  });
}

function uploadPropertyImageBuffer(file: Express.Multer.File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    if (!file.buffer?.length) {
      return reject(new Error('Image buffer is empty'));
    }
    const upload = cloudinary.uploader.upload_stream(
      {
        resource_type: 'auto',
        folder: 'properties',
        quality: 'auto:low',
        fetch_format: 'auto',
      },
      (error, result) => {
        if (error) {
          return reject(error);
        }
        if (!result?.secure_url) {
          return reject(new Error('Empty Cloudinary image result'));
        }
        return resolve(result.secure_url);
      },
    );

    upload.end(file.buffer);
  });
}

@Injectable()
export class PropertyMediaCloudinaryService {
  async uploadImage(file: Express.Multer.File): Promise<string> {
    initCloudinary();
    return uploadPropertyImageBuffer(file);
  }

  async uploadVideo(file: Express.Multer.File): Promise<string> {
    initCloudinary();
    return uploadPropertyVideoBuffer(file);
  }

  /** Nahraje hotové MP4 (např. vygenerované shorts) stejným pipeline jako uživatelské video. */
  async uploadVideoBuffer(buffer: Buffer, originalname = 'shorts.mp4'): Promise<string> {
    initCloudinary();
    const file = {
      fieldname: 'video',
      originalname,
      encoding: '7bit',
      mimetype: 'video/mp4',
      buffer,
      size: buffer.length,
    } as Express.Multer.File;
    return uploadPropertyVideoBuffer(file);
  }

  /**
   * Stejná cesta jako upload z formuláře (`folder: properties`), vhodné pro import z externí URL.
   */
  async uploadImageBuffer(buffer: Buffer, originalname = 'import.jpg'): Promise<string> {
    initCloudinary();
    const ext = (originalname.split('.').pop() ?? 'jpg').toLowerCase();
    const mime =
      ext === 'png'
        ? 'image/png'
        : ext === 'webp'
          ? 'image/webp'
          : ext === 'gif'
            ? 'image/gif'
            : 'image/jpeg';
    const file = {
      fieldname: 'image',
      originalname: originalname || 'import.jpg',
      encoding: '7bit',
      mimetype: mime,
      buffer,
      size: buffer.length,
    } as Express.Multer.File;
    return uploadPropertyImageBuffer(file);
  }

  /**
   * Hudba pro shorts (mp3/wav/m4a) — Cloudinary ukládá audio často jako `resource_type: video`.
   * Vracíme veřejnou URL + public_id pro případné smazání.
   */
  async uploadShortsMusicBuffer(
    buffer: Buffer,
    originalname: string,
    mimetype: string,
  ): Promise<{ url: string; publicId: string }> {
    initCloudinary();
    return new Promise((resolve, reject) => {
      if (!buffer?.length) {
        return reject(new Error('Audio buffer is empty'));
      }
      const upload = cloudinary.uploader.upload_stream(
        {
          resource_type: 'video',
          folder: 'shorts-music',
          use_filename: false,
          unique_filename: true,
        },
        (error, result) => {
          if (error) {
            return reject(error);
          }
          if (!result?.secure_url || !result.public_id) {
            return reject(new Error('Empty Cloudinary shorts-music result'));
          }
          return resolve({ url: result.secure_url, publicId: result.public_id });
        },
      );
      const file = {
        fieldname: 'audio',
        originalname,
        encoding: '7bit' as const,
        mimetype,
        buffer,
        size: buffer.length,
      } as Express.Multer.File;
      upload.end(file.buffer);
    });
  }

  async destroyByPublicId(publicId: string): Promise<void> {
    initCloudinary();
    await new Promise<void>((resolve, reject) => {
      cloudinary.uploader.destroy(publicId, { resource_type: 'video' }, (err, res) => {
        if (err) return reject(err);
        const r = res?.result;
        if (r !== 'ok' && r !== 'not found') {
          return reject(new Error(`Cloudinary destroy: ${String(r ?? 'unknown')}`));
        }
        resolve();
      });
    });
  }
}
