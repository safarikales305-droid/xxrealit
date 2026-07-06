import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { FacebookConfigService } from '../social/facebook/facebook-config.service';
import type { MetaConnectionCheck, MetaConnectionCheckKey } from './meta-connect.constants';
import { MetaConnectDiscoveryService } from './meta-connect-discovery.service';
import { MetaConnectOAuthService } from './meta-connect-oauth.service';
import { MetaConnectProvisionService } from './meta-connect-provision.service';
import { MetaCenterGraphDiagnosticsService } from './meta-center-graph-diagnostics.service';
import { resolveMetaCenterIds } from './meta-center-env.util';
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
  ) {}

  async runFullDiagnostics(): Promise<MetaConnectionCheck[]> {
    const row = await this.prisma.metaCenterSetting.findUnique({ where: { id: SETTINGS_ID } });
    const checks: MetaConnectionCheck[] = [];
    const apps = this.fbConfig.getAppsConfig();

    const push = (
      key: MetaConnectionCheckKey,
      label: string,
      connected: boolean,
      error: string | null,
      fixAction: string | null,
      optional = false,
    ) => {
      checks.push({ key, label, connected, error, fixAction, optional });
    };

    const pushOptional = (key: MetaConnectionCheckKey, label: string) => {
      push(key, label, false, 'Nenastaveno (volitelné)', null, true);
    };

    push(
      'login_app',
      'Facebook Login App ID',
      Boolean(apps.login.appId) && apps.login.idValidation.ok,
      apps.login.idValidation.error ??
        (apps.login.appId ? null : 'FACEBOOK_LOGIN_APP_ID chybí v ENV.'),
      apps.login.idValidation.ok ? null : 'fix_env',
    );
    push(
      'login_app_secret',
      'Facebook Login App Secret',
      apps.login.appSecretConfigured,
      apps.login.appSecretConfigured ? null : 'FACEBOOK_LOGIN_APP_SECRET chybí v ENV.',
      'fix_env',
    );
    push(
      'login_oauth',
      'Login OAuth Redirect URI',
      Boolean(apps.login.oauthRedirectUri),
      apps.login.oauthRedirectUri
        ? null
        : 'Login redirect URI nelze odvodit (chybí FRONTEND_URL).',
      'fix_env',
    );

    const pagesAppId = row?.facebookPagesAppId ?? this.fbConfig.getPagesAppId();
    const pagesSecret = row?.facebookPagesSecret ?? this.fbConfig.getPagesAppSecret();
    const pagesValidation = this.fbConfig.validatePagesAppId();
    push(
      'app',
      'Pages / Marketing App ID',
      Boolean(pagesAppId) && pagesValidation.ok,
      pagesValidation.error ??
        (pagesAppId ? null : 'FACEBOOK_PAGES_APP_ID chybí v konfiguraci.'),
      pagesValidation.ok ? null : 'fix_env',
    );
    push(
      'app_secret',
      'Pages App Secret',
      Boolean(pagesSecret),
      pagesSecret ? null : 'FACEBOOK_PAGES_APP_SECRET chybí.',
      'fix_env',
    );
    push(
      'oauth',
      'Meta Connect Redirect URI',
      Boolean(apps.pages.metaConnectRedirectUri),
      apps.pages.metaConnectRedirectUri
        ? null
        : 'Meta Connect redirect URI nelze odvodit.',
      'fix_env',
    );
    push(
      'meta_connected',
      'Meta Marketing OAuth připojení',
      Boolean(row?.metaConnectedAt && row.metaUserAccessTokenEncrypted),
      row?.metaConnectedAt ? null : 'Meta účet ještě nebyl připojen přes „Připojit Meta účet“.',
      'reconnect',
    );

    let accessToken: string | null = null;
    try {
      accessToken = await this.oauth.resolveAccessToken();
      const debug = await this.oauth.debugToken(accessToken);
      const expired = debug.expires_at > 0 && debug.expires_at * 1000 < Date.now();
      push(
        'access_token',
        'Marketing Access Token',
        debug.is_valid && !expired,
        !debug.is_valid
          ? 'Token není platný.'
          : expired
            ? 'Token expiroval.'
            : null,
        expired || !debug.is_valid ? 'refresh_token' : null,
      );
    } catch (err) {
      push(
        'access_token',
        'Marketing Access Token',
        false,
        err instanceof Error ? err.message : 'Token chybí.',
        'reconnect',
      );
    }

    const resolvedIds = resolveMetaCenterIds(row ?? ({} as never));

    if (accessToken) {
      const catalogGraph = await this.graphDiagnostics.buildCatalogDiagnostics();

      await this.checkEntity(
        checks,
        accessToken,
        row,
        'business',
        'Business Manager',
        resolvedIds.businessId,
        (id) => `/${id}`,
        'create_business',
      );
      await this.checkEntity(
        checks,
        accessToken,
        row,
        'ad_account',
        'Reklamní účet',
        row?.adAccountId,
        (id) => `/act_${id.replace(/^act_/, '')}`,
        'sync',
      );
      await this.checkEntity(
        checks,
        accessToken,
        row,
        'page',
        'Facebook stránka',
        row?.pageId,
        (id) => `/${id}`,
        'sync',
      );
      await this.checkEntity(
        checks,
        accessToken,
        row,
        'instagram',
        'Instagram',
        row?.instagramBusinessId,
        (id) => `/${id}`,
        'sync',
      );
      await this.checkEntity(
        checks,
        accessToken,
        row,
        'commerce',
        'Commerce Manager',
        resolvedIds.businessId,
        (id) => `/${id}`,
        'create_commerce',
        catalogGraph.commerceOnline,
        catalogGraph.commerceOnline ? null : catalogGraph.commerceMessage,
      );
      await this.checkEntity(
        checks,
        accessToken,
        row,
        'catalog',
        'Catalog',
        resolvedIds.catalogId,
        (id) => `/${id}`,
        'create_catalog',
        catalogGraph.catalogOnline,
        catalogGraph.catalogOnline ? null : catalogGraph.catalogMessage,
      );
      await this.checkEntity(
        checks,
        accessToken,
        row,
        'dataset',
        'Dataset',
        resolvedIds.datasetId,
        (id) => `/${id}`,
        'create_dataset',
      );

      const pixelId = resolvedIds.pixelId;
      if (!pixelId) {
        pushOptional('pixel', 'Pixel');
      } else {
        await this.checkEntity(
          checks,
          accessToken,
          row,
          'pixel',
          'Pixel',
          pixelId,
          (id) => `/${id}`,
          'create_pixel',
        );
      }

      const capiToken = resolvedIds.capiToken;
      if (!capiToken) {
        pushOptional('capi', 'Conversions API');
      } else if (!pixelId) {
        push(
          'capi',
          'Conversions API',
          false,
          'CAPI token je nastaven, ale chybí Pixel ID.',
          'create_pixel',
        );
      } else {
        push('capi', 'Conversions API', true, null, null);
      }

      const webhookOk = Boolean(row?.webhookVerifyToken || this.fbConfig.buildWebhookUri());
      push(
        'webhook',
        'Webhook',
        webhookOk,
        webhookOk ? null : 'Webhook verify token nebo URI není nastaven.',
        'sync',
      );

      push(
        'whatsapp',
        'WhatsApp',
        Boolean(row?.whatsappBusinessAccountId),
        row?.whatsappBusinessAccountId ? null : 'WhatsApp Business účet nenalezen.',
        'sync',
      );

      const ping = await this.graph.get<{ id?: string }>('/me', accessToken, { fields: 'id' });
      push(
        'api',
        'API komunikace',
        ping.ok,
        ping.ok ? null : ping.errorMessage,
        ping.ok ? null : 'refresh_token',
      );
    } else {
      for (const [key, label, fix] of [
        ['business', 'Business Manager', 'reconnect'],
        ['ad_account', 'Reklamní účet', 'reconnect'],
        ['page', 'Facebook stránka', 'reconnect'],
        ['instagram', 'Instagram', 'reconnect'],
        ['commerce', 'Commerce Manager', 'reconnect'],
        ['catalog', 'Catalog', 'reconnect'],
        ['dataset', 'Dataset', 'reconnect'],
        ['pixel', 'Pixel', 'reconnect'],
        ['capi', 'Conversions API', 'activate_capi'],
        ['webhook', 'Webhook', 'sync'],
        ['whatsapp', 'WhatsApp', 'reconnect'],
        ['api', 'API komunikace', 'reconnect'],
      ] as const) {
        push(key, label, false, 'Meta účet není připojen.', fix);
      }
    }

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
    row: Awaited<ReturnType<PrismaService['metaCenterSetting']['findUnique']>>,
    key: MetaConnectionCheckKey,
    label: string,
    id: string | null | undefined,
    path: (id: string) => string,
    fixAction: string,
    connectedOverride?: boolean,
    errorOverride?: string | null,
  ) {
    if (!id?.trim()) {
      checks.push({
        key,
        label,
        connected: false,
        error: `${label} nenalezen.`,
        fixAction,
      });
      return;
    }
    if (connectedOverride !== undefined) {
      checks.push({
        key,
        label,
        connected: connectedOverride,
        error: errorOverride ?? null,
        fixAction: connectedOverride ? null : fixAction,
      });
      return;
    }
    const res = await this.graph.get<{ id?: string; name?: string }>(
      path(id.trim()),
      accessToken,
      { fields: 'id,name' },
    );
    checks.push({
      key,
      label,
      connected: res.ok,
      error: res.ok ? null : res.errorMessage,
      fixAction: res.ok ? null : fixAction,
    });
    void row;
  }

  async applyFix(action: string): Promise<{ ok: boolean; error?: string; message?: string }> {
    switch (action) {
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
