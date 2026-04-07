import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
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
import { uploadPostMedia } from './cloudinary-upload';
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

  @Post(':id/favorite')
  @UseGuards(JwtAuthGuard)
  toggleFavorite(@Param('id') postId: string, @CurrentUser() user: AuthUser) {
    return this.postsService.toggleFavorite(postId, user.id);
  }

  @Post(':id/comment')
  @UseGuards(JwtAuthGuard)
  addComment(
    @Param('id') postId: string,
    @Body('content') content: string,
    @CurrentUser() user: AuthUser,
  ) {
    const text = (content ?? '').trim();
    if (!text) {
      throw new BadRequestException('Komentář nesmí být prázdný.');
    }
    return this.postsService.addComment(postId, user.id, text);
  }

  @Get(':id/comments')
  getComments(@Param('id') postId: string) {
    return this.postsService.getComments(postId);
  }

  @Post('video')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: 300 * 1024 * 1024,
      },
      fileFilter: (_req, file, cb) => {
        if (
          file.mimetype.startsWith('video/') ||
          file.mimetype.startsWith('image/')
        ) {
          cb(null, true);
        } else {
          cb(
            new Error(
              `Unsupported MIME type "${file.mimetype}". Allowed: video/*, image/*`,
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
      throw new BadRequestException('Vyberte soubor videa nebo obrázku.');
    }
    if (file.size > 300 * 1024 * 1024) {
      throw new BadRequestException('Max 300MB');
    }
    let uploaded: { url: string; kind: 'video' | 'image' };
    try {
      uploaded = await uploadPostMedia(file);
    } catch (err) {
      console.error('Media upload failed:', err);
      throw new BadRequestException(
        'Upload média se nezdařil. Ověřte CLOUDINARY_URL (max 300 MB před kompresí, video max 120 s).',
      );
    }

    await this.postsService.createMediaPost(user.id, {
      kind: uploaded.kind,
      url: uploaded.url,
      description: description ?? '',
    });
    return {
      success: true,
      url: uploaded.url,
      mediaType: uploaded.kind,
    };
  }
}
