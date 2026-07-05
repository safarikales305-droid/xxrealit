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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { MetaCenterService } from './meta-center.service';
import {
  MetaCenterPixelTestDto,
  UpdateMetaCenterSettingDto,
} from './dto/meta-center.dto';
import type { MetaServiceKey } from './meta-center.defaults';
import { META_SERVICE_KEYS } from './meta-center.defaults';
import { MetaConnectOAuthService } from './meta-connect-oauth.service';
import { MetaConnectDiagnosticsService } from './meta-connect-diagnostics.service';
import { MetaConnectProvisionService } from './meta-connect-provision.service';
import { MetaConnectEventsService } from './meta-connect-events.service';
import { MetaConnectSyncCronService } from './meta-connect-sync.cron.service';

@Controller('admin/meta-center')
@UseGuards(JwtAuthGuard, AdminGuard)
export class MetaCenterAdminController {
  constructor(
    private readonly service: MetaCenterService,
    private readonly connectOAuth: MetaConnectOAuthService,
    private readonly connectDiagnostics: MetaConnectDiagnosticsService,
    private readonly connectProvision: MetaConnectProvisionService,
    private readonly connectEvents: MetaConnectEventsService,
    private readonly connectSync: MetaConnectSyncCronService,
  ) {}

  @Get('connect/url')
  async connectUrl(@CurrentUser() user: AuthUser) {
    const url = await this.connectOAuth.buildConnectUrl(user.id);
    return { url };
  }

  @Get('connection/status')
  connectionStatus() {
    return this.service.getConnectionStatus();
  }

  @Post('connection/sync')
  async connectionSync() {
    return this.connectSync.runSyncNow();
  }

  @Post('connection/fix/:action')
  fixConnection(@Param('action') action: string) {
    return this.connectDiagnostics.applyFix(action);
  }

  @Post('provision/:resource')
  async provision(@Param('resource') resource: string) {
    switch (resource) {
      case 'pixel':
        return this.connectProvision.createPixel();
      case 'catalog':
        return this.connectProvision.createCatalog();
      case 'dataset':
        return this.connectProvision.createDataset();
      case 'commerce':
        return this.connectProvision.createCommerce();
      case 'audience':
        return this.connectProvision.createRemarketingAudience();
      case 'capi':
        return this.connectProvision.activateConversionsApi();
      default:
        return { ok: false, error: 'Neznámý prostředek' };
    }
  }

  @Get('api-logs')
  apiLogs(@Query('take') takeRaw?: string) {
    const take = Number(takeRaw);
    return this.service.listApiLogs(Number.isFinite(take) ? take : 50);
  }

  @Post('events/test-all')
  testAllEvents() {
    return this.connectEvents.testAllEvents();
  }

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
    return this.connectDiagnostics.runFullDiagnostics();
  }

  @Post('test-all')
  async testAll() {
    const [diagnostics, events] = await Promise.all([
      this.connectDiagnostics.runFullDiagnostics(),
      this.connectEvents.testAllEvents(),
    ]);
    return {
      diagnostics,
      events,
      testedAt: new Date().toISOString(),
    };
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
    return this.connectEvents.sendTestEvent(dto.eventType, dto.listingId);
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
