import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { FacebookConfigService } from '../social/facebook/facebook-config.service';
import { MetaCatalogService } from '../meta-catalog/meta-catalog.service';
import { WhatsAppConfigService } from '../whatsapp/whatsapp-config.service';
import { getPublicPortalUrl } from '../social/autopost/social-publish-format.util';
import type { UpdateMetaCenterSettingDto } from './dto/meta-center.dto';
import {
  DEFAULT_AD_FORMAT_FLAGS,
  DEFAULT_AUTO_CAMPAIGN_RULES,
  DEFAULT_CAPI_TOGGLES,
  DEFAULT_PIXEL_MAPPING,
  DEFAULT_REMARKETING_AUDIENCES,
  GRAPH_API_VERSION_DEFAULT,
  META_SERVICE_KEYS,
  META_SERVICE_LABELS,
  type MetaCapiEventKey,
  type MetaDiagnosticLevel,
  type MetaServiceKey,
} from './meta-center.defaults';
import {
  META_CAPI_OPTIONAL_MESSAGE,
  META_DATASET_V21_MESSAGE,
  META_PIXEL_PLACEHOLDER_MESSAGE,
  hasMetaEventTracking,
  hasMetaCapiReady,
  hasPlaceholderPixelEnv,
  resolveMetaCenterIds,
  resolveMetaTrackingMode,
} from './meta-center-env.util';
import { isMarketingAdsTokenActive } from './meta-marketing-token.util';
import type { MetaConnectionCheck } from './meta-connect.constants';
import {
  MetaCenterGraphDiagnosticsService,
  type MetaCatalogGraphDiagnostics,
} from './meta-center-graph-diagnostics.service';
import { MetaCenterIntegrationStatusService } from './meta-center-integration-status.service';
import { diagnosticLevelFromIssue } from './meta-graph-permissions.util';

const SETTINGS_ID = 'default';

type ServiceCardStatus = 'online' | 'offline' | 'optional' | 'warning';

type ServiceStatusRow = {
  status: ServiceCardStatus;
  lastSyncAt: string | null;
  createdAt: string;
  graphApiVersion: string;
};

type DiagnosticItem = {
  key: string;
  label: string;
  level: MetaDiagnosticLevel;
  message: string;
};

@Injectable()
export class MetaCenterService {
  private readonly logger = new Logger(MetaCenterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fbConfig: FacebookConfigService,
    private readonly catalog: MetaCatalogService,
    private readonly graphDiagnostics: MetaCenterGraphDiagnosticsService,
    private readonly integration: MetaCenterIntegrationStatusService,
    private readonly waConfig: WhatsAppConfigService,
  ) {}

  private maskSecret(value: string | null | undefined): string | null {
    if (!value?.trim()) return null;
    const v = value.trim();
    if (v.length <= 4) return '••••';
    return `••••${v.slice(-4)}`;
  }

  private parseJson<T>(raw: Prisma.JsonValue | null, fallback: T): T {
    if (raw == null) return fallback;
    return raw as T;
  }

  private toInputJsonValue(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private toNullableJsonUpdate(
    value: unknown | undefined,
  ): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
    if (value === undefined) return undefined;
    if (value === null) return Prisma.JsonNull;
    return this.toInputJsonValue(value);
  }

  private optionalJsonLogValue(value: unknown | undefined): Prisma.InputJsonValue | undefined {
    if (value === undefined) return undefined;
    return this.toInputJsonValue(value);
  }

  private async getOrCreateSettings() {
    const existing = await this.prisma.metaCenterSetting.findUnique({
      where: { id: SETTINGS_ID },
    });
    if (existing) return existing;
    return this.prisma.metaCenterSetting.create({
      data: {
        id: SETTINGS_ID,
        capiEventToggles: this.toInputJsonValue(DEFAULT_CAPI_TOGGLES),
        pixelMapping: this.toInputJsonValue(DEFAULT_PIXEL_MAPPING),
        remarketingAudiences: this.toInputJsonValue(DEFAULT_REMARKETING_AUDIENCES),
        autoCampaignRules: this.toInputJsonValue(DEFAULT_AUTO_CAMPAIGN_RULES),
        adFormatFlags: this.toInputJsonValue(DEFAULT_AD_FORMAT_FLAGS),
        serviceStatus: this.toInputJsonValue({}),
      },
    });
  }

  private resolveUrls(row: Awaited<ReturnType<MetaCenterService['getOrCreateSettings']>>) {
    const origin = getPublicPortalUrl();
    const frontend = row.frontendUrl?.trim() || this.fbConfig.resolveFrontendUrl();
    const backend =
      row.backendUrl?.trim() ||
      this.fbConfig.resolveBackendUrl() ||
      process.env.API_URL?.trim() ||
      process.env.NEXT_PUBLIC_API_URL?.trim() ||
      '';
    const metaConnect =
      this.fbConfig.tryGetMetaRedirectUri() ||
      row.redirectUri?.trim() ||
      '';
    const callback = row.callbackUrl?.trim() || metaConnect;
    return { frontend, backend, redirect: metaConnect, callback, origin };
  }

