import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { uploadVideo } from './cloudinary-upload';
import { CreatePostDto } from './dto/create-post.dto';
import { PostsService } from './posts.service';

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

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  deletePost(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.postsService.deletePostByOwner(id, user.id);
  }

  @Post('video')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: 60 * 1024 * 1024,
      },
      fileFilter: (_req, file, cb) => {
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
  @HttpCode(200)
  async createVideoPost(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file?: Express.Multer.File,
    @Body('description') description?: string,
  ) {
    if (!file) {
      throw new BadRequestException('Vyberte video soubor.');
    }
    let videoUrl: string;
    try {
      videoUrl = await uploadVideo(file);
    } catch (err) {
      console.error('Video upload failed:', err);
      throw new BadRequestException(
        'Upload videa se nezdařil. Ověřte CLOUDINARY_URL, velikost max 60 MB a délku max 120 s.',
      );
    }

    await this.postsService.createVideoPost(user.id, videoUrl, description ?? '');
    return { success: true, url: videoUrl };
  }
}
