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
}