  serializeSettings(row: Awaited<ReturnType<MetaCenterService['getOrCreateSettings']>>) {
    const urls = this.resolveUrls(row);
    const apps = this.fbConfig.getAppsConfig();
    return {
      id: row.id,
      facebookAppId: row.facebookAppId ?? apps.login.appId,
      facebookAppSecretMasked:
        this.maskSecret(row.facebookAppSecret) ?? apps.login.appSecretMasked,
      facebookPagesAppId: row.facebookPagesAppId ?? apps.pages.appId,
      facebookPagesSecretMasked:
        this.maskSecret(row.facebookPagesSecret) ?? apps.pages.appSecretMasked,
      facebookMarketingAppId: row.facebookMarketingAppId ?? apps.marketing.appId,
      facebookMarketingSecretMasked:
        this.maskSecret(row.facebookMarketingSecret) ?? apps.marketing.appSecretMasked,
      businessManagerId: row.businessManagerId,
      commerceManagerId: row.commerceManagerId,
      catalogId: row.catalogId,
      datasetId: row.datasetId,
      pixelId: row.pixelId,
      pixelName: row.pixelName,
      conversionsApiTokenMasked: this.maskSecret(row.conversionsApiToken),
      webhookVerifyTokenMasked: this.maskSecret(row.webhookVerifyToken),
      webhookSecretMasked: this.maskSecret(row.webhookSecret),
      frontendUrl: urls.frontend,
      backendUrl: urls.backend || apps.backendUrl || '',
      redirectUri: urls.redirect || apps.pages.metaConnectRedirectUri || '',
      callbackUrl: urls.callback || apps.pages.metaConnectRedirectUri || '',
      loginOAuthRedirectUri: apps.login.oauthRedirectUri,
      metaConnectRedirectUri: apps.pages.metaConnectRedirectUri,
      pageConnectRedirectUri: apps.pages.pageConnectRedirectUri,
      facebookApps: apps,
      encryptionKeyMasked: this.maskSecret(row.encryptionKey),
      graphApiVersion: row.graphApiVersion || GRAPH_API_VERSION_DEFAULT,
      domainVerification: row.domainVerification,
      catalogFeedEnabled: row.catalogFeedEnabled,
      capiEventToggles: this.parseJson(row.capiEventToggles, DEFAULT_CAPI_TOGGLES),
      pixelMapping: this.parseJson(row.pixelMapping, DEFAULT_PIXEL_MAPPING),
      remarketingAudiences: this.parseJson(row.remarketingAudiences, DEFAULT_REMARKETING_AUDIENCES),
      autoCampaignRules: this.parseJson(row.autoCampaignRules, DEFAULT_AUTO_CAMPAIGN_RULES),
      adFormatFlags: this.parseJson(row.adFormatFlags, DEFAULT_AD_FORMAT_FLAGS),
      metaConnectedAt: row.metaConnectedAt?.toISOString() ?? null,
      metaConnectedUserId: row.metaConnectedUserId,
      metaConnectedUserName: row.metaConnectedUserName,
      adAccountId: row.adAccountId,
      adAccountName: row.adAccountName,
      pageId: row.pageId,
      pageName: row.pageName,
      instagramBusinessId: row.instagramBusinessId,
      instagramUsername: row.instagramUsername,
      catalogName: row.catalogName,
      commerceAccountId: row.commerceAccountId,
      testEventCode: row.testEventCode,
      whatsappBusinessAccountId: row.whatsappBusinessAccountId,
      whatsappPhoneNumberId: row.whatsappPhoneNumberId,
      lastAutoSyncAt: row.lastAutoSyncAt?.toISOString() ?? null,
      syncEnabled: row.syncEnabled,
      isMetaConnected: Boolean(row.metaConnectedAt && row.metaUserAccessTokenEncrypted),
      isMarketingAdsConnected: isMarketingAdsTokenActive(row),
      marketingRefreshTokenConfigured: Boolean(row.marketingRefreshTokenEncrypted),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async getSettings() {
    const row = await this.getOrCreateSettings();
    return this.serializeSettings(row);
  }

  async updateSettings(dto: UpdateMetaCenterSettingDto) {
    await this.getOrCreateSettings();
    const data: Prisma.MetaCenterSettingUpdateInput = {};
    const assign = <K extends keyof UpdateMetaCenterSettingDto>(key: K) => {
      if (dto[key] !== undefined) (data as Record<string, unknown>)[key] = dto[key];
    };
    [
      'facebookAppId',
      'facebookPagesAppId',
      'businessManagerId',
      'commerceManagerId',
      'catalogId',
      'datasetId',
      'pixelId',
      'pixelName',
      'frontendUrl',
      'backendUrl',
      'redirectUri',
      'callbackUrl',
      'graphApiVersion',
      'domainVerification',
      'catalogFeedEnabled',
    ].forEach((k) => assign(k as keyof UpdateMetaCenterSettingDto));

    if (dto.facebookAppSecret !== undefined) data.facebookAppSecret = dto.facebookAppSecret || null;
    if (dto.facebookPagesSecret !== undefined) data.facebookPagesSecret = dto.facebookPagesSecret || null;
    if (dto.conversionsApiToken !== undefined) data.conversionsApiToken = dto.conversionsApiToken || null;
    if (dto.webhookVerifyToken !== undefined) data.webhookVerifyToken = dto.webhookVerifyToken || null;
    if (dto.webhookSecret !== undefined) data.webhookSecret = dto.webhookSecret || null;
    if (dto.encryptionKey !== undefined) data.encryptionKey = dto.encryptionKey || null;
    if (dto.capiEventToggles !== undefined) {
      data.capiEventToggles = this.toNullableJsonUpdate(dto.capiEventToggles);
    }
    if (dto.pixelMapping !== undefined) {
      data.pixelMapping = this.toNullableJsonUpdate(dto.pixelMapping);
    }
    if (dto.remarketingAudiences !== undefined) {
      data.remarketingAudiences = this.toNullableJsonUpdate(dto.remarketingAudiences);
    }
    if (dto.autoCampaignRules !== undefined) {
      data.autoCampaignRules = this.toNullableJsonUpdate(dto.autoCampaignRules);
    }
    if (dto.adFormatFlags !== undefined) {
      data.adFormatFlags = this.toNullableJsonUpdate(dto.adFormatFlags);
    }

    const row = await this.prisma.metaCenterSetting.update({
      where: { id: SETTINGS_ID },
      data,
    });

    if (dto.catalogFeedEnabled === true) {
      await this.catalog.updateSettings({ enabled: true });
    }

    return { ok: true, settings: this.serializeSettings(row) };
  }

  private serviceCardStatus(
    key: MetaServiceKey,
    row: Awaited<ReturnType<MetaCenterService['getOrCreateSettings']>>,
    fbStatus: ReturnType<FacebookConfigService['getConfigStatus']>,
    catalogEnabled: boolean,
    ids: ReturnType<typeof resolveMetaCenterIds>,
    catalogGraph: MetaCatalogGraphDiagnostics,
    socialPageConnected: boolean,
    waConfigured: boolean,
  ): { status: ServiceCardStatus; statusLabel: string; detail?: string } {
    switch (key) {
      case 'meta_pixel':
        if (ids.pixelId) {
          return {
            status: 'online',
            statusLabel: 'Online',
            detail: `Pixel ID ${ids.pixelId}`,
          };
        }
        if (ids.datasetId) {
          return {
            status: 'online',
            statusLabel: 'Dataset (v21+)',
            detail: `${META_DATASET_V21_MESSAGE} Dataset ${ids.datasetId}`,
          };
        }
        return { status: 'optional', statusLabel: 'Nenastaveno (volitelné)' };
      case 'conversions_api':
        if (!ids.capiToken) {
          return { status: 'optional', statusLabel: META_CAPI_OPTIONAL_MESSAGE };
        }
        if (!hasMetaEventTracking(ids)) {
          return {
            status: 'offline',
            statusLabel: 'Offline',
            detail: 'CAPI token je nastaven, ale chybí Pixel ID i Dataset ID.',
          };
        }
        return { status: 'online', statusLabel: 'Online', detail: 'CAPI token nastaven' };
      case 'commerce_manager':
        if (catalogGraph.commerceOnline) {
          return { status: 'online', statusLabel: 'Online', detail: catalogGraph.commerceMessage };
        }
        if (
          catalogGraph.commerceIssueKind === 'missing_permission' ||
          catalogGraph.commerceIssueKind === 'catalog_not_in_app'
        ) {
          return {
            status: 'warning',
            statusLabel: 'Vyžaduje oprávnění',
            detail: catalogGraph.commerceMessage,
          };
        }
        if (
          catalogGraph.commerceIssueKind === 'business_no_catalog' ||
          catalogGraph.commerceIssueKind === 'catalog_not_found' ||
          catalogGraph.commerceIssueKind === 'not_configured'
        ) {
          return {
            status: 'warning',
            statusLabel: 'Konfigurace',
            detail: catalogGraph.commerceMessage,
          };
        }
        return {
          status: 'offline',
          statusLabel: 'Offline',
          detail: catalogGraph.commerceMessage,
        };
      case 'facebook_catalog': {
        const effectiveCatalogId = catalogGraph.catalogId ?? ids.catalogId;
        if (!effectiveCatalogId) {
          return {
            status: 'offline',
            statusLabel: 'Offline',
            detail: 'Chybí FACEBOOK_CATALOG_ID.',
          };
        }
        if (catalogGraph.catalogOnline) {
          return { status: 'online', statusLabel: 'Online', detail: catalogGraph.catalogMessage };
        }
        if (
          catalogGraph.catalogIssueKind === 'missing_permission' ||
          catalogGraph.catalogIssueKind === 'catalog_not_in_app'
        ) {
          return {
            status: 'warning',
            statusLabel: 'Vyžaduje oprávnění',
            detail: catalogGraph.catalogMessage,
          };
        }
        if (
          catalogGraph.catalogIssueKind === 'business_no_catalog' ||
          catalogGraph.catalogIssueKind === 'catalog_not_found' ||
          catalogGraph.catalogIssueKind === 'not_configured'
        ) {
          return {
            status: 'warning',
            statusLabel: 'Konfigurace',
            detail: catalogGraph.catalogMessage,
          };
        }
        return {
          status: 'offline',
          statusLabel: 'Offline',
          detail: catalogGraph.catalogMessage,
        };
      }
      case 'dataset':
        if (!ids.datasetId) {
          return { status: 'optional', statusLabel: 'Nenastaveno (volitelné)' };
        }
        return {
          status: 'online',
          statusLabel: 'Online',
          detail: `Dataset ${ids.datasetId}`,
        };
      default: {
        const online = this.serviceConfigured(
          key,
          row,
          fbStatus,
          catalogEnabled,
          socialPageConnected,
          waConfigured,
        );
        return online
          ? { status: 'online', statusLabel: 'Online' }
          : { status: 'offline', statusLabel: 'Offline' };
      }
    }
  }

  private serviceConfigured(
    key: MetaServiceKey,
    row: Awaited<ReturnType<MetaCenterService['getOrCreateSettings']>>,
    fbStatus: ReturnType<FacebookConfigService['getConfigStatus']>,
    catalogEnabled: boolean,
    socialPageConnected = false,
    waConfigured = false,
  ): boolean {
    switch (key) {
      case 'facebook_app':
        return Boolean(row.facebookAppId || fbStatus.configured);
      case 'facebook_login':
        return fbStatus.configured;
      case 'facebook_pages':
        return fbStatus.pagesConfigured || socialPageConnected;
      case 'instagram_graph':
        return fbStatus.pagesConfigured;
      case 'whatsapp_business':
        return waConfigured || this.waConfig.isCloudApiConfigured();
      case 'meta_pixel':
        return hasMetaEventTracking(resolveMetaCenterIds(row));
      case 'conversions_api':
        return Boolean(resolveMetaCenterIds(row).capiToken && hasMetaEventTracking(resolveMetaCenterIds(row)));
      case 'commerce_manager':
        return Boolean(resolveMetaCenterIds(row).businessId && resolveMetaCenterIds(row).catalogId);
      case 'facebook_catalog':
        return Boolean(resolveMetaCenterIds(row).catalogId);
      case 'dataset':
        return Boolean(resolveMetaCenterIds(row).datasetId);
      case 'xml_feed':
      case 'csv_feed':
      case 'json_feed':
        return catalogEnabled && row.catalogFeedEnabled;
      case 'webhook':
        return Boolean(
          row.webhookVerifyToken ||
            fbStatus.webhookUri ||
            this.integration.getWebhookStatus().connected,
        );
      case 'domain_verification':
        return Boolean(row.domainVerification);
      default:
        return false;
    }
  }

  async buildServiceCards() {
    const row = await this.getOrCreateSettings();
    const fbStatus = this.fbConfig.getConfigStatus();
    const catalog = await this.catalog.getAdminSettings();
    const stored = this.parseJson<Record<string, Partial<ServiceStatusRow>>>(row.serviceStatus, {});
    const graphVersion = row.graphApiVersion || GRAPH_API_VERSION_DEFAULT;
    const ids = resolveMetaCenterIds(row);
    const [catalogGraphRaw, socialPage, wa, catalogEnv] = await Promise.all([
      this.graphDiagnostics.buildCatalogDiagnostics(),
      this.integration.getFacebookPageFromSocialModule(),
      Promise.resolve(this.integration.getWhatsAppStatus()),
      this.integration.getCatalogEnvStatus(),
    ]);
    const catalogGraph: MetaCatalogGraphDiagnostics = {
      ...catalogGraphRaw,
      commerceOnline: catalogGraphRaw.commerceOnline || catalogEnv.commerceOnline,
      catalogOnline: catalogGraphRaw.catalogOnline || catalogEnv.catalogOnline,
      commerceMessage: catalogGraphRaw.commerceOnline
        ? catalogGraphRaw.commerceMessage
        : catalogEnv.commerceMessage,
      catalogMessage: catalogGraphRaw.catalogOnline
        ? catalogGraphRaw.catalogMessage
        : catalogEnv.catalogMessage,
    };

    return META_SERVICE_KEYS.map((key) => {
      const card = this.serviceCardStatus(
        key,
        row,
        fbStatus,
        catalog.enabled,
        ids,
        catalogGraph,
        socialPage.connected,
        wa.configured,
      );
      const prev = stored[key];
      return {
        key,
        label: META_SERVICE_LABELS[key],
        status: card.status,
        statusLabel: card.statusLabel,
        detail: card.detail ?? null,
        lastSyncAt:
          key === 'facebook_catalog'
            ? catalogGraph.lastLocalSync ?? catalog.lastGeneratedAt
            : prev?.lastSyncAt ?? catalog.lastGeneratedAt,
        createdAt: prev?.createdAt ?? row.createdAt.toISOString(),
        graphApiVersion: graphVersion,
      };
    });
  }

  private async touchServiceStatus(key: MetaServiceKey) {
    const row = await this.getOrCreateSettings();
    const stored = this.parseJson<Record<string, Partial<ServiceStatusRow>>>(row.serviceStatus, {});
    stored[key] = {
      status: 'online',
      lastSyncAt: new Date().toISOString(),
      createdAt: stored[key]?.createdAt ?? row.createdAt.toISOString(),
      graphApiVersion: row.graphApiVersion || GRAPH_API_VERSION_DEFAULT,
    };
    await this.prisma.metaCenterSetting.update({
      where: { id: SETTINGS_ID },
      data: { serviceStatus: this.toInputJsonValue(stored) },
    });
  }

  async logEvent(input: {
    eventType: string;
    listingId?: string;
    userId?: string;
    result?: string;
    status?: string;
    response?: unknown;
    request?: unknown;
    source?: string;
  }) {
    return this.prisma.metaCenterEventLog.create({
      data: {
        eventType: input.eventType,
        listingId: input.listingId ?? null,
        userId: input.userId ?? null,
        result: input.result ?? 'ok',
        status: input.status ?? null,
        response: this.optionalJsonLogValue(input.response),
        request: this.optionalJsonLogValue(input.request),
        source: input.source ?? null,
      },
    });
  }

  async testService(key: MetaServiceKey) {
    const row = await this.getOrCreateSettings();
    const fbStatus = this.fbConfig.getConfigStatus();
    const catalog = await this.catalog.getAdminSettings();
    const ids = resolveMetaCenterIds(row);
    const [catalogGraph, socialPage, wa] = await Promise.all([
      this.graphDiagnostics.buildCatalogDiagnostics(),
      this.integration.getFacebookPageFromSocialModule(),
      Promise.resolve(this.integration.getWhatsAppStatus()),
    ]);
    const card = this.serviceCardStatus(
      key,
      row,
      fbStatus,
      catalog.enabled,
      ids,
      catalogGraph,
      socialPage.connected,
      wa.configured,
    );
    const online = card.status === 'online';
    const result =
      card.status === 'optional' || card.status === 'warning'
        ? 'warning'
        : online
          ? 'ok'
          : 'warning';
    const message =
      card.detail ??
      (card.status === 'optional'
        ? `${META_SERVICE_LABELS[key]}: ${card.statusLabel}`
        : online
          ? `${META_SERVICE_LABELS[key]}: ${card.statusLabel}`
          : `${META_SERVICE_LABELS[key]}: ${card.detail ?? 'chybí konfigurace'}`);

    if (online) await this.touchServiceStatus(key);

    await this.logEvent({
      eventType: 'service_test',
      result,
      status: key,
      source: 'diagnostic',
      request: { service: key },
      response: { online, message },
    });

    return { key, online, result, message };
  }

  private levelFromBool(ok: boolean, warn = false): MetaDiagnosticLevel {
    if (ok) return 'ok';
    if (warn) return 'warning';
    return 'error';
  }

  private async checkHttps(url: string | null | undefined, label: string): Promise<DiagnosticItem> {
    if (!url?.trim()) {
      return { key: label, label, level: 'error', message: 'URL není nastavena' };
    }
    const ok = url.startsWith('https://');
    return {
      key: label,
      label,
      level: this.levelFromBool(ok, !ok && url.startsWith('http://')),
      message: ok ? 'HTTPS OK' : 'URL nepoužívá HTTPS',
    };
  }

  async runDiagnostics(): Promise<{ items: DiagnosticItem[]; summary: Record<MetaDiagnosticLevel, number> }> {
    const row = await this.getOrCreateSettings();
    const urls = this.resolveUrls(row);
    const fbStatus = this.fbConfig.getConfigStatus();
    const apps = this.fbConfig.getAppsConfig();
    const ids = resolveMetaCenterIds(row);
    const [catalogGraph, socialPage, wa, webhook, apiPing] = await Promise.all([
      this.graphDiagnostics.buildCatalogDiagnostics(),
      this.integration.getFacebookPageFromSocialModule(),
      Promise.resolve(this.integration.getWhatsAppStatus()),
      Promise.resolve(this.integration.getWebhookStatus()),
      this.integration.pingGraphApi(),
    ]);
    const items: DiagnosticItem[] = [];

    items.push({
      key: 'login_app_id',
      label: 'Facebook Login App ID',
      level: this.levelFromBool(apps.login.idValidation.ok),
      message:
        apps.login.idValidation.error ??
        (apps.login.appId ? `Login App: ${apps.login.appId}` : 'Login App ID chybí'),
    });

    items.push({
      key: 'pages_app_id',
      label: 'Pages / Marketing App ID',
      level: this.levelFromBool(apps.pages.idValidation.ok),
      message:
        apps.pages.idValidation.error ??
        (apps.pages.appId ? `Pages App: ${apps.pages.appId}` : 'Pages App ID chybí'),
    });

    items.push(await this.checkHttps(urls.frontend, 'Frontend URL'));
    items.push(await this.checkHttps(urls.backend, 'Backend URL'));
    items.push(await this.checkHttps(apps.login.oauthRedirectUri, 'Login OAuth Redirect'));
    items.push(await this.checkHttps(apps.pages.metaConnectRedirectUri, 'Meta Connect Redirect'));

    items.push({
      key: 'graph_api',
      label: 'Graph API',
      level: /^v\d+\.\d+$/.test(row.graphApiVersion || '') ? 'ok' : 'warning',
      message: `Verze: ${row.graphApiVersion || GRAPH_API_VERSION_DEFAULT}`,
    });

    const oauthRedirect = this.fbConfig.getMetaOAuthRedirectDiagnostics();
    items.push({
      key: 'meta_oauth_redirect_used',
      label: 'OAuth Redirect používaný aplikací',
      level: oauthRedirect.oauthRedirectUsedByApp
        ? oauthRedirect.redirectUriInAllowedConfig
          ? 'ok'
          : 'warning'
        : 'error',
      message: oauthRedirect.oauthRedirectUsedByApp ?? 'Nelze odvodit z BACKEND_URL',
    });
    items.push({
      key: 'meta_oauth_redirect_allowed',
      label: 'Allowed Redirect URI (config)',
      level: oauthRedirect.allowedRedirectUris.length ? 'ok' : 'warning',
      message: oauthRedirect.allowedRedirectUris.join(', ') || 'Prázdný whitelist',
    });
    items.push({
      key: 'meta_oauth_redirect_current',
      label: 'Current Redirect URI',
      level:
        oauthRedirect.currentRedirectUri && oauthRedirect.redirectUriInAllowedConfig
          ? 'ok'
          : 'warning',
      message:
        !oauthRedirect.redirectUriInAllowedConfig && oauthRedirect.oauthRedirectUsedByApp
          ? 'Tato Redirect URI není povolena v Meta Developers.'
          : oauthRedirect.mismatchMessage ??
            oauthRedirect.currentRedirectUri ??
            'Nenastaveno',
    });
    if (oauthRedirect.mismatchMessage) {
      items.push({
        key: 'meta_oauth_redirect_mismatch',
        label: 'OAuth Redirect — neshoda',
        level: 'warning',
        message: oauthRedirect.mismatchMessage,
      });
    }
    if (
      (oauthRedirect.metaDevelopersInstruction && !oauthRedirect.redirectUriInAllowedConfig) ||
      oauthRedirect.mismatchMessage
    ) {
      items.push({
        key: 'meta_oauth_redirect_instruction',
        label: 'Instrukce Meta Developers',
        level: 'warning',
        message: oauthRedirect.metaDevelopersInstruction ?? oauthRedirect.mismatchMessage ?? '',
      });
    }

    items.push({
      key: 'token',
      label: 'CAPI token',
      level: ids.capiToken ? 'ok' : 'warning',
      message: ids.capiToken
        ? 'FACEBOOK_CAPI_ACCESS_TOKEN nastaven'
        : 'Nenastaveno (volitelné)',
    });

    items.push({
      key: 'pixel',
      label: 'Pixel',
      level: ids.pixelId ? 'ok' : ids.datasetId ? 'ok' : 'warning',
      message: ids.pixelId
        ? `Pixel ID ${ids.pixelId}`
        : ids.datasetId
          ? META_DATASET_V21_MESSAGE
          : 'Nenastaveno (volitelné)',
    });

    items.push({
      key: 'dataset',
      label: 'Dataset',
      level: ids.datasetId ? 'ok' : 'warning',
      message: ids.datasetId
        ? `Dataset ${ids.datasetId}`
        : 'Nenastaveno (volitelné)',
    });

    items.push({
      key: 'commerce',
      label: 'Commerce Manager',
      level: diagnosticLevelFromIssue(catalogGraph.commerceOnline, catalogGraph.commerceIssueKind),
      message: catalogGraph.commerceMessage,
    });

    items.push({
      key: 'commerce_issue',
      label: 'Commerce — typ stavu',
      level: catalogGraph.commerceOnline ? 'ok' : 'warning',
      message: catalogGraph.commerceOnline
        ? 'Online'
        : catalogGraph.commerceIssueKind === 'missing_permission'
          ? 'Aplikace nemá oprávnění'
          : catalogGraph.commerceIssueKind === 'api_error'
            ? 'API nefunguje'
            : catalogGraph.commerceIssueKind === 'business_no_catalog'
              ? 'Business nemá katalog'
              : catalogGraph.commerceIssueKind === 'catalog_not_found'
                ? 'Katalog neexistuje'
                : catalogGraph.commerceIssueKind === 'catalog_not_in_app'
                  ? 'Katalog není připojen do aplikace'
                  : 'Chybí konfigurace',
    });

    items.push({
      key: 'catalog',
      label: 'Facebook Catalog',
      level: diagnosticLevelFromIssue(catalogGraph.catalogOnline, catalogGraph.catalogIssueKind),
      message: catalogGraph.catalogMessage,
    });

    items.push({
      key: 'catalog_issue',
      label: 'Catalog — typ stavu',
      level: catalogGraph.catalogOnline ? 'ok' : 'warning',
      message: catalogGraph.catalogOnline
        ? 'Online'
        : catalogGraph.catalogIssueKind === 'missing_permission'
          ? 'Aplikace nemá oprávnění'
          : catalogGraph.catalogIssueKind === 'api_error'
            ? 'API nefunguje'
            : catalogGraph.catalogIssueKind === 'business_no_catalog'
              ? 'Business nemá katalog'
              : catalogGraph.catalogIssueKind === 'catalog_not_found'
                ? 'Katalog neexistuje'
                : catalogGraph.catalogIssueKind === 'catalog_not_in_app'
                  ? 'Katalog není připojen do aplikace'
                  : 'Chybí konfigurace',
    });

    items.push({
      key: 'catalog_business_id',
      label: 'Business ID',
      level: ids.businessId ? 'ok' : 'warning',
      message: ids.businessId ?? 'Chybí FACEBOOK_BUSINESS_ID',
    });

    items.push({
      key: 'catalog_product_count',
      label: 'Počet produktů v katalogu',
      level: catalogGraph.productCount != null && catalogGraph.productCount > 0 ? 'ok' : 'warning',
      message:
        catalogGraph.productCount != null
          ? String(catalogGraph.productCount)
          : 'Neznámý (Graph API)',
    });

    items.push({
      key: 'catalog_last_sync',
      label: 'Poslední synchronizace',
      level: catalogGraph.lastLocalSync ? 'ok' : 'warning',
      message: catalogGraph.lastLocalSync ?? 'Zatím neproběhla',
    });

    items.push({
      key: 'catalog_last_update',
      label: 'Poslední aktualizace katalogu',
      level: catalogGraph.lastCatalogUpdate ? 'ok' : 'warning',
      message: catalogGraph.lastCatalogUpdate ?? 'Neznámá',
    });

    items.push({
      key: 'catalog_import_errors',
      label: 'Chyby importu',
      level: catalogGraph.importErrorCount === 0 ? 'ok' : 'error',
      message: String(catalogGraph.importErrorCount),
    });

    items.push({
      key: 'catalog_meta_images',
      label: 'Obrázky načtené Meta',
      level: catalogGraph.metaImagesLoaded != null && catalogGraph.metaImagesLoaded > 0 ? 'ok' : 'warning',
      message:
        catalogGraph.metaImagesLoaded != null
          ? String(catalogGraph.metaImagesLoaded)
          : 'Neznámý (Graph API)',
    });

    const feedValidation = await this.catalog.validateFeed().catch((e) => ({
      ok: false,
      errors: [e instanceof Error ? e.message : String(e)],
      itemCount: 0,
    }));
    items.push({
      key: 'feed',
      label: 'Feed',
      level: feedValidation.ok ? 'ok' : feedValidation.itemCount === 0 ? 'warning' : 'error',
      message: feedValidation.ok
        ? `${feedValidation.itemCount} položek`
        : feedValidation.errors.join('; '),
    });

    items.push({
      key: 'webhook',
      label: 'Webhook',
      level: webhook.connected ? 'ok' : 'warning',
      message: webhook.detail,
    });

    items.push({
      key: 'login',
      label: 'Facebook Login',
      level: fbStatus.configured ? 'ok' : 'error',
      message: fbStatus.configured
        ? `Připraveno (${apps.login.oauthRedirectUri})`
        : `Chybí: ${fbStatus.missing.join(', ')}${apps.login.idValidation.error ? ` — ${apps.login.idValidation.error}` : ''}`,
    });

    items.push({
      key: 'instagram',
      label: 'Instagram API',
      level: fbStatus.pagesConfigured ? 'ok' : 'warning',
      message: fbStatus.pagesConfigured ? 'Pages API připraveno' : 'Vyžaduje Facebook Pages',
    });

    items.push({
      key: 'whatsapp',
      label: 'WhatsApp API',
      level: wa.configured ? 'ok' : 'warning',
      message: wa.configured
        ? `WhatsApp modul — ${wa.detail ?? 'nakonfigurováno'}`
        : wa.missing.length
          ? `Chybí: ${wa.missing.join(', ')}`
          : 'WhatsApp Cloud API není nakonfigurováno',
    });

    items.push({
      key: 'pages',
      label: 'Facebook Pages / Marketing API',
      level: socialPage.connected || fbStatus.pagesConfigured ? 'ok' : 'warning',
      message: socialPage.connected
        ? `Sociální sítě modul — ${socialPage.detail ?? socialPage.pageId}`
        : fbStatus.pagesConfigured
          ? `Pages App: ${apps.pages.appId}`
          : `Chybí: ${fbStatus.pagesMissing.join(', ')}${apps.pages.idValidation.error ? ` — ${apps.pages.idValidation.error}` : ''}`,
    });

    items.push({
      key: 'api_ping',
      label: 'Graph API komunikace',
      level: apiPing.ok ? 'ok' : apiPing.error ? 'warning' : 'error',
      message: apiPing.detail,
    });

    const summary = { ok: 0, warning: 0, error: 0 };
    for (const i of items) summary[i.level] += 1;

    await this.logEvent({
      eventType: 'diagnostics',
      source: 'diagnostic',
      result: summary.error > 0 ? 'error' : summary.warning > 0 ? 'warning' : 'ok',
      response: { summary, items },
    });

    return { items, summary };
  }

  async testAll() {
    const diagnostics = await this.runDiagnostics();
    const services = await Promise.all(
      META_SERVICE_KEYS.map((key) => this.testService(key)),
    );
    return {
      diagnostics,
      services,
      testedAt: new Date().toISOString(),
    };
  }

  async checkGraphPermissions() {
    return this.graphDiagnostics.checkRequiredPermissions();
  }

  async getDashboard() {
    const [settings, services, diagnostics, catalog, feedStats, catalogGraph] = await Promise.all([
      this.getSettings(),
      this.buildServiceCards(),
      this.runDiagnostics(),
      this.catalog.getAdminSettings(),
      this.catalog.computeFeedStats('csv').catch(() => null),
      this.graphDiagnostics.buildCatalogDiagnostics(),
    ]);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);

    const [eventsToday, eventsMonth, lastPixelEvent] = await Promise.all([
      this.prisma.metaCenterEventLog.count({
        where: { source: 'pixel', createdAt: { gte: todayStart } },
      }),
      this.prisma.metaCenterEventLog.count({
        where: { source: 'pixel', createdAt: { gte: monthStart } },
      }),
      this.prisma.metaCenterEventLog.findFirst({
        where: { source: 'pixel' },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const ids = resolveMetaCenterIds(
      await this.prisma.metaCenterSetting.findUnique({ where: { id: SETTINGS_ID } }) ??
        ({} as never),
    );
    const trackingMode = resolveMetaTrackingMode(ids);
    const oauthRedirect = this.fbConfig.getMetaOAuthRedirectDiagnostics();

    return {
      settings,
      services,
      diagnostics,
      catalog,
      feedStats,
      catalogGraph,
      oauthRedirect,
      pixel: {
        pixelId: ids.pixelId,
        pixelName: settings.pixelName,
        datasetId: ids.datasetId,
        trackingMode,
        datasetMessage: ids.datasetId ? 'Dataset Připojeno' : null,
        pixelPlaceholderMessage: hasPlaceholderPixelEnv() ? META_PIXEL_PLACEHOLDER_MESSAGE : null,
        legacyDatasetNote: !ids.pixelId && ids.datasetId ? META_DATASET_V21_MESSAGE : null,
        lastEventAt: lastPixelEvent?.createdAt.toISOString() ?? null,
        eventsToday,
        eventsMonth,
        status:
          trackingMode === 'pixel' || trackingMode === 'dataset' ? 'ready' : 'not_configured',
      },
      capi: (() => {
        const oauthReady = Boolean(settings.isMetaConnected);
        const capiReady = hasMetaCapiReady(ids, oauthReady);
        return {
          datasetId: ids.datasetId,
          pixelId: ids.pixelId,
          trackingMode,
          tokenConfigured: Boolean(ids.capiToken) || oauthReady,
          toggles: settings.capiEventToggles,
          status: capiReady ? 'ready' : ids.datasetId ? 'missing_token' : 'not_configured',
          tokenLabel: ids.capiToken
            ? 'nastaven'
            : oauthReady
              ? 'Meta OAuth token'
              : META_CAPI_OPTIONAL_MESSAGE,
          capiMessage: capiReady ? 'Conversions API Připojeno' : null,
        };
      })(),
    };
  }

  async getPixelPanel() {
    const settings = await this.getSettings();
    const ids = resolveMetaCenterIds(
      await this.prisma.metaCenterSetting.findUnique({ where: { id: SETTINGS_ID } }) ??
        ({} as never),
    );
    const trackingMode = resolveMetaTrackingMode(ids);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);
    const [eventsToday, eventsMonth, lastEvent, serverEvents] = await Promise.all([
      this.prisma.metaCenterEventLog.count({ where: { source: 'pixel', createdAt: { gte: todayStart } } }),
      this.prisma.metaCenterEventLog.count({ where: { source: 'pixel', createdAt: { gte: monthStart } } }),
      this.prisma.metaCenterEventLog.findFirst({ where: { source: 'pixel' }, orderBy: { createdAt: 'desc' } }),
      this.prisma.metaCenterEventLog.count({ where: { source: 'capi' } }),
    ]);
    return {
      pixelId: ids.pixelId,
      pixelName: settings.pixelName,
      datasetId: ids.datasetId,
      trackingMode,
      datasetMessage: ids.datasetId ? 'Dataset Připojeno' : null,
      pixelPlaceholderMessage: hasPlaceholderPixelEnv() ? META_PIXEL_PLACEHOLDER_MESSAGE : null,
      legacyDatasetNote: !ids.pixelId && ids.datasetId ? META_DATASET_V21_MESSAGE : null,
      lastEventAt: lastEvent?.createdAt.toISOString() ?? null,
      eventsToday,
      eventsMonth,
      serverEventCount: serverEvents,
      status:
        trackingMode === 'pixel' || trackingMode === 'dataset' ? 'ready' : 'not_configured',
    };
  }

  async sendPixelTestEvent(eventType: string, listingId?: string, userId?: string) {
    const settings = await this.getSettings();
    const payload = {
      event: eventType,
      pixelId: settings.pixelId,
      listingId: listingId ?? null,
      sentAt: new Date().toISOString(),
      mode: 'simulated',
      note: 'Ostré odeslání do Meta po aktivaci Pixel/Dataset ID a access tokenu.',
    };
    await this.logEvent({
      eventType,
      listingId,
      userId,
      source: 'pixel',
      result: 'ok',
      status: 'simulated',
      request: payload,
      response: { accepted: true },
    });
    return { ok: true, payload };
  }

  async getCapiPanel() {
    const settings = await this.getSettings();
    const row =
      await this.prisma.metaCenterSetting.findUnique({ where: { id: SETTINGS_ID } }) ??
      ({} as never);
    const ids = resolveMetaCenterIds(row);
    const oauthReady = Boolean(settings.isMetaConnected);
    const capiReady = hasMetaCapiReady(ids, oauthReady);
    const lastSync = await this.prisma.metaCenterEventLog.findFirst({
      where: { source: 'capi' },
      orderBy: { createdAt: 'desc' },
    });
    const serverCount = await this.prisma.metaCenterEventLog.count({ where: { source: 'capi' } });
    return {
      datasetId: ids.datasetId,
      pixelId: ids.pixelId,
      trackingMode: resolveMetaTrackingMode(ids),
      tokenConfigured: Boolean(ids.capiToken) || oauthReady,
      tokenLabel: ids.capiToken
        ? 'nastaven'
        : oauthReady
          ? 'Meta OAuth token'
          : META_CAPI_OPTIONAL_MESSAGE,
      capiMessage: capiReady ? 'Conversions API Připojeno' : null,
      toggles: settings.capiEventToggles,
      serverEventCount: serverCount,
      lastSyncAt: lastSync?.createdAt.toISOString() ?? null,
      status: capiReady ? 'ready' : ids.datasetId ? 'missing_token' : 'not_configured',
    };
  }

  async updateCapiToggles(toggles: Partial<Record<MetaCapiEventKey, boolean>>) {
    const row = await this.getOrCreateSettings();
    const current = this.parseJson(row.capiEventToggles, DEFAULT_CAPI_TOGGLES);
    const merged = { ...current, ...toggles };
    await this.prisma.metaCenterSetting.update({
      where: { id: SETTINGS_ID },
      data: { capiEventToggles: this.toInputJsonValue(merged) },
    });
    return { ok: true, toggles: merged };
  }

  async getCommercePanel() {
    const settings = await this.getSettings();
    const catalog = await this.catalog.getAdminSettings();
    const graphVersion = settings.graphApiVersion;
    const mk = (id: string | null, name: string, lastSync: string | null) => ({
      id,
      name,
      createdAt: settings.createdAt,
      lastSyncAt: lastSync,
      status: id ? 'ready' : 'not_configured',
      graphApiVersion: graphVersion,
    });
    return {
      businessManager: mk(settings.businessManagerId, 'Business Manager', null),
      commerceManager: mk(settings.commerceManagerId, 'Commerce Manager', null),
      catalog: mk(settings.catalogId, 'Facebook Catalog', catalog.lastGeneratedAt),
      dataset: mk(settings.datasetId, 'Dataset', null),
      pixel: mk(settings.pixelId, settings.pixelName || 'Meta Pixel', null),
      feed: {
        id: 'meta-feed',
        name: 'Katalogový feed',
        createdAt: settings.createdAt,
        lastSyncAt: catalog.lastGeneratedAt,
        status: catalog.enabled ? 'ready' : 'disabled',
        graphApiVersion: graphVersion,
        urls: {
          xml: catalog.feedXmlUrl,
          csv: catalog.feedCsvUrl,
          json: catalog.feedJsonUrl,
        },
      },
    };
  }

  async getFeedStats() {
    const catalog = await this.catalog.getAdminSettings();
    const stats = await this.catalog.computeFeedStats('csv').catch(() => null);
    return {
      ...stats,
      feedUrls: {
        xml: catalog.feedXmlUrl,
        csv: catalog.feedCsvUrl,
        json: catalog.feedJsonUrl,
      },
      enabled: catalog.enabled,
    };
  }

  async regenerateFeeds() {
    const started = Date.now();
    try {
      await Promise.all([
        this.catalog.buildXmlFeed(),
        this.catalog.buildCsvFeed(),
        this.catalog.buildJsonFeed(),
      ]);
      const stats = await this.catalog.computeFeedStats('csv');
      await this.logEvent({
        eventType: 'feed_regenerate',
        source: 'feed',
        result: 'ok',
        response: stats,
      });
      return { ok: true, stats, generationMs: Date.now() - started };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await this.logEvent({
        eventType: 'feed_regenerate',
        source: 'feed',
        result: 'error',
        response: { message },
      });
      return { ok: false, error: message };
    }
  }

  async validateFeed() {
    const result = await this.catalog.validateFeed();
    await this.logEvent({
      eventType: 'feed_validate',
      source: 'feed',
      result: result.ok ? 'ok' : 'error',
      response: result,
    });
    return result;
  }

  async listLogs(query: { eventType?: string; source?: string; take?: number; skip?: number }) {
    const take = Math.min(200, Math.max(1, query.take ?? 50));
    const skip = Math.max(0, query.skip ?? 0);
    const where: Prisma.MetaCenterEventLogWhereInput = {};
    if (query.eventType?.trim()) where.eventType = { contains: query.eventType.trim(), mode: 'insensitive' };
    if (query.source?.trim()) where.source = query.source.trim();

    const [items, total] = await Promise.all([
      this.prisma.metaCenterEventLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      this.prisma.metaCenterEventLog.count({ where }),
    ]);

    return {
      total,
      items: items.map((r) => ({
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        eventType: r.eventType,
        listingId: r.listingId,
        userId: r.userId,
        result: r.result,
        status: r.status,
        response: r.response,
        request: r.request,
        source: r.source,
      })),
    };
  }

  async getRemarketing() {
    const settings = await this.getSettings();
    return { audiences: settings.remarketingAudiences };
  }

  async updateRemarketing(audiences: unknown) {
    await this.prisma.metaCenterSetting.update({
      where: { id: SETTINGS_ID },
      data: { remarketingAudiences: this.toNullableJsonUpdate(audiences) },
    });
    return { ok: true };
  }

  async getCampaignRules() {
    const settings = await this.getSettings();
    return { rules: settings.autoCampaignRules };
  }

  async updateCampaignRules(rules: unknown) {
    await this.prisma.metaCenterSetting.update({
      where: { id: SETTINGS_ID },
      data: { autoCampaignRules: this.toNullableJsonUpdate(rules) },
    });
    return { ok: true };
  }

  async getAdFormats() {
    const settings = await this.getSettings();
    return { flags: settings.adFormatFlags };
  }

  async updateAdFormats(flags: Record<string, boolean>) {
    const row = await this.getOrCreateSettings();
    const merged = { ...this.parseJson(row.adFormatFlags, DEFAULT_AD_FORMAT_FLAGS), ...flags };
    await this.prisma.metaCenterSetting.update({
      where: { id: SETTINGS_ID },
      data: { adFormatFlags: this.toInputJsonValue(merged) },
    });
    return { ok: true, flags: merged };
  }

  async getConnectionStatus() {
    const row = await this.getOrCreateSettings();
    const settings = this.serializeSettings(row);
    const apps = this.fbConfig.getAppsConfig();
    const ids = resolveMetaCenterIds(row);
    const checks = this.parseJson<MetaConnectionCheck[]>(row.diagnosticsSnapshot, []);
    const [socialPage, wa, userPages, catalogEnv, webhook] = await Promise.all([
      this.integration.getFacebookPageFromSocialModule(),
      Promise.resolve(this.integration.getWhatsAppStatus()),
      this.integration.getUserFacebookPagesStatus(),
      this.integration.getCatalogEnvStatus(),
      Promise.resolve(this.integration.getWebhookStatus()),
    ]);

    const checklist = [
      {
        key: 'app',
        label: 'Meta aplikace připojena',
        connected: Boolean(settings.facebookPagesAppId || settings.facebookMarketingAppId),
        optional: false,
      },
      {
        key: 'page',
        label: 'Facebook stránka připojena',
        connected: socialPage.connected || Boolean(settings.pageId),
        optional: false,
      },
      {
        key: 'ad',
        label: 'Reklamní účet připojen',
        connected: Boolean(settings.adAccountId && settings.isMarketingAdsConnected),
        optional: !settings.adAccountId,
      },
      {
        key: 'ads_api',
        label: 'Ads API připojeno',
        connected: isMarketingAdsTokenActive(row),
        optional: !row.adAccountId,
      },
      {
        key: 'commerce',
        label: 'Commerce Manager připojen',
        connected: catalogEnv.commerceOnline,
        optional: !ids.businessId,
      },
      {
        key: 'catalog',
        label: 'Catalog připojen',
        connected: catalogEnv.catalogOnline,
        optional: !ids.catalogId,
      },
      {
        key: 'dataset',
        label: 'Dataset připojen',
        connected: Boolean(ids.datasetId),
        optional: !ids.datasetId,
      },
      {
        key: 'pixel',
        label: 'Pixel připojen',
        connected: Boolean(ids.pixelId || ids.datasetId),
        optional: !ids.pixelId && !ids.datasetId,
      },
      {
        key: 'capi',
        label: 'Conversions API aktivní',
        connected: hasMetaCapiReady(ids, settings.isMetaConnected),
        optional: !hasMetaCapiReady(ids, settings.isMetaConnected),
      },
      {
        key: 'webhook',
        label: 'Webhook aktivní',
        connected: webhook.connected || Boolean(settings.webhookVerifyTokenMasked),
        optional: false,
      },
      {
        key: 'instagram',
        label: 'Instagram připojen',
        connected: Boolean(settings.instagramBusinessId),
        optional: !settings.instagramBusinessId,
      },
      {
        key: 'whatsapp',
        label: 'WhatsApp připojen',
        connected: wa.configured,
        optional: false,
      },
      {
        key: 'user_pages',
        label: 'Uživatelské Facebook stránky',
        connected: userPages.connected,
        optional: !userPages.connected,
      },
      {
        key: 'sync',
        label: 'Meta Connect synchronizace',
        connected: settings.syncEnabled && settings.isMetaConnected,
        optional: !settings.isMetaConnected,
      },
    ];

    return {
      settings,
      apps,
      checklist,
      diagnostics: checks,
      connectedAt: settings.metaConnectedAt,
      lastSyncAt: settings.lastAutoSyncAt,
    };
  }

  async listApiLogs(take = 50) {
    const items = await this.prisma.metaCenterApiLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(200, Math.max(1, take)),
    });
    return {
      items: items.map((r) => ({
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        endpoint: r.endpoint,
        method: r.method,
        request: r.request,
        response: r.response,
        httpStatus: r.httpStatus,
        errorCode: r.errorCode,
        errorMessage: r.errorMessage,
        durationMs: r.durationMs,
      })),
    };
  }

  async getPixelMapping() {
    const settings = await this.getSettings();
    return { mapping: settings.pixelMapping };
  }

  async updatePixelMapping(mapping: Record<string, string>) {
    await this.prisma.metaCenterSetting.update({
      where: { id: SETTINGS_ID },
      data: { pixelMapping: this.toInputJsonValue(mapping) },
    });
    return { ok: true };
  }
}
