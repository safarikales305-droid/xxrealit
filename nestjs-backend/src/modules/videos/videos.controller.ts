import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { getUploadsPath } from '../../lib/uploads-path';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { assertUserCanCreateProfessionalContent } from '../auth/assert-professional-content';
import { CreateVideoDto } from './dto/create-video.dto';
import { VideosService } from './videos.service';

const VIDEO_EXTENSIONS = new Set([
  '.mp4',
  '.webm',
  '.mov',
  '.m4v',
  '.avi',
  '.mkv',
]);

@Controller('videos')
export class VideosController {
  constructor(private readonly videosService: VideosService) {}

  @Post('upload')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const videosDir = join(getUploadsPath(), 'videos');
          if (!existsSync(videosDir)) {
            mkdirSync(videosDir, { recursive: true });
          }
          cb(null, videosDir);
        },
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          cb(null, `${unique}${extname(file.originalname || '').toLowerCase()}`);
        },
      }),
      limits: { fileSize: 60 * 1024 * 1024 },
    }),
  )
  uploadVideo(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    assertUserCanCreateProfessionalContent(user);
    if (!file?.filename) {
      throw new BadRequestException('Soubor nebyl přijat. Použijte pole "file".');
    }

    const ext = extname(file.originalname || file.filename).toLowerCase();
    if (!VIDEO_EXTENSIONS.has(ext)) {
      throw new BadRequestException('Nepodporovaný formát videa.');
    }

    return {
      url: `/uploads/videos/${file.filename}`,
    };
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  createVideo(@CurrentUser() user: AuthUser, @Body() body: CreateVideoDto) {
    if (!user?.id) {
      throw new BadRequestException('Neplatný uživatel.');
    }
    assertUserCanCreateProfessionalContent(user);
    return this.videosService.create(user.id, body);
  }

  @Get()
  getFeed() {
    return this.videosService.listFeed();
  }
}
