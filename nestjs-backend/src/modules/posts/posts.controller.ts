import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { v2 as cloudinary } from 'cloudinary';
import ffmpegPath from 'ffmpeg-static';
import { diskStorage } from 'multer';
import { unlink } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreatePostDto } from './dto/create-post.dto';
import { PostsService } from './posts.service';

async function convertToMp4H264Aac(
  inputPath: string,
  outputPath: string,
): Promise<void> {
  const ffmpegBin = typeof ffmpegPath === 'string' ? ffmpegPath : '';
  if (!ffmpegBin) {
    throw new Error('FFmpeg binary is missing');
  }

  await new Promise<void>((resolve, reject) => {
    const args = [
      '-y',
      '-i',
      inputPath,
      '-vcodec',
      'libx264',
      '-acodec',
      'aac',
      '-movflags',
      '+faststart',
      outputPath,
    ];
    const proc = spawn(ffmpegBin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg exited with ${code}: ${stderr.slice(-1200)}`));
      }
    });
  });
}

async function uploadConvertedVideoToCloudinary(
  filePath: string,
): Promise<string> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      'Missing Cloudinary env vars: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET',
    );
  }

  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
  const result = await cloudinary.uploader.upload(filePath, {
    resource_type: 'video',
    folder: 'xxrealit/videos',
    format: 'mp4',
  });

  if (!result.secure_url) {
    throw new Error('Cloudinary upload did not return secure_url');
  }
  return result.secure_url;
}

@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@CurrentUser() user: AuthUser, @Body() body: CreatePostDto) {
    const text = (body.description ?? body.content ?? '').trim();
    if (!text) {
      throw new BadRequestException('Obsah příspěvku je povinný.');
    }
    return this.postsService.create(user.id, body);
  }

  @Post('video')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const dir = join(tmpdir(), 'xxrealit-video-upload');
          if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
          }
          cb(null, dir);
        },
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          const ext = extname(file.originalname || '').toLowerCase() || '.mp4';
          cb(null, `${unique}${ext}`);
        },
      }),
      limits: {
        fileSize: 50 * 1024 * 1024,
      },
      fileFilter: (_req, file, cb) => {
        if (file.mimetype.startsWith('video/')) {
          cb(null, true);
        } else {
          cb(new Error('Only video files allowed'), false);
        }
      },
    }),
  )
  async createVideoPost(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file?: Express.Multer.File,
    @Body('description') description?: string,
  ) {
    if (!file?.filename) {
      throw new BadRequestException('Video soubor je povinný (field "file").');
    }

    const uploadsDir = join(tmpdir(), 'xxrealit-video-upload');
    const inputPath = join(uploadsDir, file.filename);
    const outputFilename = `${basename(file.filename, extname(file.filename))}-h264.mp4`;
    const outputPath = join(uploadsDir, outputFilename);
    let videoUrl = '';

    try {
      await convertToMp4H264Aac(inputPath, outputPath);
      videoUrl = await uploadConvertedVideoToCloudinary(outputPath);
    } catch (error) {
      console.error('[VideoUpload] Conversion/upload failed:', error);
      throw new BadRequestException(
        'Video se nepodařilo nahrát do trvalého úložiště. Zkuste to prosím znovu.',
      );
    } finally {
      await unlink(inputPath).catch(() => undefined);
      await unlink(outputPath).catch(() => undefined);
    }

    return this.postsService.createVideoPost(user.id, videoUrl, description ?? '');
  }
}
