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

  const publicUrl = result.secure_url;
  await assertPlayableMp4Url(publicUrl);
  return publicUrl;
}

async function assertPlayableMp4Url(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid video URL: ${url}`);
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`Video URL must be https: ${url}`);
  }
  if (!parsed.hostname.includes('cloudinary.com')) {
    throw new Error(`Video URL is not public Cloudinary URL: ${url}`);
  }

  let res: Response;
  try {
    // Range request verifies stream endpoint instead of HTML landing page.
    res = await fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-1' },
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    throw new Error(`Video URL is not reachable: ${String(error)}`);
  }

  if (!(res.ok || res.status === 206)) {
    throw new Error(`Video URL returned HTTP ${res.status}`);
  }

  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  if (!contentType.startsWith('video/mp4')) {
    throw new Error(
      `Invalid Content-Type for video stream: "${contentType || 'missing'}"`,
    );
  }

  const acceptRanges = (res.headers.get('accept-ranges') || '').toLowerCase();
  if (acceptRanges && acceptRanges !== 'bytes') {
    throw new Error(`Video URL does not support byte ranges: ${acceptRanges}`);
  }
}
