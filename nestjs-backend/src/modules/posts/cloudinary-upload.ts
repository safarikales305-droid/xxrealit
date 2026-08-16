import { v2 as cloudinary } from 'cloudinary';

export function initCloudinary() {
  const raw = process.env.CLOUDINARY_URL?.trim();

  if (raw?.startsWith('cloudinary://')) {
    const rest = raw.slice('cloudinary://'.length);
    const at = rest.lastIndexOf('@');
    if (at < 0) {
      throw new Error('CLOUDINARY_URL invalid');
    }
    const cloud_name = rest.slice(at + 1);
    const pair = rest.slice(0, at);
    const colon = pair.indexOf(':');
    if (colon < 0) {
      throw new Error('CLOUDINARY_URL invalid');
    }
    const api_key = pair.slice(0, colon);
    const api_secret = pair.slice(colon + 1);
    cloudinary.config({
      cloud_name,
      api_key,
      api_secret,
      secure: true,
    });
    return;
  }

  const cloudName =
    process.env.CLOUDINARY_NAME ?? process.env.CLOUDINARY_CLOUD_NAME ?? '';
  const apiKey =
    process.env.CLOUDINARY_KEY ?? process.env.CLOUDINARY_API_KEY ?? '';
  const apiSecret =
    process.env.CLOUDINARY_SECRET ?? process.env.CLOUDINARY_API_SECRET ?? '';
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      'Nastavte CLOUDINARY_URL nebo CLOUDINARY_NAME + CLOUDINARY_KEY + CLOUDINARY_SECRET.',
    );
  }
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });
}

function uploadVideoBuffer(
  file: Express.Multer.File,
  folder: string,
): Promise<{ url: string; thumbnailUrl: string }> {
  return new Promise((resolve, reject) => {
    const upload = cloudinary.uploader.upload_stream(
      {
        resource_type: 'video',
        folder,
        access_mode: 'public',
        type: 'upload',
        eager: [
          [
            { duration: '120' },
            { quality: 'auto:low' },
            { fetch_format: 'mp4' },
            { bit_rate: '800k' },
          ],
          [{ format: 'jpg' }, { width: 720, crop: 'limit' }],
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
        const thumbnailUrl =
          result.eager?.[1]?.secure_url ??
          result.secure_url?.replace(/\.[^.]+$/, '.jpg') ??
          eagerUrl;
        return resolve({ url: eagerUrl, thumbnailUrl });
      },
    );

    upload.end(file.buffer);
  });
}

function uploadImageBuffer(file: Express.Multer.File, folder: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const upload = cloudinary.uploader.upload_stream(
      {
        resource_type: 'auto',
        folder,
        access_mode: 'public',
        type: 'upload',
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

export type UploadedMedia = {
  url: string;
  kind: 'video' | 'image';
  thumbnailUrl?: string;
};

/**
 * Upload video (transcoded eager, max 120s, compressed + JPG thumbnail) or image.
 */
export async function uploadPostMedia(
  file: Express.Multer.File,
  opts?: { folder?: string },
): Promise<UploadedMedia> {
  initCloudinary();
  const folder = opts?.folder ?? 'posts';

  if (file.mimetype.startsWith('video/')) {
    const { url, thumbnailUrl } = await uploadVideoBuffer(file, folder);
    return { url, kind: 'video', thumbnailUrl };
  }

  if (file.mimetype.startsWith('image/')) {
    const url = await uploadImageBuffer(file, folder);
    return { url, kind: 'image' };
  }

  throw new Error(`Unsupported media type: ${file.mimetype}`);
}
