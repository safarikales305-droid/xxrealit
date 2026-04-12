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
import { ShortsMusicService } from './shorts-music.service';

@Controller('admin/shorts-music')
@UseGuards(JwtAuthGuard, AdminGuard)
export class ShortsMusicAdminController {
  constructor(private readonly shortsMusic: ShortsMusicService) {}

  @Get()
  list() {
    return this.shortsMusic.listAllForAdmin();
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', shortsMusicMemoryMulterOptions))
  async upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('title') titleRaw?: string,
    @Body('description') descriptionRaw?: string,
    @Body('isActive') isActiveRaw?: string,
  ) {
    if (!file) {
      throw new BadRequestException('Nahrajte audio soubor (pole file).');
    }
    const title = typeof titleRaw === 'string' ? titleRaw.trim() : '';
    if (!title) {
      throw new BadRequestException('Vyplňte název skladby.');
    }
    const description =
      typeof descriptionRaw === 'string' && descriptionRaw.trim()
        ? descriptionRaw.trim()
        : null;
    const isActive =
      typeof isActiveRaw === 'string'
        ? ['0', 'false', 'off', 'no'].includes(isActiveRaw.trim().toLowerCase())
          ? false
          : true
        : true;
    return this.shortsMusic.createFromUpload(user.id, file, title, description, isActive);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.shortsMusic.updateTrack(id, body);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.shortsMusic.deleteTrack(id);
  }
}
