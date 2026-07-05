import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { FacebookConfigService } from '../social/facebook/facebook-config.service';
import { MetaCatalogService } from '../meta-catalog/meta-catalog.service';
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

const SETTINGS_ID = 'default';

type ServiceStatusRow = {
  status: 'online' | 'offline';
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
      row.redirectUri?.trim() || this.fbConfig.resolveMetaConnectRedirectUriOptional() || '';
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

  private serviceConfigured(
    key: MetaServiceKey,
    row: Awaited<ReturnType<MetaCenterService['getOrCreateSettings']>>,
    fbStatus: ReturnType<FacebookConfigService['getConfigStatus']>,
    catalogEnabled: boolean,
  ): boolean {
    switch (key) {
      case 'facebook_app':
        return Boolean(row.facebookAppId || fbStatus.configured);
      case 'facebook_login':
        return fbStatus.configured;
      case 'facebook_pages':
        return fbStatus.pagesConfigured || Boolean(row.facebookPagesAppId);
      case 'instagram_graph':
        return fbStatus.pagesConfigured;
      case 'whatsapp_business':
        return Boolean(process.env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_PHONE_NUMBER_ID);
      case 'meta_pixel':
        return Boolean(row.pixelId);
      case 'conversions_api':
        return Boolean(row.conversionsApiToken && row.datasetId);
      case 'commerce_manager':
        return Boolean(row.commerceManagerId && row.businessManagerId);
      case 'facebook_catalog':
        return Boolean(row.catalogId);
      case 'dataset':
        return Boolean(row.datasetId);
      case 'xml_feed':
      case 'csv_feed':
      case 'json_feed':
        return catalogEnabled && row.catalogFeedEnabled;
      case 'webhook':
        return Boolean(row.webhookVerifyToken || fbStatus.webhookUri);
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

    return META_SERVICE_KEYS.map((key) => {
      const online = this.serviceConfigured(key, row, fbStatus, catalog.enabled);
      const prev = stored[key];
      return {
        key,
        label: META_SERVICE_LABELS[key],
        status: online ? ('online' as const) : ('offline' as const),
        lastSyncAt: prev?.lastSyncAt ?? catalog.lastGeneratedAt,
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
    const online = this.serviceConfigured(key, row, fbStatus, catalog.enabled);
    const result = online ? 'ok' : 'warning';
    const message = online
      ? `${META_SERVICE_LABELS[key]}: konfigurace připravena (ostrý test API po doplnění tokenů).`
      : `${META_SERVICE_LABELS[key]}: chybí povinná konfigurace.`;

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

    items.push({
      key: 'token',
      label: 'Token',
      level: row.conversionsApiToken ? 'ok' : 'warning',
      message: row.conversionsApiToken ? 'CAPI token nastaven' : 'CAPI token chybí',
    });

    items.push({
      key: 'pixel',
      label: 'Pixel',
      level: row.pixelId ? 'ok' : 'warning',
      message: row.pixelId ? `Pixel ID ${row.pixelId}` : 'Pixel ID chybí',
    });

    items.push({
      key: 'dataset',
      label: 'Dataset',
      level: row.datasetId ? 'ok' : 'warning',
      message: row.datasetId ? `Dataset ${row.datasetId}` : 'Dataset ID chybí',
    });

    items.push({
      key: 'commerce',
      label: 'Commerce Manager',
      level: row.commerceManagerId && row.businessManagerId ? 'ok' : 'warning',
      message:
        row.commerceManagerId && row.businessManagerId
          ? 'Business + Commerce Manager ID nastaveny'
          : 'Chybí Business nebo Commerce Manager ID',
    });

    items.push({
      key: 'catalog',
      label: 'Catalog',
      level: row.catalogId ? 'ok' : 'warning',
      message: row.catalogId ? `Catalog ${row.catalogId}` : 'Catalog ID chybí',
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
      level: row.webhookVerifyToken || fbStatus.webhookUri ? 'ok' : 'warning',
      message: fbStatus.webhookUri || 'Webhook verify token není nastaven',
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
      level: this.serviceConfigured('whatsapp_business', row, fbStatus, true) ? 'ok' : 'warning',
      message: 'Kontrola env WHATSAPP_* proměnných',
    });

    items.push({
      key: 'pages',
      label: 'Facebook Pages / Marketing API',
      level: fbStatus.pagesConfigured ? 'ok' : 'warning',
      message: fbStatus.pagesConfigured
        ? `Meta Connect: ${apps.pages.metaConnectRedirectUri}`
        : `Chybí: ${fbStatus.pagesMissing.join(', ')}${apps.pages.idValidation.error ? ` — ${apps.pages.idValidation.error}` : ''}`,
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

  async getDashboard() {
    const [settings, services, diagnostics, catalog, feedStats] = await Promise.all([
      this.getSettings(),
      this.buildServiceCards(),
      this.runDiagnostics(),
      this.catalog.getAdminSettings(),
      this.catalog.computeFeedStats('csv').catch(() => null),
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

    return {
      settings,
      services,
      diagnostics,
      catalog,
      feedStats,
      pixel: {
        pixelId: settings.pixelId,
        pixelName: settings.pixelName,
        lastEventAt: lastPixelEvent?.createdAt.toISOString() ?? null,
        eventsToday,
        eventsMonth,
        status: settings.pixelId ? 'ready' : 'not_configured',
      },
      capi: {
        datasetId: settings.datasetId,
        tokenConfigured: Boolean(settings.conversionsApiTokenMasked),
        toggles: settings.capiEventToggles,
        status: settings.datasetId && settings.conversionsApiTokenMasked ? 'ready' : 'not_configured',
      },
    };
  }

  async getPixelPanel() {
    const settings = await this.getSettings();
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
      pixelId: settings.pixelId,
      pixelName: settings.pixelName,
      lastEventAt: lastEvent?.createdAt.toISOString() ?? null,
      eventsToday,
      eventsMonth,
      serverEventCount: serverEvents,
      status: settings.pixelId ? 'ready' : 'not_configured',
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
      note: 'Ostré odeslání do Meta po aktivaci Pixel ID a access tokenu.',
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
    const lastSync = await this.prisma.metaCenterEventLog.findFirst({
      where: { source: 'capi' },
      orderBy: { createdAt: 'desc' },
    });
    const serverCount = await this.prisma.metaCenterEventLog.count({ where: { source: 'capi' } });
    return {
      datasetId: settings.datasetId,
      tokenConfigured: Boolean(settings.conversionsApiTokenMasked),
      toggles: settings.capiEventToggles,
      serverEventCount: serverCount,
      lastSyncAt: lastSync?.createdAt.toISOString() ?? null,
      status: settings.datasetId && settings.conversionsApiTokenMasked ? 'ready' : 'not_configured',
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
    const checks = this.parseJson<Array<{
      key: string;
      label: string;
      connected: boolean;
      error: string | null;
      fixAction: string | null;
    }>>(row.diagnosticsSnapshot, []);

    const checklist = [
      { key: 'app', label: 'Meta aplikace připojena', connected: Boolean(settings.facebookPagesAppId) },
      { key: 'page', label: 'Facebook stránka připojena', connected: Boolean(settings.pageId) },
      { key: 'ad', label: 'Reklamní účet připojen', connected: Boolean(settings.adAccountId) },
      { key: 'commerce', label: 'Commerce Manager připojen', connected: Boolean(settings.commerceManagerId) },
      { key: 'catalog', label: 'Catalog připojen', connected: Boolean(settings.catalogId) },
      { key: 'dataset', label: 'Dataset připojen', connected: Boolean(settings.datasetId) },
      { key: 'pixel', label: 'Pixel připojen', connected: Boolean(settings.pixelId) },
      { key: 'capi', label: 'Conversions API aktivní', connected: Boolean(settings.conversionsApiTokenMasked) },
      { key: 'webhook', label: 'Webhook aktivní', connected: Boolean(settings.webhookVerifyTokenMasked) },
      { key: 'instagram', label: 'Instagram připojen', connected: Boolean(settings.instagramBusinessId) },
      { key: 'whatsapp', label: 'WhatsApp připojen', connected: Boolean(settings.whatsappBusinessAccountId) },
      { key: 'sync', label: 'Synchronizace aktivní', connected: settings.syncEnabled && settings.isMetaConnected },
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
