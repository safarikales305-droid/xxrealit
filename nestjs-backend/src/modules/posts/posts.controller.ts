import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { PostCategory, ReactionType } from '@prisma/client';
import { FileFieldsInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { uploadPostMedia } from './cloudinary-upload';
import { CreateListingPostDto } from './dto/create-listing-post.dto';
import { CreatePostDto } from './dto/create-post.dto';
import { PostsService } from './posts.service';

@Controller('posts')
export class PostsController {
  @Get()
  list(
    @Query('category') category?: string,
    @Query('radiusKm') radiusKm?: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
  ) {
    const value = (category ?? '').trim();
    const cat = (['MAKLERI', 'STAVEBNI_FIRMY', 'REALITNI_KANCELARE'].includes(value)
      ? (value as PostCategory)
      : undefined);
    const radius = Number(radiusKm);
    const userLat = Number(lat);
    const userLng = Number(lng);
    return this.postsService.listCommunityPosts(
      cat,
      Number.isFinite(radius) ? radius : undefined,
      Number.isFinite(userLat) ? userLat : undefined,
      Number.isFinite(userLng) ? userLng : undefined,
    );
  }

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

  @Post(':id/comments')
  @UseGuards(JwtAuthGuard)
  addCommentAlias(
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

  @Post(':id/reaction')
  @UseGuards(JwtAuthGuard)
  setReaction(
    @Param('id') postId: string,
    @Body('type') type: string,
    @CurrentUser() user: AuthUser,
  ) {
    const reaction = type === 'DISLIKE' ? ReactionType.DISLIKE : ReactionType.LIKE;
    return this.postsService.toggleReaction(postId, user.id, reaction);
  }

  @Get(':id')
  async getPostDetail(@Param('id') id: string) {
    const post = await this.postsService.getPostDetail(id);
    if (!post) {
      throw new NotFoundException('Příspěvek nebyl nalezen.');
    }
    return post;
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

  @Post('listing')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'video', maxCount: 1 },
        { name: 'images', maxCount: 30 },
      ],
      {
        storage: memoryStorage(),
        limits: {
          fileSize: 300 * 1024 * 1024,
          files: 31,
        },
        fileFilter: (_req, file, cb) => {
          if (
            file.mimetype.startsWith('video/') ||
            file.mimetype.startsWith('image/')
          ) {
            cb(null, true);
          } else {
            cb(new Error(`Unsupported MIME type "${file.mimetype}"`), false);
          }
        },
      },
    ),
  )
  async createListingPost(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateListingPostDto,
    @UploadedFiles()
    files?: {
      video?: Express.Multer.File[];
      images?: Express.Multer.File[];
    },
  ) {
    const video = files?.video?.[0];
    const images = files?.images ?? [];
    if (images.length > 30) {
      throw new BadRequestException('Max 30 images');
    }
    if ((video ? 1 : 0) > 1) {
      throw new BadRequestException('Only 1 video allowed');
    }

    const imageOrderKeys = (() => {
      if (!body.imageOrder) return [];
      try {
        const parsed = JSON.parse(body.imageOrder) as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((x): x is string => typeof x === 'string');
      } catch {
        return [];
      }
    })();

    const orderedImages =
      imageOrderKeys.length > 0
        ? [...images].sort((a, b) => {
            const aKey = `${a.originalname}::${a.size}`;
            const bKey = `${b.originalname}::${b.size}`;
            const ai = imageOrderKeys.indexOf(aKey);
            const bi = imageOrderKeys.indexOf(bKey);
            const am = ai === -1 ? Number.MAX_SAFE_INTEGER : ai;
            const bm = bi === -1 ? Number.MAX_SAFE_INTEGER : bi;
            return am - bm;
          })
        : images;

    const media: Array<{ url: string; type: 'video' | 'image'; order: number }> = [];

    if (video) {
      const uploadedVideo = await uploadPostMedia(video);
      if (uploadedVideo.kind !== 'video') {
        throw new BadRequestException('Neplatné video.');
      }
      media.push({
        url: uploadedVideo.url,
        type: 'video',
        order: 0,
      });
    }

    for (let i = 0; i < orderedImages.length; i += 1) {
      const uploadedImage = await uploadPostMedia(orderedImages[i]);
      if (uploadedImage.kind !== 'image') {
        throw new BadRequestException('Neplatný obrázek.');
      }
      media.push({
        url: uploadedImage.url,
        type: 'image',
        order: i + 1,
      });
    }
    if (media.length === 0) {
      throw new BadRequestException('Nahrajte alespoň 1 obrázek nebo video.');
    }

    const type: 'post' | 'short' = video ? 'short' : 'post';
    const priceNum = Number(body.price);
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      throw new BadRequestException('Cena musí být číslo >= 0.');
    }

    const created = await this.postsService.createListingPost(user.id, {
      title: body.title.trim(),
      description: body.description.trim(),
      price: Math.trunc(priceNum),
      city: body.city.trim(),
      type,
      category: body.category,
      latitude: body.latitude ? Number(body.latitude) : undefined,
      longitude: body.longitude ? Number(body.longitude) : undefined,
      media,
    });

    return { success: true, post: created };
  }
}
