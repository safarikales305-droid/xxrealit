import { v2 as cloudinary } from 'cloudinary';

function resolveCloudinaryConfig() {
  const cloudName =
    process.env.CLOUDINARY_NAME ?? process.env.CLOUDINARY_CLOUD_NAME ?? '';
  const apiKey =
    process.env.CLOUDINARY_KEY ?? process.env.CLOUDINARY_API_KEY ?? '';
  const apiSecret =
    process.env.CLOUDINARY_SECRET ?? process.env.CLOUDINARY_API_SECRET ?? '';

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      'Missing Cloudinary env vars. Set CLOUDINARY_NAME/CLOUDINARY_KEY/CLOUDINARY_SECRET.',
    );
  }
  return { cloudName, apiKey, apiSecret };
}

export async function uploadToCloudinary(filePath: string): Promise<string> {
  const { cloudName, apiKey, apiSecret } = resolveCloudinaryConfig();

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
  });

  const result = await cloudinary.uploader.upload(filePath, {
    resource_type: 'video',
    folder: 'videos',
    format: 'mp4',
  });

  if (!result.secure_url) {
    throw new Error('Cloudinary upload did not return secure_url');
  }

  return result.secure_url;
}
