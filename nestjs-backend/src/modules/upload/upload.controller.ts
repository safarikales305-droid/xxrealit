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
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const MAX_FILES = 24;
const MAX_BYTES = 6 * 1024 * 1024;
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

type Uploaded = { buffer: Buffer; originalname?: string };

@Controller('upload')
export class UploadController {
  @UseGuards(JwtAuthGuard)
  @Post('avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: AVATAR_MAX_BYTES },
    }),
  )
  async uploadAvatar(
    @CurrentUser() _user: AuthUser,
    @UploadedFile()
    file?: { buffer: Buffer; originalname?: string },
  ): Promise<{ url: string }> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Soubor je povinný (pole file)');
    }
    const ext = extname(file.originalname || '').toLowerCase() || '.jpg';
    if (!IMAGE_EXT.has(ext)) {
      throw new BadRequestException('Povolené formáty: JPG, PNG, WebP, GIF');
    }
    const name = `${randomUUID()}${ext}`;
    const dir = join(process.cwd(), 'uploads');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, name), file.buffer);
    return { url: `/uploads/${name}` };
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  @UseInterceptors(
    FilesInterceptor('files', MAX_FILES, {
      limits: { fileSize: MAX_BYTES },
    }),
  )
  async uploadImages(
    @CurrentUser() _user: AuthUser,
    @UploadedFiles() files?: Uploaded[],
  ): Promise<{ urls: string[] }> {
    if (!files?.length) {
      throw new BadRequestException('Přiložte alespoň jeden soubor (pole files)');
    }

    const dir = join(process.cwd(), 'uploads', 'properties');
    await mkdir(dir, { recursive: true });

    const urls: string[] = [];
    for (const file of files) {
      if (!file.buffer?.length) continue;
      const ext = extname(file.originalname || '').toLowerCase() || '.jpg';
      if (!IMAGE_EXT.has(ext)) {
        throw new BadRequestException(
          `Nepovolený formát souboru: ${ext}. Použijte JPG, PNG, WebP nebo GIF.`,
        );
      }
      const name = `${randomUUID()}${ext}`;
      await writeFile(join(dir, name), file.buffer);
      urls.push(`/uploads/properties/${name}`);
    }

    if (urls.length === 0) {
      throw new BadRequestException('Žádný platný obrázek k uložení');
    }

    return { urls };
  }
}
