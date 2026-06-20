import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/guards/admin.guard';
import { shortsMusicMemoryMulterOptions } from '../upload/multer-upload.config';
import { PostSoundsService } from './post-sounds.service';

@Controller('admin/post-sounds')
@UseGuards(JwtAuthGuard, AdminGuard)
export class PostSoundsAdminController {
  constructor(private readonly postSounds: PostSoundsService) {}

  @Get()
  list() {
    return this.postSounds.listAllForAdmin();
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', shortsMusicMemoryMulterOptions))
  async upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('title') titleRaw?: string,
    @Body('artist') artistRaw?: string,
    @Body('description') descriptionRaw?: string,
    @Body('isActive') isActiveRaw?: string,
  ) {
    if (!file) {
      throw new BadRequestException('Nahrajte audio soubor (pole file).');
    }
    const title = typeof titleRaw === 'string' ? titleRaw.trim() : '';
    if (!title) {
      throw new BadRequestException('Vyplňte název zvuku.');
    }
    const artist = typeof artistRaw === 'string' ? artistRaw.trim() : '';
    const description =
      typeof descriptionRaw === 'string' && descriptionRaw.trim()
        ? descriptionRaw.trim()
        : null;
    const isActive =
      typeof isActiveRaw === 'string'
        ? !['0', 'false', 'off', 'no'].includes(isActiveRaw.trim().toLowerCase())
        : true;
    return this.postSounds.createFromUpload(
      user.id,
      file,
      title,
      artist,
      description,
      isActive,
    );
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.postSounds.updateTrack(id, body);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.postSounds.deleteTrack(id);
  }
}
