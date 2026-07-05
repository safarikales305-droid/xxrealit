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
import { MetaCenterService } from './meta-center.service';
import {
  MetaCenterPixelTestDto,
  UpdateMetaCenterSettingDto,
} from './dto/meta-center.dto';
import type { MetaServiceKey } from './meta-center.defaults';
import { META_SERVICE_KEYS } from './meta-center.defaults';

@Controller('admin/meta-center')
@UseGuards(JwtAuthGuard, AdminGuard)
export class MetaCenterAdminController {
  constructor(private readonly service: MetaCenterService) {}

  @Get('dashboard')
  getDashboard() {
    return this.service.getDashboard();
  }

  @Get('settings')
  getSettings() {
    return this.service.getSettings();
  }

  @Patch('settings')
  updateSettings(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: UpdateMetaCenterSettingDto,
  ) {
    return this.service.updateSettings(dto);
  }

  @Post('test-service/:key')
  testService(@Param('key') key: string) {
    if (!(META_SERVICE_KEYS as readonly string[]).includes(key)) {
      return { ok: false, error: 'Neznámá služba' };
    }
    return this.service.testService(key as MetaServiceKey);
  }

  @Post('diagnostics')
  runDiagnostics() {
    return this.service.runDiagnostics();
  }

  @Post('test-all')
  testAll() {
    return this.service.testAll();
  }

  @Get('pixel')
  getPixel() {
    return this.service.getPixelPanel();
  }

  @Post('pixel/test-event')
  pixelTestEvent(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: MetaCenterPixelTestDto,
  ) {
    return this.service.sendPixelTestEvent(dto.eventType, dto.listingId);
  }

  @Get('capi')
  getCapi() {
    return this.service.getCapiPanel();
  }

  @Patch('capi')
  updateCapi(@Body() body: { toggles?: Record<string, boolean> }) {
    return this.service.updateCapiToggles(body.toggles ?? {});
  }

  @Get('commerce')
  getCommerce() {
    return this.service.getCommercePanel();
  }

  @Get('feeds/stats')
  feedStats() {
    return this.service.getFeedStats();
  }

  @Post('feeds/regenerate')
  regenerateFeeds() {
    return this.service.regenerateFeeds();
  }

  @Post('feeds/validate')
  validateFeed() {
    return this.service.validateFeed();
  }

  @Get('logs')
  listLogs(
    @Query('eventType') eventType?: string,
    @Query('source') source?: string,
    @Query('take') takeRaw?: string,
    @Query('skip') skipRaw?: string,
  ) {
    const take = Number(takeRaw);
    const skip = Number(skipRaw);
    return this.service.listLogs({
      eventType,
      source,
      take: Number.isFinite(take) ? take : undefined,
      skip: Number.isFinite(skip) ? skip : undefined,
    });
  }

  @Get('remarketing')
  getRemarketing() {
    return this.service.getRemarketing();
  }

  @Patch('remarketing')
  updateRemarketing(@Body() body: { audiences: unknown }) {
    return this.service.updateRemarketing(body.audiences);
  }

  @Get('campaigns')
  getCampaigns() {
    return this.service.getCampaignRules();
  }

  @Patch('campaigns')
  updateCampaigns(@Body() body: { rules: unknown }) {
    return this.service.updateCampaignRules(body.rules);
  }

  @Get('ad-formats')
  getAdFormats() {
    return this.service.getAdFormats();
  }

  @Patch('ad-formats')
  updateAdFormats(@Body() body: { flags: Record<string, boolean> }) {
    return this.service.updateAdFormats(body.flags);
  }

  @Get('pixel-mapping')
  getPixelMapping() {
    return this.service.getPixelMapping();
  }

  @Patch('pixel-mapping')
  updatePixelMapping(@Body() body: { mapping: Record<string, string> }) {
    return this.service.updatePixelMapping(body.mapping);
  }
}
