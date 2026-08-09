import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../../admin/guards/admin.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { HotelbedsCacheService } from './hotelbeds-cache.service';
import { HotelbedsContentSyncService } from './hotelbeds-content-sync.service';
import { HotelbedsDiagnosticsService } from './hotelbeds-diagnostics.service';
import { HotelbedsMetricsService } from './hotelbeds-metrics.service';
import { HotelbedsPublicService } from './hotelbeds-public.service';
import { HotelbedsConfigService } from './hotelbeds.config';
import { HotelbedsService } from './hotelbeds.service';

@Controller('admin/integrations/hotelbeds')
@UseGuards(JwtAuthGuard, AdminGuard)
export class HotelbedsAdminController {
  constructor(
    private readonly hotelbeds: HotelbedsService,
    private readonly publicService: HotelbedsPublicService,
    private readonly diagnostics: HotelbedsDiagnosticsService,
    private readonly config: HotelbedsConfigService,
    private readonly cache: HotelbedsCacheService,
    private readonly metrics: HotelbedsMetricsService,
    private readonly contentSync: HotelbedsContentSyncService,
  ) {}

  @Get('status')
  status() {
    return {
      ...this.config.publicStatus(),
      metrics: this.metrics.snapshot(this.cache.stats()),
      contentDiagnostics: this.metrics.contentDiagnostics(),
    };
  }

  @Get('diagnostics')
  diagnosticsOverview() {
    return this.diagnostics.getOverview();
  }

  @Get('cache')
  cacheInspector() {
    return this.diagnostics.getCacheInspector();
  }

  @Post('diagnose-hotel')
  diagnoseHotel(@Query('hotelCode') hotelCode?: string) {
    const code = Number(hotelCode) || 6741;
    return this.diagnostics.diagnoseHotel(code);
  }

  @Post('diagnose-public-hotels')
  diagnosePublicHotels() {
    return this.diagnostics.diagnosePublicHotels();
  }

  @Get('hotel-debug/:slug')
  async hotelDebug(@Param('slug') slug: string) {
    return this.publicService.getBySlugWithDebug(slug);
  }

  @Get('metrics')
  metricsSnapshot() {
    return this.metrics.snapshot(this.cache.stats());
  }

  @Get('logs')
  logs(@Query('limit') limit?: string) {
    return { logs: this.metrics.getLogs(Number(limit) || 50) };
  }

  @Get('logs/:id')
  logDetail(@Param('id') id: string) {
    const log = this.metrics.getLog(id);
    if (!log) return { log: null };
    return { log };
  }

  @Post('test')
  testConnection() {
    return this.hotelbeds.testConnection();
  }

  @Post('test-search')
  testSearch() {
    return this.hotelbeds.testSearchHotels();
  }

  @Post('test-content')
  testContent(@Query('hotelCode') hotelCode?: string) {
    const code = Number(hotelCode) || 6741;
    return this.publicService.testHotelContent(code);
  }

  @Get('raw-content')
  rawContent(@Query('hotelCode') hotelCode?: string) {
    const code = Number(hotelCode) || 6741;
    return this.publicService.getRawContentDiagnostics(code);
  }

  @Post('sync-content')
  syncContent(@Query('destination') destination?: string) {
    return this.contentSync.syncFromBookingSearch(destination || 'Praha');
  }

  @Post('sync-hotel')
  syncHotel(@Query('hotelCode') hotelCode?: string) {
    const code = Number(hotelCode) || 6741;
    return this.contentSync.syncHotel(code);
  }

  @Post('cache/clear')
  clearCache() {
    const removed = this.cache.clear();
    this.metrics.setContentDiagnostics({
      contentApiPermissionDenied: false,
      contentApiOk: false,
    });
    return { success: true, removed };
  }
}
