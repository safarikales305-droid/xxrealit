import {
  BadRequestException,
  Body,
  Controller,
  Logger,
  Post,
  Req,
  UploadedFile,
  UploadedFiles,
  UseFilters,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  FileFieldsInterceptor,
  FileInterceptor,
  FilesInterceptor,
} from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import * as fs from 'node:fs';
import { extname, join } from 'node:path';
import type { Request } from 'express';
import { getUploadsPath } from '../../lib/uploads-path';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MulterProfileExceptionFilter } from './multer-profile.exception-filter';
import { propertyImagesMulterOptions } from './multer-upload.config';
import {
  PROFILE_UPLOAD_MAX_BYTES,
  ProfileImagesService,
} from './profile-images.service';
import { ProfileMediaStorageService } from './profile-media-storage.service';

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const VIDEO_EXT = new Set(['.mp4', '.mov', '.webm', '.m4v', '.avi', '.mkv']);
const MAX_FILES = 24;

const noBodyValidation = new ValidationPipe({
  whitelist: false,
  forbidNonWhitelisted: false,
  transform: false,
});

@Controller()
@UseFilters(MulterProfileExceptionFilter)
export class UploadController {
  private readonly log = new Logger(UploadController.name);

  constructor(
    private readonly profileImages: ProfileImagesService,
    private readonly profileMediaStorage: ProfileMediaStorageService,
  ) {
    const dir = getUploadsPath();
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    for (const sub of ['avatars', 'covers']) {
      const p = join(dir, sub);
      if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
    }
  }

  private resolvePublicOrigin(req: Request): string {
    const forwardedProto = String(req.headers['x-forwarded-proto'] ?? '').split(',')[0]?.trim();
    const forwardedHost = String(req.headers['x-forwarded-host'] ?? '').split(',')[0]?.trim();
    const host = forwardedHost || req.get('host') || '';
    const proto = forwardedProto || req.protocol || 'https';
    if (host) return `${proto}://${host}`;

    const fallback =
      process.env.PUBLIC_APP_URL?.trim() ||
      process.env.NEXT_PUBLIC_API_URL?.trim() ||
      process.env.FRONTEND_URL?.trim() ||
      '';
    return fallback.replace(/\/+$/, '').replace(/\/api$/i, '');
  }

