import { v2 as cloudinary } from 'cloudinary';

export function initCloudinary() {
  const url = process.env.CLOUDINARY_URL;
  if (!url) {
    throw new Error('CLOUDINARY_URL missing');
  }
  const cloudName = url.split('@')[1] ?? '';
  const apiKey = url.split('//')[1]?.split(':')[0] ?? '';
  const apiSecret = url.split(':')[2]?.split('@')[0] ?? '';
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('CLOUDINARY_URL invalid');
  }
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
  });
}

export async function uploadVideo(file: Express.Multer.File): Promise<string | null> {
  try {
    initCloudinary();
    return await new Promise<string>((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            resource_type: 'video',
            folder: 'posts',
          },
          (error, result) => {
            if (error) return reject(error);
            if (!result?.secure_url) return reject(new Error('Missing secure_url'));
            resolve(result.secure_url);
          },
        )
        .end(file.buffer);
    });
  } catch (e) {
    console.error('UPLOAD ERROR:', e);
    return null;
  }
}
