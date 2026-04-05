import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { extname } from 'node:path';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  avatarMulterOptions,
  propertyImagesMulterOptions,
} from './multer-upload.config';

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const MAX_FILES = 24;

@Controller('upload')
export class UploadController {
  @UseGuards(JwtAuthGuard)
  @Post('avatar')
  @UseInterceptors(FileInterceptor('file', avatarMulterOptions))
  uploadAvatar(
    @CurrentUser() _user: AuthUser,
    @UploadedFile() file?: Express.Multer.File,
  ): { url: string } {
    if (!file?.filename) {
      throw new BadRequestException('Soubor je povinný (pole file)');
    }
    const ext = extname(file.originalname || file.filename).toLowerCase() || '.jpg';
    if (!IMAGE_EXT.has(ext)) {
      throw new BadRequestException('Povolené formáty: JPG, PNG, WebP, GIF');
    }
    return { url: `/uploads/${file.filename}` };
  }

  @UseGuards(JwtAuthGuard)
  @Post()
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
    for (const file of files) {
      if (!file.filename) continue;
      const ext = extname(file.originalname || file.filename).toLowerCase() || '.jpg';
      if (!IMAGE_EXT.has(ext)) {
        throw new BadRequestException(
          `Nepovolený formát souboru: ${ext}. Použijte JPG, PNG, WebP nebo GIF.`,
        );
      }
      urls.push(`/uploads/properties/${file.filename}`);
    }

    if (urls.length === 0) {
      throw new BadRequestException('Žádný platný obrázek k uložení');
    }

    return { urls };
  }
}
