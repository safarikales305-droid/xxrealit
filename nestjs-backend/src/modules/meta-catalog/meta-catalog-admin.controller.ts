import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/guards/admin.guard';
import { MetaCatalogSyncDto, UpdateMetaCatalogSettingDto } from './dto/meta-catalog.dto';
import { MetaCatalogLogService } from './meta-catalog-log.service';
import { MetaCatalogService } from './meta-catalog.service';
import { MetaCatalogFeedService } from './meta-catalog-feed.service';
import { MetaCatalogImageVerifyService } from './meta-catalog-image-verify.service';
import { MetaCatalogSyncService, type SyncMode } from './meta-catalog-sync.service';

@Controller('admin/meta-catalog')
@UseGuards(JwtAuthGuard, AdminGuard)
export class MetaCatalogAdminController {
  constructor(
    private readonly service: MetaCatalogService,
    private readonly feed: MetaCatalogFeedService,
    private readonly sync: MetaCatalogSyncService,
    private readonly logService: MetaCatalogLogService,
    private readonly imageVerify: MetaCatalogImageVerifyService,
  ) {}

  @Get('settings')
  getSettings() {
    return this.service.getAdminSettings();
  }

  @Patch('settings')
  updateSettings(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: UpdateMetaCatalogSettingDto,
  ) {
    return this.service.updateSettings(dto);
  }

  @Get('export-fields')
  getExportFields() {
    return this.service.getExportFieldsConfig();
  }

  @Get('dashboard')
  getDashboard() {
    return this.sync.getDashboard();
  }

  @Get('preview-count')
  previewCount(
    @Query('city') city?: string,
    @Query('propertyType') propertyType?: string,
    @Query('priceMin') priceMin?: string,
    @Query('priceMax') priceMax?: string,
  ) {
    return this.service.previewCount({
      city,
      propertyType,
      priceMin: this.service.parsePrice(priceMin),
      priceMax: this.service.parsePrice(priceMax),
    });
  }

  @Get('preview/:propertyId')
  previewItem(@Param('propertyId') propertyId: string) {
    return this.feed.previewItem(propertyId);
  }

  @Get('listings')
  listListings(
    @Query('city') city?: string,
    @Query('propertyType') propertyType?: string,
    @Query('priceMin') priceMin?: string,
    @Query('priceMax') priceMax?: string,
    @Query('search') search?: string,
    @Query('take') takeRaw?: string,
  ) {
    const take = Number(takeRaw);
    return this.service.listAdminListings({
      city,
      propertyType,
      priceMin: this.service.parsePrice(priceMin),
      priceMax: this.service.parsePrice(priceMax),
      search,
      take: Number.isFinite(take) ? take : 50,
    });
  }

  @Get('exported-listings')
  exportedListings(@Query('filter') filter?: string) {
    return this.sync.listExportedListings(filter);
  }

  @Get('sync-history')
  syncHistory(@Query('take') takeRaw?: string) {
    const take = Number(takeRaw);
    return this.sync.getSyncHistory(Number.isFinite(take) ? take : 50);
  }

  @Get('sync-history/:id')
  syncHistoryDetail(@Param('id') id: string) {
    return this.sync.getSyncRunDetail(id);
  }

  @Post('sync')
  runSync(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: MetaCatalogSyncDto,
  ) {
    const mode = (dto.mode ?? 'full') as SyncMode;
    return this.sync.runSync(mode);
  }

  @Post('sync/now')
  syncNow() {
    return this.sync.runSync('full');
  }

  @Post('sync/delta')
  syncDelta() {
    return this.sync.runSync('delta');
  }

  @Post('sync/repair')
  syncRepair() {
    return this.sync.runSync('repair');
  }

  @Post('sync/refresh')
  syncRefresh() {
    return this.sync.runSync('refresh');
  }

  @Post('sync/clear-cache')
  clearCache() {
    return this.sync.runSync('clear-cache');
  }

  @Post('sync/regenerate')
  regenerateFeed() {
    return this.sync.runSync('regenerate');
  }

  @Post('sync/restart')
  restartSync() {
    return this.sync.runSync('restart');
  }

  @Get('quality')
  qualityReport() {
    return this.sync.getQualityReport();
  }

  @Get('image-diagnostics')
  imageDiagnostics() {
    return this.imageVerify.getListingImageDiagnostics();
  }

  @Post('verify-images')
  verifyImages() {
    return this.imageVerify.verifyAllFeedImages();
  }

  @Get('statistics')
  statistics() {
    return this.sync.getStatistics();
  }

  @Post('test-meta')
  testMeta() {
    return this.sync.testMeta();
  }

  @Get('logs')
  logs(@Query('take') takeRaw?: string) {
    const take = Number(takeRaw);
    return this.logService.listRecent(Number.isFinite(take) ? take : 100);
  }

  @Get('carousel-export')
  carouselExport(
    @Query('city') city?: string,
    @Query('propertyType') propertyType?: string,
    @Query('priceMin') priceMin?: string,
    @Query('priceMax') priceMax?: string,
    @Query('ids') idsRaw?: string,
  ) {
    const ids = idsRaw
      ? idsRaw.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;
    return this.service.buildCarouselJson({
      city,
      propertyType,
      priceMin: this.service.parsePrice(priceMin),
      priceMax: this.service.parsePrice(priceMax),
      ids,
    });
  }
}
