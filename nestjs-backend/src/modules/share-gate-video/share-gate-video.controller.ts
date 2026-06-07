import { Controller, Get, Query } from '@nestjs/common';
import { ShareGateVideoService } from './share-gate-video.service';

@Controller('share-gate-video')
export class ShareGateVideoPublicController {
  constructor(private readonly shareGateVideos: ShareGateVideoService) {}

  @Get()
  getActive(@Query('type') type?: string) {
    if (!type?.trim()) {
      return null;
    }
    return this.shareGateVideos.findActiveForPublicType(type);
  }
}
