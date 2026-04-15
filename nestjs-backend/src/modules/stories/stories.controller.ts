import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StoriesService } from './stories.service';

@Controller('stories')
export class StoriesController {
  constructor(private readonly storiesService: StoriesService) {}

  @Get('public')
  listPublicStories() {
    return this.storiesService.listActiveStories();
  }

  @Get('public/user/:userId')
  listPublicStoriesByUser(@Param('userId') userId: string) {
    return this.storiesService.listActiveStoriesByUser(userId);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 300 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (file.mimetype.startsWith('video/') || file.mimetype.startsWith('image/')) {
          cb(null, true);
          return;
        }
        cb(new Error('Unsupported MIME type.'), false);
      },
    }),
  )
  async createStory(@CurrentUser() user: AuthUser, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Vyberte obrázek nebo video.');
    const created = await this.storiesService.createStory(user.id, file);
    return { ok: true, story: created };
  }
}
