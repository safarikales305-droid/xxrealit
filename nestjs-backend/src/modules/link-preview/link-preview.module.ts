import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LinkPreviewController } from './link-preview.controller';
import { LinkPreviewImageService } from './link-preview-image.service';
import { LinkPreviewService } from './link-preview.service';

@Module({
  imports: [AuthModule],
  controllers: [LinkPreviewController],
  providers: [LinkPreviewService, LinkPreviewImageService],
  exports: [LinkPreviewService],
})
export class LinkPreviewModule {}
