import {
  Body,
  Controller,
  Delete,
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
import { MetaCenterAssetsService } from './meta-center-assets.service';
import { FacebookConfigService } from '../social/facebook/facebook-config.service';
import { FacebookAuthService } from '../social/facebook/facebook-auth.service';
import { MetaCenterApiLogService } from './meta-center-api-log.service';
import { MetaMarketingDiagnosticsService } from './meta-marketing-diagnostics.service';
import { MetaCenterCampaignsService } from './meta-center-campaigns.service';
import { MetaCatalogSalesAssetsVerifyService } from './meta-catalog-sales-assets-verify.service';
import { MetaCenterGeoService } from './meta-center-geo.service';
import { MetaCenterRemarketingService } from './meta-center-remarketing.service';
import { CreateMetaCampaignDto } from './dto/create-meta-campaign.dto';
import { CreateMetaRemarketingAudienceDto } from './dto/create-meta-remarketing-audience.dto';
import { MetaCampaignControlDto } from './dto/meta-campaign-control.dto';
import {
  MetaCampaignBodyPipe,
  OptionalMetaCampaignBodyPipe,
} from './meta-campaign-body.pipe';
import { emptyMetaCampaignLaunchResult, emptyMetaCampaignAdSetPayloadPreviewResult, emptyMetaAdSetProbeResult } from './meta-campaign-api-payload.util';
import { extractSafeMetaError, metaPanelNotConfigured } from './meta-center-safe-response.util';
import { resolveMetaOAuthFlow } from './meta-oauth-flows';
import { META_EXTERNAL_LINKS } from './meta-graph-permissions.util';

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
    private readonly fbConfig: FacebookConfigService,
    private readonly facebookAuth: FacebookAuthService,
    private readonly assets: MetaCenterAssetsService,
    private readonly apiLog: MetaCenterApiLogService,
    private readonly marketingOAuthDiagnostics: MetaMarketingDiagnosticsService,
    private readonly campaigns: MetaCenterCampaignsService,
    private readonly catalogSalesAssetsVerify: MetaCatalogSalesAssetsVerifyService,
    private readonly geo: MetaCenterGeoService,
    private readonly remarketing: MetaCenterRemarketingService,
  ) {}

  private async safeEndpoint<T extends Record<string, unknown>>(
    endpoint: string,
    handler: () => Promise<T>,
    fallback: (message: string) => T,
  ): Promise<T> {
    try {
      return await handler();
    } catch (err) {
      const detail = await this.apiLog.logInternalError(endpoint, err);
      return fallback(detail.message);
    }
  }

  @Get('apps')
  getAppsConfig() {
    return this.fbConfig.getAppsConfig();
  }

  @Get('login/oauth-url')
  async loginOAuthUrl() {
    const url = await this.facebookAuth.buildLoginUrl();
    return { url, redirectUri: this.fbConfig.resolveLoginOAuthRedirectUriOptional() };
  }

  @Get('oauth/flows')
  async oauthFlows() {
    return { flows: await this.connectOAuth.buildOAuthFlowsDiagnostics() };
  }

  @Get('oauth/login')
  async oauthLogin(@CurrentUser() user: AuthUser) {
    const preview = await this.connectOAuth.buildOAuthUrl(user.id, 'login', false);
    return { url: preview.facebookOAuthUrl, ...preview };
  }

  @Get('oauth/pages')
  async oauthPages(@CurrentUser() user: AuthUser) {
    const preview = await this.connectOAuth.buildOAuthUrl(user.id, 'pages', false);
    return { url: preview.facebookOAuthUrl, ...preview };
  }

  @Get('oauth/catalog')
  async oauthCatalog(@CurrentUser() user: AuthUser) {
    const preview = await this.connectOAuth.buildOAuthUrl(user.id, 'catalog', false);
    return { url: preview.facebookOAuthUrl, ...preview };
  }

  @Get('oauth/instagram')
  async oauthInstagram(@CurrentUser() user: AuthUser) {
    const preview = await this.connectOAuth.buildOAuthUrl(user.id, 'instagram', false);
    return { url: preview.facebookOAuthUrl, ...preview };
  }

  @Get('oauth/whatsapp')
  async oauthWhatsapp(@CurrentUser() user: AuthUser) {
    const preview = await this.connectOAuth.buildOAuthUrl(user.id, 'whatsapp', false);
    return { url: preview.facebookOAuthUrl, ...preview };
  }

  @Get('oauth/marketing')
  async oauthMarketing(@CurrentUser() user: AuthUser) {
    await this.marketingOAuthDiagnostics.logMarketingAppSnapshot(user.id, 'oauth/marketing');
    const result = await this.connectOAuth.buildOAuthUrlSafe(user.id, 'marketing', false);
    if (!result.success) {
      return {
        success: false,
        message: result.message,
        url: null,
        scopeWarnings: result.scopeWarnings ?? [],
      };
    }
    return { success: true, url: result.url, ...result.preview };
  }

  /** @deprecated Použijte oauth/marketing */
  @Get('oauth/ads')
  async oauthAds(@CurrentUser() user: AuthUser) {
    return this.oauthMarketing(user);
  }

  @Get('oauth/redirect-diagnostics')
  oauthRedirectDiagnostics() {
    return this.fbConfig.getMetaOAuthRedirectDiagnostics();
  }

  @Get('connect/url')
  async connectUrl(@CurrentUser() user: AuthUser) {
    const [url, oauthRedirect, oauthPreview] = await Promise.all([
      this.connectOAuth.buildConnectUrl(user.id, 'pages'),
      Promise.resolve(this.fbConfig.getMetaOAuthRedirectDiagnostics()),
      this.connectOAuth.buildOAuthPreview(user.id, true, 'pages').catch(() => null),
    ]);
    const reauthorize = await this.connectOAuth.isConnectedForReauthorize(user.id);
    return {
      url,
      oauthFlow: 'pages',
      appId: this.fbConfig.getPagesAppId(),
      redirectUri: oauthRedirect.oauthRedirectUsedByApp,
      oauthRedirect,
      oauthPreview,
      reauthorize,
    };
  }

  @Post('connect/test-oauth')
  async testOAuth(
    @CurrentUser() user: AuthUser,
    @Query('flow') flowRaw?: string,
  ) {
    const flow = resolveMetaOAuthFlow(flowRaw) ?? 'pages';
    return this.connectOAuth.buildOAuthPreview(user.id, true, flow);
  }

  @Get('connection/status')
  connectionStatus() {
    return this.safeEndpoint(
      'connection/status',
      () => this.service.getConnectionStatus(),
      (message) =>
        ({
          ok: false as const,
          status: 'not_configured' as const,
          message,
          settings: this.service.getDashboardEmergencyFallback(message).settings,
          apps: this.fbConfig.getAppsConfig(),
          checklist: [],
          diagnostics: [],
          connectedAt: null,
          lastSyncAt: null,
          error: extractSafeMetaError(new Error(message), 'connection/status'),
        }) as Awaited<ReturnType<MetaCenterService['getConnectionStatus']>>,
    );
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

  @Get('oauth/last-callback')
  async oauthLastCallback() {
    const [lastCallback, oauthCompleted] = await Promise.all([
      this.connectOAuth.getLastOAuthCallback(),
      this.connectOAuth.getOAuthCompletedStatus(),
    ]);
    return { lastCallback, oauthCompleted };
  }

  @Get('oauth/debug')
  oauthDebug(@Query('take') takeRaw?: string) {
    const take = Number(takeRaw);
    return this.connectOAuth.listOAuthDebugLogs(Number.isFinite(take) ? take : 80);
  }

  @Post('oauth/clear-cache')
  async oauthClearCache() {
    return this.connectOAuth.clearOAuthUrlCache();
  }

  @Post('events/test-all')
  testAllEvents() {
    return this.connectEvents.testAllEvents();
  }

  @Get('dashboard')
  async getDashboard(@CurrentUser() user: AuthUser) {
    return this.safeEndpoint(
      'dashboard',
      async () => {
        const [dash, oauthPreview, oauthLast, oauthCompleted, oauthFlows] = await Promise.all([
          this.service.getDashboard(),
          this.connectOAuth.buildOAuthPreview(user.id, true, 'pages').catch(() => null),
          this.connectOAuth.getLastOAuthCallback().catch(() => null),
          this.connectOAuth.getOAuthCompletedStatus().catch(() => ({
            completed: false,
            reason: null,
            at: null,
          })),
          this.connectOAuth.buildOAuthFlowsDiagnostics().catch(() => []),
        ]);
        return {
          ...dash,
          oauthPreview,
          lastOAuthCallback: oauthLast,
          oauthCompleted,
          oauthFlows,
        };
      },
      (message) => ({
        ...this.service.getDashboardEmergencyFallback(message),
        oauthPreview: null,
        lastOAuthCallback: null,
        oauthCompleted: { completed: false, reason: message, at: null },
        oauthFlows: [] as Awaited<ReturnType<MetaConnectOAuthService['buildOAuthFlowsDiagnostics']>>,
      }),
    );
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

  @Post('permissions/check')
  checkPermissions() {
    return this.service.checkGraphPermissions();
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

  @Get('datasets')
  listDatasets() {
    return this.safeEndpoint('datasets', () => this.assets.listDatasets(), (message) => ({
      ok: false as const,
      status: 'not_configured' as const,
      message,
      items: [] as [],
      activeDatasetId: null,
      businessId: null,
      canSelect: false,
      error: extractSafeMetaError(new Error(message), 'datasets'),
    }));
  }

  @Post('datasets/select')
  selectDataset(@Body() body: { datasetId: string }) {
    return this.assets.selectDataset(body.datasetId ?? '');
  }

  @Get('catalog/list')
  listCatalogs() {
    return this.safeEndpoint('catalog/list', () => this.assets.listCatalogs(), (message) => ({
      ok: false as const,
      status: 'not_configured' as const,
      message,
      items: [] as [],
      activeCatalogId: null,
      scopeInfo: '',
      error: extractSafeMetaError(new Error(message), 'catalog/list'),
    }));
  }

  @Get('catalog/panel')
  catalogPanel() {
    return this.safeEndpoint('catalog/panel', () => this.assets.getCatalogPanel(), (message) => ({
      ...metaPanelNotConfigured(message, {
        commerceOnline: false,
        catalogOnline: false,
        commerceManagerUrl: META_EXTERNAL_LINKS.commerceManager,
        catalogsUrl: META_EXTERNAL_LINKS.catalogs,
      }),
      error: extractSafeMetaError(new Error(message), 'catalog/panel'),
    }));
  }

  @Get('catalog/products')
  catalogProducts(@Query('take') takeRaw?: string) {
    const take = Number(takeRaw);
    return this.assets.listCatalogProducts(Number.isFinite(take) ? take : 50);
  }

  @Post('catalog/connect')
  connectCatalog(@Body() body: { catalogId: string }) {
    return this.assets.connectExistingCatalog(body.catalogId ?? '');
  }

  @Post('catalog/create')
  createCatalog() {
    return this.assets.createCatalogAsset();
  }

  @Post('catalog/sync')
  syncCatalog() {
    return this.assets.syncCatalogFeed();
  }

  @Get('ad-account')
  adAccountPanel(@CurrentUser() user: AuthUser) {
    return this.safeEndpoint(
      'ad-account',
      () => this.assets.getAdAccountPanel(user.id),
      (message) =>
        ({
          ok: false as const,
          status: 'not_configured' as const,
          message,
          connected: false,
          optional: true,
          adAccountId: null,
          name: null,
          currency: null,
          timezone: null,
          error: extractSafeMetaError(new Error(message), 'ad-account'),
        }) as Awaited<ReturnType<MetaCenterAssetsService['getAdAccountPanel']>>,
    );
  }

  @Get('ad-accounts')
  listAdAccounts(@CurrentUser() user: AuthUser) {
    return this.safeEndpoint('ad-accounts', () => this.assets.listAdAccounts(user.id), (message) => ({
      ok: false as const,
      status: 'not_configured' as const,
      message:
        message ||
        'Reklamní účet není připojený nebo token nemá ads_read/ads_management.',
      items: [] as [],
      activeAdAccountId: null,
      error: extractSafeMetaError(new Error(message), 'ad-accounts'),
    }));
  }

  @Post('ad-account/select')
  selectAdAccount(@Body() body: { adAccountId: string }) {
    return this.assets.selectAdAccount(body.adAccountId ?? '');
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

  @Post('marketing/diagnostics')
  runMarketingDiagnostics(@CurrentUser() user: AuthUser) {
    return this.marketingOAuthDiagnostics.runFullMarketingDiagnostics(user.id);
  }

  @Get('remarketing')
  getRemarketing() {
    return this.service.getRemarketing();
  }

  @Patch('remarketing')
  updateRemarketing(@Body() body: { audiences: unknown }) {
    return this.service.updateRemarketing(body.audiences);
  }

  @Get('remarketing/audiences')
  listRemarketingAudiences() {
    return this.safeEndpoint(
      'remarketing/audiences',
      () => this.remarketing.listAudiences(),
      (message) => ({
        ok: true as const,
        items: [],
        audienceTypes: [],
        retentionDayOptions: [7, 14, 30, 60, 90, 180],
        message,
      }),
    );
  }

  @Post('remarketing/audiences')
  async createRemarketingAudience(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    body: CreateMetaRemarketingAudienceDto,
  ) {
    try {
      return await this.remarketing.createAudience({
        name: body.name,
        audienceType: body.audienceType,
        filters: {
          ...(body.filters ?? {}),
          retentionDays: body.retentionDays ?? body.filters?.retentionDays ?? 30,
        },
      });
    } catch (err) {
      const detail = await this.apiLog.logInternalError('remarketing/audiences', err);
      return { ok: false as const, message: detail.message };
    }
  }

  @Post('remarketing/audiences/:id/sync')
  syncRemarketingAudience(@Param('id') id: string) {
    return this.safeEndpoint(
      'remarketing/audiences/sync',
      () => this.remarketing.syncAudience(id),
      (message) => ({ ok: false as const, message, audience: undefined }),
    );
  }

  @Get('campaign-products')
  listCampaignProducts() {
    return this.safeEndpoint(
      'campaign-products',
      () => this.campaigns.listCampaignProducts(),
      (message) => ({ ok: true as const, items: [], message }),
    );
  }

  @Get('campaigns/creative-sources/posts')
  listCreativeSourcePosts(@Query('source') source?: string, @Query('take') takeRaw?: string) {
    const take = Number(takeRaw);
    return this.safeEndpoint(
      'campaigns/creative-sources/posts',
      () => this.campaigns.listCreativeSourcePosts(source, Number.isFinite(take) ? take : 40),
      (message) => ({ ok: false as const, items: [], message }),
    );
  }

  @Get('campaigns/geo/search')
  searchCampaignGeo(@Query('q') q?: string, @Query('country') country?: string) {
    return this.safeEndpoint(
      'campaigns/geo/search',
      () => this.geo.searchCities(q ?? '', country?.trim() || 'CZ'),
      (message) => ({ ok: false as const, items: [], message }),
    );
  }

  @Get('campaigns/live-mode')
  getCampaignsLiveMode() {
    return this.campaigns.getLiveMode();
  }

  @Get('campaigns/overview')
  listCampaignsOverview() {
    return this.safeEndpoint(
      'campaigns/overview',
      () => this.campaigns.listCampaignsOverview(),
      (message) => ({ ok: false as const, items: [], message }),
    );
  }

  @Get('campaigns/list')
  listMetaCampaignDrafts() {
    return this.safeEndpoint(
      'campaigns/list',
      () => this.campaigns.listCampaignDrafts(),
      (message) => ({
        ok: false as const,
        items: [],
        message: message || 'Koncepty nelze načíst.',
      }),
    );
  }

  @Get('campaigns/drafts/:id')
  getMetaCampaignDraft(@Param('id') id: string) {
    return this.safeEndpoint(
      'campaigns/drafts',
      () => this.campaigns.getCampaignDraft(id),
      (message) => ({ ok: false as const, message, campaign: null }),
    );
  }

  @Patch('campaigns/drafts/:id')
  updateMetaCampaignDraft(
    @Param('id') id: string,
    @Body(MetaCampaignBodyPipe) body: CreateMetaCampaignDto,
  ) {
    return this.safeEndpoint(
      'campaigns/drafts',
      () => this.campaigns.updateCampaignDraft(id, body),
      (message) => ({
        ok: false as const,
        status: 'error' as const,
        message,
        campaign: null,
      }),
    );
  }

  @Delete('campaigns/drafts/:id')
  deleteMetaCampaignDraft(@Param('id') id: string) {
    return this.safeEndpoint(
      'campaigns/drafts/delete',
      () => this.campaigns.deleteCampaignDraft(id),
      (message) => ({ ok: false as const, message }),
    );
  }

  @Post('campaigns/drafts/:id/launch')
  launchMetaCampaignDraft(
    @Param('id') id: string,
    @Body(OptionalMetaCampaignBodyPipe) body?: CreateMetaCampaignDto,
  ) {
    return this.safeEndpoint(
      'campaigns/drafts/launch',
      () => this.campaigns.launchExistingDraft(id, body),
      (message) => ({
        ok: false as const,
        status: 'error' as const,
        message,
        campaign: null,
      }),
    );
  }

  @Post('campaigns/drafts/:id/complete-ad')
  completeMetaCampaignAd(@Param('id') id: string) {
    return this.safeEndpoint(
      'campaigns/drafts/complete-ad',
      () => this.campaigns.completeAdOnly(id),
      (message) => ({
        ok: false as const,
        status: 'error' as const,
        message,
        campaign: null,
      }),
    );
  }

  @Post('campaigns/drafts/:id/preflight')
  preflightMetaCampaignDraft(@Param('id') id: string) {
    return this.safeEndpoint(
      'campaigns/drafts/preflight',
      () => this.campaigns.runPreflightForDraft(id),
      (message) => ({ ok: false, message, checks: [], campaign: null }),
    );
  }

  @Post('campaigns/drafts/:id/probe-ad')
  probeMetaCampaignAd(@Param('id') id: string) {
    return this.safeEndpoint(
      'campaigns/drafts/probe-ad',
      () => this.campaigns.probeAdCreate(id),
      (message) => ({
        ok: false as const,
        message,
        securityBlock: false,
        launchSteps: null,
      }),
    );
  }

  @Post('campaigns/drafts/:id/reset-meta-launch')
  resetMetaCampaignLaunch(@Param('id') id: string) {
    return this.safeEndpoint(
      'campaigns/drafts/reset-meta-launch',
      () => this.campaigns.resetPartialMetaLaunch(id),
      (message) => ({ ok: false as const, message, campaign: null }),
    );
  }

  @Post('campaigns/drafts/:id/duplicate')
  duplicateMetaCampaignDraft(@Param('id') id: string) {
    return this.safeEndpoint(
      'campaigns/drafts/duplicate',
      () => this.campaigns.duplicateCampaignDraft(id),
      (message) => ({ ok: false as const, message, campaign: null }),
    );
  }

  @Post('campaigns/drafts/:id/sync')
  syncMetaCampaignDraft(@Param('id') id: string) {
    return this.safeEndpoint(
      'campaigns/drafts/sync',
      () => this.campaigns.syncDraftFromMeta(id),
      (message) => ({ ok: false as const, message, campaign: null }),
    );
  }

  @Post('campaigns/drafts/:id/control')
  controlMetaCampaignDraft(
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    body: MetaCampaignControlDto,
  ) {
    return this.safeEndpoint(
      'campaigns/drafts/control',
      () => this.campaigns.controlCampaign(id, body.action),
      (message) => ({ ok: false as const, message }),
    );
  }

  @Post('campaigns/payload-preview')
  previewCampaignPayloads(@Body(MetaCampaignBodyPipe) body: CreateMetaCampaignDto) {
    return this.safeEndpoint(
      'campaigns/payload-preview',
      () => this.campaigns.previewCampaignPayloads(body),
      (message) => emptyMetaCampaignLaunchResult(message),
    );
  }

  @Post('campaigns/adset-payload')
  previewAdSetPayload(@Body(MetaCampaignBodyPipe) body: CreateMetaCampaignDto) {
    return this.safeEndpoint(
      'campaigns/adset-payload',
      () => this.campaigns.previewAdSetPayload(body),
      (message) => emptyMetaCampaignAdSetPayloadPreviewResult(message),
    );
  }

  @Get('campaigns/verify-catalog-assets')
  verifyCatalogSalesAssets() {
    return this.safeEndpoint(
      'campaigns/verify-catalog-assets',
      () => this.catalogSalesAssetsVerify.verifyForCatalogSalesLaunch(),
      (message) => ({
        ok: false,
        message,
        canUseConversionOptimization: false,
        catalogLaunchMode: 'traffic' as const,
        verifiedPixelId: null,
        configuredPixelId: null,
        configuredDatasetId: null,
        promotedObjectPixelId: null,
        eventSource: {
          configuredDatasetId: null,
          configuredPixelId: null,
          catalogEventSources: [],
          catalogPixelIds: [],
          resolvedPixelId: null,
          resolvedEventSourceType: 'NONE' as const,
          promotedObjectPixelId: null,
          promotedObjectCustomEventType: null,
          canUseConversionOptimization: false,
        },
        checks: [],
        assets: {
          business: null,
          adAccount: null,
          catalog: null,
          dataset: null,
          pixel: null,
          page: null,
          instagram: null,
        },
      }),
    );
  }

  @Get('campaigns/instagram-identity')
  getInstagramIdentityStatus() {
    return this.safeEndpoint(
      'campaigns/instagram-identity',
      () => this.campaigns.getInstagramIdentityStatus(),
      (message) => ({
        instagramBusinessId: null,
        instagramUsername: null,
        linkedPageId: null,
        linkedAdAccountId: null,
        usableForAds: false,
        connected: false,
        source: 'none' as const,
        message,
      }),
    );
  }

  @Post('campaigns/adset-probe')
  probeAdSetCreate(
    @Body(MetaCampaignBodyPipe) body: CreateMetaCampaignDto,
    @Query('draftId') draftId?: string,
    @Query('campaignId') campaignId?: string,
  ) {
    return this.safeEndpoint(
      'campaigns/adset-probe',
      () =>
        this.campaigns.probeAdSetCreate(body, {
          draftId: draftId?.trim() || undefined,
          campaignId: campaignId?.trim() || undefined,
        }),
      (message) => emptyMetaAdSetProbeResult(message),
    );
  }

  @Post('campaigns')
  createMetaCampaign(
    @Body(MetaCampaignBodyPipe) body: CreateMetaCampaignDto,
    @Query('mode') mode?: string,
  ) {
    const launchMode = mode === 'launch' ? 'launch' : 'draft';
    return this.safeEndpoint(
      'campaigns',
      () => this.campaigns.createCampaign(body, launchMode),
      (message) => ({
        ok: false as const,
        status: 'error' as const,
        message,
        campaign: null,
      }),
    );
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
