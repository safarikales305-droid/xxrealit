import { Controller, Get, Query } from '@nestjs/common';
import { MetaPublicUrlHealthService } from './meta-public-url-health.service';

@Controller('public/health')
export class PublicHealthController {
  constructor(private readonly metaUrlHealth: MetaPublicUrlHealthService) {}

  @Get('meta-url')
  checkMetaUrl(@Query('url') url?: string) {
    return this.metaUrlHealth.checkUrl(url);
  }
}
