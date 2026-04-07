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
import { uploadToCloudinary } from './cloudinary-upload';
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
      '-pix_fmt',
      'yuv420p',
      '-vcodec',
      'libx264',
      '-acodec',
      'aac',
      '-preset',
      'veryfast',
      '-crf',
      '23',
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
        // Allow larger uploads; final file is still optimized by FFmpeg.
        fileSize: 200 * 1024 * 1024,
      },
      fileFilter: (_req, file, cb) => {
        // Accept any video/* input and normalize via mandatory FFmpeg conversion.
        if (file.mimetype.startsWith('video/')) {
          cb(null, true);
        } else {
          cb(
            new Error(
              `Unsupported MIME type "${file.mimetype}". Allowed: video/*`,
            ),
            false,
          );
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
      // Mandatory normalization to browser-safe stream: H.264 + AAC + faststart.
      await convertToMp4H264Aac(inputPath, outputPath);
      videoUrl = await uploadToCloudinary(outputPath);
      if (!videoUrl.toLowerCase().includes('.mp4')) {
        throw new Error(`Uploaded URL is not MP4: ${videoUrl}`);
      }
    } catch (error) {
      console.error('[VideoUpload] Conversion/upload failed:', error);
      throw new BadRequestException(
        'Video neprošlo validací/konverzí. Nahrajte prosím MP4 soubor.',
      );
    } finally {
      await unlink(inputPath).catch(() => undefined);
      await unlink(outputPath).catch(() => undefined);
    }

    return this.postsService.createVideoPost(user.id, videoUrl, description ?? '');
  }
}
