import {
  BadRequestException,
  Body,
  Controller,
  Param,
  Patch,
  Post,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  ValidationPipe,
} from '@nestjs/common';
import { FileFieldsInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { propertyMediaMemoryMulterOptions } from '../upload/multer-upload.config';
import { ReorderTiparMediaDto } from './dto/reorder-tipar-media.dto';
import { TiparService } from './tipar.service';
import {
  assertTiparImageFile,
  assertTiparVideoFile,
  orderUploadedImages,
} from './tipar-media.util';

@Controller('tips')
export class TipsController {
  constructor(private readonly tipar: TiparService) {}

  /** POST /api/tips — vytvoření tipu (multipart: fotky + volitelné video). */
  @Post()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'video', maxCount: 1 },
        { name: 'images', maxCount: 30 },
      ],
      propertyMediaMemoryMulterOptions,
    ),
  )
  create(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
    @UploadedFiles()
    files?: {
      video?: Express.Multer.File[];
      images?: Express.Multer.File[];
    },
  ) {
    const imageFiles = files?.images ?? [];
    if (imageFiles.length > 30) {
      throw new BadRequestException('Max 30 fotek');
    }
    for (const image of orderUploadedImages(imageFiles, body.imageOrder)) {
      assertTiparImageFile(image);
    }
    const videoFile = files?.video?.[0] ?? null;
    if (videoFile) assertTiparVideoFile(videoFile);
    return this.tipar.createPostMultipart(user.id, body, {
      orderedImages: orderUploadedImages(imageFiles, body.imageOrder),
      videoFile,
    });
  }

  /** POST /api/tips/upload-photo */
  @Post('upload-photo')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file', propertyMediaMemoryMulterOptions))
  uploadPhoto(@CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Soubor chybí');
    assertTiparImageFile(file);
    return this.tipar.uploadPhoto(user.id, file);
  }

  /** POST /api/tips/upload-video */
  @Post('upload-video')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file', propertyMediaMemoryMulterOptions))
  uploadVideo(@CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Soubor chybí');
    assertTiparVideoFile(file);
    return this.tipar.uploadVideo(user.id, file);
  }

  /** POST /api/tips/generate-shorts-from-photos — před publikováním tipu. */
  @Post('generate-shorts-from-photos')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileFieldsInterceptor([{ name: 'images', maxCount: 30 }], propertyMediaMemoryMulterOptions),
  )
  generateShortsFromPhotos(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
    @UploadedFiles() files?: { images?: Express.Multer.File[] },
  ) {
    const imageFiles = files?.images ?? [];
    if (imageFiles.length > 30) {
      throw new BadRequestException('Max 30 fotek');
    }
    for (const image of imageFiles) {
      assertTiparImageFile(image);
    }
    return this.tipar.generateShortsFromPhotos(user.id, body, imageFiles);
  }

  /** POST /api/tips/:id/generate-shorts-video */
  @Post(':id/generate-shorts-video')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileFieldsInterceptor([{ name: 'images', maxCount: 30 }], propertyMediaMemoryMulterOptions),
  )
  generateShortsForPost(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @UploadedFiles() files?: { images?: Express.Multer.File[] },
  ) {
    const imageFiles = files?.images ?? [];
    for (const image of imageFiles) {
      assertTiparImageFile(image);
    }
    return this.tipar.generateShortsForPost(user, id, body, imageFiles);
  }

  /** PATCH /api/tips/:id/media-order */
  @Patch(':id/media-order')
  @UseGuards(JwtAuthGuard)
  reorderMedia(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true, transform: true })) dto: ReorderTiparMediaDto,
  ) {
    return this.tipar.reorderMedia(user, id, dto.orderedUrls);
  }

  /** PATCH /api/tips/:id — úprava tipu (multipart). */
  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'video', maxCount: 1 },
        { name: 'images', maxCount: 30 },
      ],
      propertyMediaMemoryMulterOptions,
    ),
  )
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @UploadedFiles()
    files?: {
      video?: Express.Multer.File[];
      images?: Express.Multer.File[];
    },
  ) {
    const imageFiles = files?.images ?? [];
    if (imageFiles.length > 30) {
      throw new BadRequestException('Max 30 fotek');
    }
    for (const image of orderUploadedImages(imageFiles, body.imageOrder)) {
      assertTiparImageFile(image);
    }
    const videoFile = files?.video?.[0] ?? null;
    if (videoFile) assertTiparVideoFile(videoFile);
    return this.tipar.updatePostMultipart(user, id, body, {
      orderedImages: orderUploadedImages(imageFiles, body.imageOrder),
      videoFile,
    });
  }
}
