import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as fs from 'node:fs';
import { extname } from 'node:path';
import { getUploadsPath } from '../../lib/uploads-path';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { propertyImagesMulterOptions } from './multer-upload.config';

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const MAX_FILES = 24;

const noBodyValidation = new ValidationPipe({
  whitelist: false,
  forbidNonWhitelisted: false,
  transform: false,
});

@Controller()
export class UploadController {
  constructor() {
    const dir = getUploadsPath();
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  @Post('upload/avatar')
  @UseGuards(JwtAuthGuard)
  @UsePipes(noBodyValidation)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const d = getUploadsPath();
          if (!fs.existsSync(d)) {
            fs.mkdirSync(d, { recursive: true });
          }
          cb(null, d);
        },
        filename: (_req, file, cb) => {
          const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, unique + extname(file.originalname || '.jpg'));
        },
      }),
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  uploadAvatar(
    @CurrentUser() _user: AuthUser,
    @UploadedFile() file?: Express.Multer.File,
  ): { url: string } {
    console.log('UPLOAD FILE:', file);

    if (!file?.filename) {
      throw new BadRequestException('File not received (field name must be "file")');
    }

    const ext =
      extname(file.originalname || file.filename).toLowerCase() || '.jpg';
    if (!IMAGE_EXT.has(ext)) {
      throw new BadRequestException('Povolené formáty: JPG, PNG, WebP, GIF');
    }

    return { url: `/uploads/${file.filename}` };
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
}
