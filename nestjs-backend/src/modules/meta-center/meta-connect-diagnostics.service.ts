import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { FacebookConfigService } from '../social/facebook/facebook-config.service';
import type { MetaConnectionCheck, MetaConnectionCheckKey } from './meta-connect.constants';
import { MetaConnectDiscoveryService } from './meta-connect-discovery.service';
import { MetaConnectOAuthService } from './meta-connect-oauth.service';
import { MetaConnectProvisionService } from './meta-connect-provision.service';
import { MetaCenterGraphDiagnosticsService } from './meta-center-graph-diagnostics.service';
import {
  META_FIX_HREFS,
  MetaCenterIntegrationStatusService,
} from './meta-center-integration-status.service';
import {
  META_CAPI_OPTIONAL_MESSAGE,
  META_DATASET_V21_MESSAGE,
  hasMetaEventTracking,
  resolveMetaCenterIds,
  resolveMetaTrackingMode,
} from './meta-center-env.util';
import { MetaGraphClientService } from './meta-graph-client.service';

const SETTINGS_ID = 'default';

@Injectable()
export class MetaConnectDiagnosticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fbConfig: FacebookConfigService,
    private readonly oauth: MetaConnectOAuthService,
    private readonly graph: MetaGraphClientService,
    private readonly discovery: MetaConnectDiscoveryService,
    private readonly provision: MetaConnectProvisionService,
    private readonly graphDiagnostics: MetaCenterGraphDiagnosticsService,
    private readonly integration: MetaCenterIntegrationStatusService,
  ) {}

  async runFullDiagnostics(): Promise<MetaConnectionCheck[]> {
    const row = await this.prisma.metaCenterSetting.findUnique({ where: { id: SETTINGS_ID } });
    const checks: MetaConnectionCheck[] = [];
    const apps = this.fbConfig.getAppsConfig();
    const resolvedIds = resolveMetaCenterIds(row ?? ({} as never));
    const fbStatus = this.fbConfig.getConfigStatus();

    const push = (check: MetaConnectionCheck) => {
      checks.push(check);
    };

    const pushOptional = (key: MetaConnectionCheckKey, label: string, source: MetaConnectionCheck['source']) => {
      push(
        this.integration.buildCheck({
          key,
          label,
          connected: false,
          optional: true,
          source,
        }),
      );
    };

    push(
      this.integration.buildCheck({
        key: 'login_app',
        label: 'Facebook Login App ID',
        connected: Boolean(apps.login.appId) && apps.login.idValidation.ok,
        error:
          apps.login.idValidation.error ??
          (apps.login.appId ? null : 'FACEBOOK_LOGIN_APP_ID chybí v ENV.'),
        fixAction: apps.login.idValidation.ok ? null : 'fix_env',
        source: 'facebook_login',
        detail: apps.login.appId ? `App ID: ${apps.login.appId}` : null,
      }),
    );
    push(
      this.integration.buildCheck({
        key: 'login_app_secret',
        label: 'Facebook Login App Secret',
        connected: apps.login.appSecretConfigured,
        error: apps.login.appSecretConfigured ? null : 'FACEBOOK_LOGIN_APP_SECRET chybí v ENV.',
        fixAction: 'fix_env',
        source: 'env',
      }),
    );
    push(
      this.integration.buildCheck({
        key: 'login_oauth',
        label: 'Login OAuth Redirect URI',
        connected: Boolean(apps.login.oauthRedirectUri),
        error: apps.login.oauthRedirectUri
          ? null
          : 'Login redirect URI nelze odvodit (chybí FRONTEND_URL).',
        fixAction: 'fix_env',
        source: 'facebook_login',
        detail: apps.login.oauthRedirectUri,
      }),
    );

    const pagesAppId = row?.facebookPagesAppId ?? this.fbConfig.getPagesAppId();
    const pagesSecret = row?.facebookPagesSecret ?? this.fbConfig.getPagesAppSecret();
    const pagesValidation = this.fbConfig.validatePagesAppId();
    push(
      this.integration.buildCheck({
        key: 'app',
        label: 'Pages / Marketing App ID',
        connected: Boolean(pagesAppId) && pagesValidation.ok,
        error:
          pagesValidation.error ??
          (pagesAppId ? null : 'FACEBOOK_PAGES_APP_ID chybí v konfiguraci.'),
        fixAction: pagesValidation.ok ? null : 'fix_env',
        source: 'env',
        detail: pagesAppId ? `App ID: ${pagesAppId}` : null,
      }),
    );
    push(
      this.integration.buildCheck({
        key: 'app_secret',
        label: 'Pages App Secret',
        connected: Boolean(pagesSecret),
        error: pagesSecret ? null : 'FACEBOOK_PAGES_APP_SECRET chybí.',
        fixAction: 'fix_env',
        source: 'env',
      }),
    );
    const oauthRedirectDiag = this.fbConfig.getMetaOAuthRedirectDiagnostics();
    push(
      this.integration.buildCheck({
        key: 'oauth',
        label: 'Meta Connect OAuth Redirect URI',
        connected:
          oauthRedirectDiag.matchesAllowed && Boolean(oauthRedirectDiag.oauthRedirectUsedByApp),
        error:
          oauthRedirectDiag.mismatchMessage ??
          (oauthRedirectDiag.oauthRedirectUsedByApp
            ? null
            : 'OAuth redirect URI nelze odvodit z BACKEND_URL / API_URL.'),
        detail: oauthRedirectDiag.oauthRedirectUsedByApp ?? oauthRedirectDiag.mismatchMessage,
        fixAction: 'fix_env',
        fixHref: META_FIX_HREFS.metaCenter,
        source: 'meta_connect',
        permissionWarning: Boolean(oauthRedirectDiag.mismatchMessage),
      }),
    );
    push(
      this.integration.buildCheck({
        key: 'meta_connected',
        label: 'Meta Marketing OAuth připojení',
        connected: Boolean(row?.metaConnectedAt && row.metaUserAccessTokenEncrypted),
        error: row?.metaConnectedAt
          ? null
          : 'Volitelné — pro automatickou synchronizaci assetů přes Meta Connect.',
        fixAction: 'reconnect',
        fixHref: META_FIX_HREFS.metaCenter,
        source: 'meta_connect',
        optional: !row?.metaConnectedAt,
      }),
    );

    let marketingAccessToken: string | null = null;
    try {
      marketingAccessToken = await this.oauth.resolveAccessToken();
      const debug = await this.oauth.debugToken(marketingAccessToken);
      const expired = debug.expires_at > 0 && debug.expires_at * 1000 < Date.now();
      push(
        this.integration.buildCheck({
          key: 'access_token',
          label: 'Marketing Access Token',
          connected: debug.is_valid && !expired,
          error: !debug.is_valid
            ? 'Token není platný.'
            : expired
              ? 'Token expiroval.'
              : null,
          fixAction: expired || !debug.is_valid ? 'refresh_token' : null,
          fixHref: META_FIX_HREFS.metaCenter,
          source: 'meta_connect',
          apiError: !debug.is_valid,
        }),
      );
    } catch (err) {
      push(
        this.integration.buildCheck({
          key: 'access_token',
          label: 'Marketing Access Token',
          connected: false,
          optional: true,
          error:
            err instanceof Error
              ? `${err.message} (volitelné, pokud fungují moduly Sociální sítě / WhatsApp).`
              : 'Token chybí (volitelné).',
          fixAction: 'reconnect',
          fixHref: META_FIX_HREFS.metaCenter,
          source: 'meta_connect',
        }),
      );
    }

    push(
      this.integration.buildCheck({
        key: 'facebook_pages_api',
        label: 'Facebook Pages API',
        connected: fbStatus.pagesConfigured,
        error: fbStatus.pagesConfigured
          ? null
          : `Chybí: ${fbStatus.pagesMissing.join(', ') || 'Pages App konfigurace'}`,
        fixAction: 'fix_env',
        source: 'env',
        detail: fbStatus.pagesConfigured
          ? `Pages App ${apps.pages.appId}`
          : apps.pages.idValidation.error,
      }),
    );

    const socialPage = await this.integration.getFacebookPageFromSocialModule();
    let pageConnected = socialPage.connected;
    let pageError: string | null = null;
    let pageDetail = socialPage.detail;
    if (socialPage.pageId && socialPage.token) {
      const verify = await this.integration.verifyFacebookPageToken(
        socialPage.pageId,
        socialPage.token,
      );
      pageConnected = verify.ok;
      pageError = verify.ok ? null : verify.errorMessage;
      pageDetail = verify.ok
        ? `${socialPage.pageName ?? socialPage.pageId}${socialPage.autopostReady ? ' · autopost zapnutý' : ''}`
        : verify.errorMessage;
    } else {
      pageError = 'Facebook stránka nebo page access token není nastaven.';
    }
    push(
      this.integration.buildCheck({
        key: 'page',
        label: 'Facebook stránka',
        connected: pageConnected,
        error: pageConnected ? null : pageError,
        detail: pageDetail,
        fixAction: 'open_social_admin',
        fixHref: META_FIX_HREFS.socialFacebook,
        source: 'social_autopost',
        apiError: Boolean(socialPage.pageId && socialPage.token && !pageConnected),
      }),
    );

    const userPages = await this.integration.getUserFacebookPagesStatus();
    push(
      this.integration.buildCheck({
        key: 'user_facebook_pages',
        label: 'Uživatelské Facebook stránky',
        connected: userPages.connected,
        error: userPages.connected ? null : 'Zatím žádná aktivní uživatelská stránka.',
        detail: userPages.detail,
        fixAction: null,
        source: 'user_facebook_pages',
        optional: !userPages.connected,
      }),
    );

    const catalogEnv = await this.integration.getCatalogEnvStatus();
    const catalogGraph = marketingAccessToken
      ? await this.graphDiagnostics.buildCatalogDiagnostics()
      : null;

    const commerceOnline = catalogGraph?.commerceOnline ?? catalogEnv.commerceOnline;
    const commerceMessage = catalogGraph?.commerceMessage ?? catalogEnv.commerceMessage;
    const catalogOnline = catalogGraph?.catalogOnline ?? catalogEnv.catalogOnline;
    const catalogMessage = catalogGraph?.catalogMessage ?? catalogEnv.catalogMessage;
    const commercePermissionWarning =
      catalogGraph?.commerceIssueKind === 'missing_permission' ||
      catalogGraph?.commerceIssueKind === 'catalog_not_in_app';
    const catalogPermissionWarning =
      catalogGraph?.catalogIssueKind === 'missing_permission' ||
      catalogGraph?.catalogIssueKind === 'catalog_not_in_app';

    push(
      this.integration.buildCheck({
        key: 'business',
        label: 'Business Manager',
        connected:
          Boolean(resolvedIds.businessId) &&
          (catalogGraph?.catalogOnline || catalogGraph?.commerceOnline || false),
        error: !resolvedIds.businessId
          ? 'Chybí FACEBOOK_BUSINESS_ID.'
          : catalogGraph?.catalogOnline || catalogGraph?.commerceOnline
            ? null
            : catalogGraph?.hasPermissionWarning
              ? catalogGraph.permissionWarning
              : catalogGraph?.graphErrorJson ?? commerceMessage,
        detail:
          resolvedIds.businessId && catalogGraph
            ? `Business ID ${resolvedIds.businessId}${catalogGraph.businessName ? ` · ${catalogGraph.businessName}` : ''}`
            : commerceMessage,
        fixAction: resolvedIds.businessId ? null : 'fix_env',
        fixHref: META_FIX_HREFS.metaCatalog,
        source: 'graph_api',
        permissionWarning: Boolean(
          resolvedIds.businessId && catalogGraph?.hasPermissionWarning && !catalogOnline && !commerceOnline,
        ),
        apiError: Boolean(
          resolvedIds.businessId &&
            marketingAccessToken &&
            catalogGraph &&
            !catalogGraph.catalogOnline &&
            !catalogGraph.commerceOnline &&
            !catalogGraph.hasPermissionWarning,
        ),
      }),
    );

    if (marketingAccessToken && row?.adAccountId) {
      await this.checkEntity(
        checks,
        marketingAccessToken,
        'ad_account',
        'Reklamní účet',
        row.adAccountId,
        (id) => `/act_${id.replace(/^act_/, '')}`,
        'sync',
        undefined,
        undefined,
        'meta_connect',
      );
    } else {
      push(
        this.integration.buildCheck({
          key: 'ad_account',
          label: 'Reklamní účet',
          connected: Boolean(row?.adAccountId),
          optional: !row?.adAccountId,
          error: row?.adAccountId ? null : 'Volitelné — propojte přes Meta Connect.',
          fixAction: 'reconnect',
          fixHref: META_FIX_HREFS.metaCenter,
          source: 'meta_connect',
          detail: row?.adAccountName ?? row?.adAccountId ?? null,
        }),
      );
    }

    const instagramId = row?.instagramBusinessId;
    if (marketingAccessToken && instagramId) {
      await this.checkEntity(
        checks,
        marketingAccessToken,
        'instagram',
        'Instagram',
        instagramId,
        (id) => `/${id}`,
        'sync',
        undefined,
        undefined,
        'meta_connect',
      );
    } else {
      push(
        this.integration.buildCheck({
          key: 'instagram',
          label: 'Instagram',
          connected: Boolean(instagramId) || fbStatus.pagesConfigured,
          optional: !instagramId,
          error: instagramId
            ? null
            : fbStatus.pagesConfigured
              ? 'Instagram Business ID není synchronizováno (volitelné).'
              : 'Vyžaduje Facebook Pages API.',
          fixAction: instagramId ? null : 'sync',
          fixHref: META_FIX_HREFS.metaCenter,
          source: instagramId ? 'meta_connect' : 'env',
          detail: row?.instagramUsername ?? instagramId ?? null,
        }),
      );
    }

    push(
      this.integration.buildCheck({
        key: 'commerce',
        label: 'Commerce Manager',
        connected: commerceOnline,
        error: commerceOnline ? null : commerceMessage,
        detail: commerceMessage,
        fixAction: commerceOnline ? null : resolvedIds.businessId ? null : 'fix_env',
        fixHref: META_FIX_HREFS.metaCatalog,
        source: catalogGraph?.commerceOnline ? 'graph_api' : 'meta_catalog',
        permissionWarning: commercePermissionWarning,
        apiError: Boolean(
          !commerceOnline &&
            resolvedIds.businessId &&
            marketingAccessToken &&
            catalogGraph &&
            !catalogGraph.hasPermissionWarning,
        ),
      }),
    );

    push(
      this.integration.buildCheck({
        key: 'catalog',
        label: 'Catalog',
        connected: catalogOnline,
        error: catalogOnline ? null : catalogMessage,
        detail: catalogMessage,
        fixAction: catalogOnline ? null : resolvedIds.catalogId ? null : 'fix_env',
        fixHref: META_FIX_HREFS.metaCatalog,
        source: catalogGraph?.catalogOnline ? 'graph_api' : 'meta_catalog',
        permissionWarning: catalogPermissionWarning,
        apiError: Boolean(
          !catalogOnline &&
            resolvedIds.catalogId &&
            marketingAccessToken &&
            catalogGraph &&
            !catalogGraph.hasPermissionWarning,
        ),
      }),
    );

    if (resolvedIds.datasetId) {
      push(
        this.integration.buildCheck({
          key: 'dataset',
          label: 'Dataset',
          connected: true,
          optional: false,
          detail: `Dataset ID ${resolvedIds.datasetId} (Graph API v21+)`,
          source: 'env',
        }),
      );
    } else {
      pushOptional('dataset', 'Dataset', 'env');
    }

    const pixelId = resolvedIds.pixelId;
    if (!pixelId) {
      if (resolvedIds.datasetId) {
        push(
          this.integration.buildCheck({
            key: 'pixel',
            label: 'Pixel',
            connected: true,
            optional: true,
            detail: META_DATASET_V21_MESSAGE,
            source: 'env',
          }),
        );
      } else {
        pushOptional('pixel', 'Pixel', 'env');
      }
    } else if (marketingAccessToken) {
      await this.checkEntity(
        checks,
        marketingAccessToken,
        'pixel',
        'Pixel',
        pixelId,
        (id) => `/${id}`,
        'create_pixel',
        undefined,
        undefined,
        'graph_api',
      );
    } else {
      push(
        this.integration.buildCheck({
          key: 'pixel',
          label: 'Pixel',
          connected: true,
          detail: `Pixel ID ${pixelId} (ENV)`,
          source: 'env',
        }),
      );
    }

    const capiToken = resolvedIds.capiToken;
    if (!capiToken) {
      push(
        this.integration.buildCheck({
          key: 'capi',
          label: 'Conversions API',
          connected: false,
          optional: true,
          detail: META_CAPI_OPTIONAL_MESSAGE,
          source: 'env',
        }),
      );
    } else if (!hasMetaEventTracking(resolvedIds)) {
      push(
        this.integration.buildCheck({
          key: 'capi',
          label: 'Conversions API',
          connected: false,
          error: 'CAPI token je nastaven, ale chybí Pixel ID i Dataset ID.',
          fixAction: 'create_dataset',
          source: 'env',
        }),
      );
    } else {
      push(
        this.integration.buildCheck({
          key: 'capi',
          label: 'Conversions API',
          connected: true,
          detail: 'Token nastaven v ENV',
          source: 'env',
        }),
      );
    }

    const webhook = this.integration.getWebhookStatus();
    push(
      this.integration.buildCheck({
        key: 'webhook',
        label: 'Webhook',
        connected: webhook.connected,
        error: webhook.connected ? null : 'Webhook verify token nebo URI není nastaven.',
        detail: webhook.detail,
        fixAction: webhook.connected ? null : 'open_whatsapp_admin',
        fixHref: META_FIX_HREFS.whatsapp,
        source: webhook.source,
      }),
    );

    const wa = this.integration.getWhatsAppStatus();
    push(
      this.integration.buildCheck({
        key: 'whatsapp',
        label: 'WhatsApp',
        connected: wa.configured,
        error: wa.configured
          ? null
          : wa.missing.length
            ? `Chybí: ${wa.missing.join(', ')}`
            : 'WhatsApp Cloud API není nakonfigurováno.',
        detail: wa.detail,
        fixAction: 'open_whatsapp_admin',
        fixHref: META_FIX_HREFS.whatsapp,
        source: 'whatsapp_module',
      }),
    );

    const feed = catalogEnv.feed;
    push(
      this.integration.buildCheck({
        key: 'feed',
        label: 'Feed katalogu',
        connected: feed.connected,
        error: feed.connected ? null : feed.detail,
        detail: feed.detail,
        fixAction: feed.connected ? null : 'open_meta_catalog',
        fixHref: META_FIX_HREFS.metaCatalog,
        source: 'feed',
      }),
    );

    const apiPing = await this.integration.pingGraphApi();
    push(
      this.integration.buildCheck({
        key: 'api',
        label: 'API komunikace',
        connected: apiPing.ok,
        error: apiPing.ok ? null : apiPing.error,
        detail: apiPing.detail,
        fixAction: apiPing.ok ? null : 'open_social_admin',
        fixHref: apiPing.ok ? null : META_FIX_HREFS.socialFacebook,
        source: apiPing.source,
        apiError: !apiPing.ok,
      }),
    );

    await this.prisma.metaCenterSetting.update({
      where: { id: SETTINGS_ID },
      data: {
        diagnosticsSnapshot: JSON.parse(JSON.stringify(checks)) as Prisma.InputJsonValue,
      },
    });

    return checks;
  }

  private async checkEntity(
    checks: MetaConnectionCheck[],
    accessToken: string,
    key: MetaConnectionCheckKey,
    label: string,
    id: string | null | undefined,
    path: (id: string) => string,
    fixAction: string,
    connectedOverride?: boolean,
    errorOverride?: string | null,
    source: MetaConnectionCheck['source'] = 'graph_api',
  ) {
    if (!id?.trim()) {
      checks.push(
        this.integration.buildCheck({
          key,
          label,
          connected: false,
          error: `${label} nenalezen.`,
          fixAction,
          source,
        }),
      );
      return;
    }
    if (connectedOverride !== undefined) {
      checks.push(
        this.integration.buildCheck({
          key,
          label,
          connected: connectedOverride,
          error: errorOverride ?? null,
          fixAction: connectedOverride ? null : fixAction,
          detail: id.trim(),
          source,
          apiError: !connectedOverride,
        }),
      );
      return;
    }
    const res = await this.graph.get<{ id?: string; name?: string }>(
      path(id.trim()),
      accessToken,
      { fields: 'id,name' },
    );
    checks.push(
      this.integration.buildCheck({
        key,
        label,
        connected: res.ok,
        error: res.ok ? null : res.errorMessage,
        fixAction: res.ok ? null : fixAction,
        detail: res.ok ? (res.data.name ?? id) : id,
        source,
        apiError: !res.ok,
      }),
    );
  }

  async applyFix(action: string): Promise<{ ok: boolean; error?: string; message?: string }> {
    switch (action) {
      case 'open_whatsapp_admin':
        return {
          ok: true,
          message: 'Otevřete administraci WhatsApp v /admin/integrace/whatsapp.',
        };
      case 'open_social_admin':
        return {
          ok: true,
          message: 'Otevřete Sociální sítě v /admin/marketing/socialni-site.',
        };
      case 'open_meta_catalog':
        return {
          ok: true,
          message: 'Otevřete Meta katalog v /admin/marketing/meta-katalog-inzeratu.',
        };
      case 'reconnect':
        return {
          ok: false,
          error: 'Použijte tlačítko „Připojit Meta účet“ pro nové OAuth připojení.',
        };
      case 'refresh_token':
        return this.oauth.refreshAccessToken();
      case 'sync': {
        const token = await this.oauth.resolveAccessToken();
        await this.discovery.discoverAndPersist(token);
        return { ok: true, message: 'Synchronizace dokončena.' };
      }
      case 'create_pixel': {
        const r = await this.provision.createPixel();
        return r.ok
          ? { ok: true, message: `Pixel vytvořen: ${r.pixelId}` }
          : { ok: false, error: r.error };
      }
      case 'create_catalog': {
        const r = await this.provision.createCatalog();
        return r.ok
          ? { ok: true, message: `Katalog vytvořen: ${r.catalogId}` }
          : { ok: false, error: r.error };
      }
      case 'create_dataset': {
        const r = await this.provision.createDataset();
        return r.ok
          ? { ok: true, message: `Dataset vytvořen: ${r.datasetId}` }
          : { ok: false, error: r.error };
      }
      case 'create_commerce': {
        const r = await this.provision.createCommerce();
        return { ok: r.ok, error: r.error, message: r.error ?? undefined };
      }
      case 'activate_capi': {
        const r = await this.provision.activateConversionsApi();
        return r.ok
          ? { ok: true, message: 'Conversions API aktivováno.' }
          : { ok: false, error: r.error };
      }
      case 'create_audience': {
        const r = await this.provision.createRemarketingAudience();
        return r.ok
          ? { ok: true, message: `Publikum vytvořeno: ${r.audienceId}` }
          : { ok: false, error: r.error };
      }
      default:
        return { ok: false, error: `Neznámá oprava: ${action}` };
    }
  }
}