  @Post('upload/avatar')
  @UseGuards(JwtAuthGuard)
  @UsePipes(noBodyValidation)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: PROFILE_UPLOAD_MAX_BYTES },
    }),
  )
  async uploadAvatar(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<{ url: string }> {
    if (!file?.buffer?.length) {
      throw new BadRequestException(
        'Soubor nebyl přijat (pole formuláře musí být pojmenované „file“).',
      );
    }
    if (file.size > PROFILE_UPLOAD_MAX_BYTES) {
      throw new BadRequestException(
        `Soubor je příliš velký. Maximální velikost je ${PROFILE_UPLOAD_MAX_BYTES / (1024 * 1024)} MB.`,
      );
    }
    this.log.log(
      `[upload/avatar] user=${user.id} mimetype=${file.mimetype ?? '(none)'} originalname=${JSON.stringify(file.originalname)} size=${file.size} bufferLen=${file.buffer.length}`,
    );
    await this.profileImages.validateRasterInput(
      file.buffer,
      file.mimetype,
      file.originalname,
    );
    try {
      const { buffer: out, ext } = await this.profileImages.processAvatarForUpload(file.buffer);
      if (this.profileMediaStorage.isRemotePersistent()) {
        const url = await this.profileMediaStorage.uploadAvatar(user.id, out);
        this.log.log(`[upload/avatar] cloudinary user=${user.id} len=${url.length}`);
        return { url };
      }
      this.log.warn(
        `[upload/avatar] Cloudinary není nakonfigurováno — lokální uploads/ (nepersistní na Railway). Soubor *.${ext.slice(1)}`,
      );
      const name = `${user.id}-${Date.now()}${ext}`;
      const dir = join(getUploadsPath(), 'avatars');
      fs.mkdirSync(dir, { recursive: true });
      const outPath = join(dir, name);
      fs.writeFileSync(outPath, out);
      this.log.log(`[upload/avatar] uloženo lokálně user=${user.id} → ${outPath}`);
      return { url: `/uploads/avatars/${name}` };
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      this.log.error(
        `[upload/avatar] zápis souboru selhal user=${user.id}: ${msg}`,
        err instanceof Error ? err.stack : undefined,
      );
      throw new BadRequestException(
        'Soubor se nepodařilo uložit na server (disk nebo oprávnění). Zkuste to prosím znovu nebo kontaktujte správce.',
      );
    }
  }

  @Post('upload/agent-profile-logo')
  @UseGuards(JwtAuthGuard)
  @UsePipes(noBodyValidation)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: PROFILE_UPLOAD_MAX_BYTES },
    }),
  )
  async uploadAgentProfileLogo(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<{ url: string }> {
    if (!file?.buffer?.length) {
      throw new BadRequestException(
        'Soubor nebyl přijat (pole formuláře musí být pojmenované „file“).',
      );
    }
    if (file.size > PROFILE_UPLOAD_MAX_BYTES) {
      throw new BadRequestException(
        `Soubor je příliš velký. Maximální velikost je ${PROFILE_UPLOAD_MAX_BYTES / (1024 * 1024)} MB.`,
      );
    }
    this.log.log(
      `[upload/agent-profile-logo] user=${user.id} mimetype=${file.mimetype ?? '(none)'} originalname=${JSON.stringify(file.originalname)} size=${file.size}`,
    );
    await this.profileImages.validateRasterInput(
      file.buffer,
      file.mimetype,
      file.originalname,
    );
    try {
      const { buffer: out, ext } = await this.profileImages.processAvatarForUpload(file.buffer);
      if (this.profileMediaStorage.isRemotePersistent()) {
        const url = await this.profileMediaStorage.uploadAgentProfileLogo(user.id, out);
        this.log.log(`[upload/agent-profile-logo] cloudinary user=${user.id}`);
        return { url };
      }
      this.log.warn(
        `[upload/agent-profile-logo] lokální uploads/ user=${user.id} *.${ext.slice(1)}`,
      );
      const name = `${user.id}-agent-${Date.now()}${ext}`;
      const dir = join(getUploadsPath(), 'avatars');
      fs.mkdirSync(dir, { recursive: true });
      const outPath = join(dir, name);
      fs.writeFileSync(outPath, out);
      return { url: `/uploads/avatars/${name}` };
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      this.log.error(`[upload/agent-profile-logo] selhalo user=${user.id}: ${msg}`);
      throw new BadRequestException(
        'Soubor se nepodařilo uložit na server (disk nebo oprávnění). Zkuste to prosím znovu nebo kontaktujte správce.',
      );
    }
  }

  @Post('upload/company-ad-image')
  @UseGuards(JwtAuthGuard)
  @UsePipes(noBodyValidation)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: PROFILE_UPLOAD_MAX_BYTES },
    }),
  )
  async uploadCompanyAdImage(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<{ url: string }> {
    if (!file?.buffer?.length) {
      throw new BadRequestException(
        'Soubor nebyl přijat (pole formuláře musí být pojmenované „file“).',
      );
    }
    if (file.size > PROFILE_UPLOAD_MAX_BYTES) {
      throw new BadRequestException(
        `Soubor je příliš velký. Maximální velikost je ${PROFILE_UPLOAD_MAX_BYTES / (1024 * 1024)} MB.`,
      );
    }
    await this.profileImages.validateRasterInput(
      file.buffer,
      file.mimetype,
      file.originalname,
    );
    try {
      const { buffer: out, ext } = await this.profileImages.processCoverForUpload(file.buffer);
      if (this.profileMediaStorage.isRemotePersistent()) {
        const url = await this.profileMediaStorage.uploadCompanyAdImage(user.id, out);
        this.log.log(`[upload/company-ad-image] cloudinary user=${user.id} len=${url.length}`);
        return { url };
      }

      const name = `${user.id}-ad-${Date.now()}${ext}`;
      const dir = join(getUploadsPath(), 'properties');
      fs.mkdirSync(dir, { recursive: true });
      const outPath = join(dir, name);
      fs.writeFileSync(outPath, out);
      const origin = this.resolvePublicOrigin(req);
      const path = `/uploads/properties/${name}`;
      const url = origin ? `${origin}${path}` : path;
      this.log.warn(
        `[upload/company-ad-image] local fallback user=${user.id}; returning absolute=${url}`,
      );
      return { url };
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      this.log.error(
        `[upload/company-ad-image] upload failed user=${user.id}: ${msg}`,
        err instanceof Error ? err.stack : undefined,
      );
      throw new BadRequestException(
        'Soubor se nepodařilo uložit do perzistentního úložiště.',
      );
    }
  }

  @Post('upload/cover')
  @UseGuards(JwtAuthGuard)
  @UsePipes(noBodyValidation)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: PROFILE_UPLOAD_MAX_BYTES },
    }),
  )
  async uploadCover(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<{ url: string }> {
    if (!file?.buffer?.length) {
      throw new BadRequestException(
        'Soubor nebyl přijat (pole formuláře musí být pojmenované „file“).',
      );
    }
    if (file.size > PROFILE_UPLOAD_MAX_BYTES) {
      throw new BadRequestException(
        `Soubor je příliš velký. Maximální velikost je ${PROFILE_UPLOAD_MAX_BYTES / (1024 * 1024)} MB.`,
      );
    }
    this.log.log(
      `[upload/cover] user=${user.id} mimetype=${file.mimetype ?? '(none)'} originalname=${JSON.stringify(file.originalname)} size=${file.size} bufferLen=${file.buffer.length}`,
    );
    await this.profileImages.validateRasterInput(
      file.buffer,
      file.mimetype,
      file.originalname,
    );
    try {
      const { buffer: out, ext } = await this.profileImages.processCoverForUpload(file.buffer);
      if (this.profileMediaStorage.isRemotePersistent()) {
        const url = await this.profileMediaStorage.uploadCover(user.id, out);
        this.log.log(`[upload/cover] cloudinary user=${user.id} len=${url.length}`);
        return { url };
      }
      this.log.warn(
        `[upload/cover] Cloudinary není nakonfigurováno — lokální uploads/ (nepersistní na Railway). Soubor *.${ext.slice(1)}`,
      );
      const name = `${user.id}-${Date.now()}${ext}`;
      const dir = join(getUploadsPath(), 'covers');
      fs.mkdirSync(dir, { recursive: true });
      const outPath = join(dir, name);
      fs.writeFileSync(outPath, out);
      this.log.log(`[upload/cover] uloženo lokálně user=${user.id} → ${outPath}`);
      return { url: `/uploads/covers/${name}` };
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      this.log.error(
        `[upload/cover] zápis souboru selhal user=${user.id}: ${msg}`,
        err instanceof Error ? err.stack : undefined,
      );
      throw new BadRequestException(
        'Cover se nepodařilo uložit na server (disk nebo oprávnění). Zkuste to prosím znovu nebo kontaktujte správce.',
      );
    }
  }

  @Post('upload')
  @UseGuards(JwtAuthGuard)
  @UsePipes(noBodyValidation)
  @UseInterceptors(
    FilesInterceptor('files', MAX_FILES, propertyImagesMulterOptions),
  )
  uploadImages(
    @CurrentUser() _user: AuthUser,
    @UploadedFiles() files?: Express.Multer.File[],
  ): { urls: string[] } {
    if (!files?.length) {
      throw new BadRequestException('Přiložte alespoň jeden soubor (pole files)');
    }

    const urls: string[] = [];
    for (const f of files) {
      if (!f.filename) continue;
      const e = extname(f.originalname || f.filename).toLowerCase() || '.jpg';
      if (!IMAGE_EXT.has(e)) {
        throw new BadRequestException(
          `Nepovolený formát souboru: ${e}. Použijte JPG, PNG, WebP nebo GIF.`,
        );
      }
      urls.push(`/uploads/properties/${f.filename}`);
    }

    if (urls.length === 0) {
      throw new BadRequestException('Žádný platný obrázek k uložení');
    }

    return { urls };
  }

  @Post('upload/media')
  @UseGuards(JwtAuthGuard)
  @UsePipes(noBodyValidation)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'video', maxCount: 1 },
        { name: 'images', maxCount: 30 },
      ],
      {
        storage: propertyImagesMulterOptions.storage,
        limits: {
          fileSize: 300 * 1024 * 1024,
          files: 31,
        },
      },
    ),
  )
  uploadMedia(
    @CurrentUser() _user: AuthUser,
    @UploadedFiles()
    files?: {
      video?: Express.Multer.File[];
      images?: Express.Multer.File[];
    },
    @Body('imageOrder') imageOrderRaw?: string | string[],
  ): { videoUrl: string | null; imageUrls: string[] } {
    const video = files?.video?.[0];
    const images = files?.images ?? [];
    if (images.length > 30) {
      throw new BadRequestException('Max 30 images');
    }
    if ((video ? 1 : 0) > 1) {
      throw new BadRequestException('Only 1 video allowed');
    }

    const imageOrder = (() => {
      if (!imageOrderRaw) return [];
      const source = Array.isArray(imageOrderRaw) ? imageOrderRaw[0] : imageOrderRaw;
      try {
        const parsed = JSON.parse(source) as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((x): x is string => typeof x === 'string');
      } catch {
        return [];
      }
    })();

    if (video?.filename) {
      const ext = extname(video.originalname || video.filename).toLowerCase() || '.mp4';
      if (!VIDEO_EXT.has(ext)) {
        throw new BadRequestException('Nepovolený video formát');
      }
    }

    const orderedImages =
      imageOrder.length > 0
        ? [...images].sort((a, b) => {
            const aKey = `${a.originalname}::${a.size}`;
            const bKey = `${b.originalname}::${b.size}`;
            const ai = imageOrder.indexOf(aKey);
            const bi = imageOrder.indexOf(bKey);
            return (ai === -1 ? Number.MAX_SAFE_INTEGER : ai) - (bi === -1 ? Number.MAX_SAFE_INTEGER : bi);
          })
        : images;

    const imageUrls: string[] = [];
    for (const f of orderedImages) {
      if (!f.filename) continue;
      const e = extname(f.originalname || f.filename).toLowerCase() || '.jpg';
      if (!IMAGE_EXT.has(e)) {
        throw new BadRequestException(`Nepovolený formát obrázku: ${e}`);
      }
      imageUrls.push(`/uploads/properties/${f.filename}`);
    }

    const videoUrl = video?.filename ? `/uploads/properties/${video.filename}` : null;
    return { videoUrl, imageUrls };
  }
}
