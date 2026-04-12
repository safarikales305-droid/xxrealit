import { Injectable, Logger } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { initCloudinary } from '../posts/cloudinary-upload';

/**
 * Perzistentní úložiště profilových obrázků.
 *
 * **Produkce (Railway atd.):** nastavte `CLOUDINARY_URL` nebo trojici
 * `CLOUDINARY_NAME` + `CLOUDINARY_KEY` + `CLOUDINARY_SECRET` — obrázky jdou na Cloudinary
 * a v DB zůstane stabilní `https://…` URL.
 *
 * **Lokální vývoj bez Cloudinary:** použije se zápis do `uploads/` (viz `UploadController`)
 * — soubory jsou jen na disku kontejneru; vhodné jen pro dev.
 *
 * **Budoucí rozšíření:** nahraďte tělo `uploadProfileRaster` vlastním adapterem (S3,
 * Supabase Storage, …) a ponechte stejné veřejné API služby.
 */
export function isProfileRemoteStorageConfigured(): boolean {
  const raw = process.env.CLOUDINARY_URL?.trim();
  if (raw?.startsWith('cloudinary://')) {
    return true;
  }
  const cloudName =
    process.env.CLOUDINARY_NAME?.trim() ||
    process.env.CLOUDINARY_CLOUD_NAME?.trim() ||
    '';
  const apiKey =
    process.env.CLOUDINARY_KEY?.trim() ||
    process.env.CLOUDINARY_API_KEY?.trim() ||
    '';
  const apiSecret =
    process.env.CLOUDINARY_SECRET?.trim() ||
    process.env.CLOUDINARY_API_SECRET?.trim() ||
    '';
  return Boolean(cloudName && apiKey && apiSecret);
}

function uploadProfileRaster(
  buffer: Buffer,
  folder: string,
  publicIdSuffix: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    initCloudinary();
    const upload = cloudinary.uploader.upload_stream(
      {
        resource_type: 'image',
        folder,
        public_id: publicIdSuffix,
        quality: 'auto:low',
        fetch_format: 'auto',
        overwrite: false,
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
    upload.end(buffer);
  });
}

@Injectable()
export class ProfileMediaStorageService {
  private readonly log = new Logger(ProfileMediaStorageService.name);

  /** Vrací true, pokud jdeme na Cloudinary (perzistentní URL). */
  isRemotePersistent(): boolean {
    return isProfileRemoteStorageConfigured();
  }

  async uploadAvatar(userId: string, imageBuffer: Buffer): Promise<string> {
    const suffix = `${userId}-${Date.now()}`;
    const url = await uploadProfileRaster(imageBuffer, 'profiles/avatars', suffix);
    this.log.log(`[profile-storage] avatar uploaded publicSuffix=${suffix}`);
    return url;
  }

  async uploadCover(userId: string, imageBuffer: Buffer): Promise<string> {
    const suffix = `${userId}-${Date.now()}`;
    const url = await uploadProfileRaster(imageBuffer, 'profiles/covers', suffix);
    this.log.log(`[profile-storage] cover uploaded publicSuffix=${suffix}`);
    return url;
  }
}
