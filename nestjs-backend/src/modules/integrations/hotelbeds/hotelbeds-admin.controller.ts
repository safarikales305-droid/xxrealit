import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../../admin/guards/admin.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { HotelbedsCacheService } from './hotelbeds-cache.service';
import { HotelbedsMetricsService } from './hotelbeds-metrics.service';
import { HotelbedsConfigService } from './hotelbeds.config';
import { HotelbedsService } from './hotelbeds.service';

@Controller('admin/integrations/hotelbeds')
@UseGuards(JwtAuthGuard, AdminGuard)
export class HotelbedsAdminController {
  constructor(
    private readonly hotelbeds: HotelbedsService,
    private readonly config: HotelbedsConfigService,
    private readonly cache: HotelbedsCacheService,
    private readonly metrics: HotelbedsMetricsService,
  ) {}

  @Get('status')
  status() {
    return {
      ...this.config.publicStatus(),
      metrics: this.metrics.snapshot(this.cache.stats()),
    };
  }

  @Get('metrics')
  metricsSnapshot() {
    return this.metrics.snapshot(this.cache.stats());
  }

  @Get('logs')
  logs(@Query('limit') limit?: string) {
    return { logs: this.metrics.getLogs(Number(limit) || 50) };
  }

  @Post('test')
  testConnection() {
    return this.hotelbeds.testConnection();
  }

  @Post('test-search')
  testSearch() {
    return this.hotelbeds.testSearchHotels();
  }

  @Post('cache/clear')
  clearCache() {
    const removed = this.cache.clear();
    return { success: true, removed };
  }
}
