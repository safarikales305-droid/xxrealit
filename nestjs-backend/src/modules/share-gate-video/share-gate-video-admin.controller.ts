import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { AdminGuard } from '../admin/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { shareGateVideoMemoryMulterOptions } from '../upload/multer-upload.config';
import { CreateShareGateVideoDto } from './dto/create-share-gate-video.dto';
import { UpdateShareGateVideoDto } from './dto/update-share-gate-video.dto';
import { ShareGateVideoService } from './share-gate-video.service';

@Controller('admin/share-gate-videos')
@UseGuards(JwtAuthGuard, AdminGuard)
export class ShareGateVideoAdminController {
  constructor(private readonly shareGateVideos: ShareGateVideoService) {}

  @Get()
  list() {
    return this.shareGateVideos.listAllForAdmin();
  }

  @Post()
  create(@Body() dto: CreateShareGateVideoDto) {
    return this.shareGateVideos.createFromDto(dto);
  }

  @Post('upload')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'video', maxCount: 1 },
        { name: 'poster', maxCount: 1 },
      ],
      shareGateVideoMemoryMulterOptions,
    ),
  )
  upload(
    @UploadedFiles()
    files: {
      video?: Express.Multer.File[];
      poster?: Express.Multer.File[];
    },
    @Body() body: Record<string, string | undefined>,
  ) {
    const video = files.video?.[0];
    if (!video) {
      throw new BadRequestException('Nahrajte video soubor (pole video).');
    }
    return this.shareGateVideos.createFromUpload(video, files.poster?.[0], body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateShareGateVideoDto) {
    return this.shareGateVideos.update(id, dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.shareGateVideos.delete(id);
  }
}
