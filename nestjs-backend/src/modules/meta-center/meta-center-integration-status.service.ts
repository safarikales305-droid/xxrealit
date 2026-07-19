import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { MetaCatalogService } from '../meta-catalog/meta-catalog.service';
import { SocialAutopostSettingsService } from '../social/autopost/social-autopost-settings.service';
import { FacebookConfigService } from '../social/facebook/facebook-config.service';
import { WhatsAppConfigService } from '../whatsapp/whatsapp-config.service';
import { resolveMetaCenterIds } from './meta-center-env.util';
import { MetaConnectOAuthService } from './meta-connect-oauth.service';
import { MetaGraphClientService } from './meta-graph-client.service';
import type {
  MetaConnectionCheck,
  MetaConnectionCheckKey,
  MetaConnectionSource,
  MetaConnectionStatusLevel,
} from './meta-connect.constants';

const SETTINGS_ID = 'default';

export const META_FIX_HREFS = {
  whatsapp: '/admin/integrace/whatsapp',
  socialFacebook: '/admin/marketing/socialni-site',
  metaCatalog: '/admin/marketing/meta-katalog-inzeratu',
  metaCenter: '/admin/marketing/meta-centrum',
} as const;

type BuildCheckInput = {
  key: MetaConnectionCheckKey;
  label: string;
  connected: boolean;
  optional?: boolean;
  error?: string | null;
  detail?: string | null;
  fixAction?: string | null;
  fixHref?: string | null;
  source: MetaConnectionSource;
  apiError?: boolean;
  permissionWarning?: boolean;
};

@Injectable()
export class MetaCenterIntegrationStatusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fbConfig: FacebookConfigService,
    private readonly autopost: SocialAutopostSettingsService,
    private readonly waConfig: WhatsAppConfigService,
    private readonly catalog: MetaCatalogService,
    @Inject(forwardRef(() => MetaConnectOAuthService))
    private readonly oauth: MetaConnectOAuthService,
    private readonly graph: MetaGraphClientService,
  ) {}

  buildCheck(input: BuildCheckInput): MetaConnectionCheck {
    const status = this.resolveStatus(input);
    const error =
      input.permissionWarning && !input.connected
        ? input.error ?? input.detail ?? 'Vyžaduje oprávnění Meta App'
        : input.optional && !input.connected
          ? 'Nenastaveno (volitelné)'
          : input.connected
            ? null
            : input.error ?? 'Chybí konfigurace';
    return {
      key: input.key,
      label: input.label,
      connected: input.connected,
      optional: input.optional,
      status,
      error,
      detail: input.detail ?? null,
      fixAction: input.connected ? null : input.fixAction ?? null,
      fixHref: input.connected ? null : input.fixHref ?? null,
      source: input.source,
    };
  }

  private resolveStatus(input: BuildCheckInput): MetaConnectionStatusLevel {
    if (input.optional && !input.connected) return 'optional';
    if (input.connected) return 'online';
    if (input.permissionWarning) return 'permission_warning';
    if (input.apiError) return 'api_error';
    return 'missing_config';
  }

  async getFacebookPageFromSocialModule() {
    await this.autopost.reload();
    const publicSettings = this.autopost.toPublic();
    const pageId = this.autopost.resolveFacebookPageId();
    const token = this.autopost.resolveFacebookPageAccessToken();
    const publishingReady = this.autopost.isFacebookPublishingConfigured();
    const autopostReady = this.autopost.isFacebookAutopostReady();
    const pageName = publicSettings.facebook.pageName?.trim() || null;
    return {
      pageId,
      pageName,
      token,
      tokenSet: Boolean(token),
      publishingReady,
      autopostReady,
      connected: publishingReady,
      detail: pageId
        ? `${pageName ?? pageId}${autopostReady ? ' · autopost zapnutý' : ''}`
        : null,
    };
  }

  async getUserFacebookPagesStatus() {
    const [activeCount, totalCount] = await Promise.all([
      this.prisma.facebookPageConnection.count({ where: { isActive: true } }),
      this.prisma.facebookPageConnection.count(),
    ]);
    return {
      activeCount,
      totalCount,
      connected: activeCount > 0,
      detail:
        activeCount > 0
          ? `${activeCount} aktivních připojení uživatelských stránek`
          : totalCount > 0
            ? `${totalCount} stránek bez aktivní synchronizace`
            : 'Žádné uživatelské stránky',
    };
  }

  getWhatsAppStatus() {
    const config = this.waConfig.getConfigStatus();
    const phoneNumberId = this.waConfig.getPhoneNumberId();
    const wabaId = this.waConfig.getBusinessAccountId();
    const businessId = this.waConfig.getMetaBusinessId?.() ?? null;
    const tokenSet = Boolean(this.waConfig.getAccessToken());
    const configured =
      config.configured || Boolean(tokenSet && phoneNumberId && wabaId);
    const detail = [
      phoneNumberId ? `Phone Number ID: ${phoneNumberId}` : null,
      wabaId ? `WABA ID: ${wabaId}` : null,
      businessId ? `Business ID: ${businessId}` : null,
    ]
      .filter(Boolean)
      .join(' · ');
    return {
      configured,
      enabled: config.enabled,
      missing: config.missing,
      webhookUri: config.webhookUri,
      detail: detail || (config.missing.length ? `Chybí: ${config.missing.join(', ')}` : null),
    };
  }

  async getFeedStatus() {
    const settings = await this.catalog.getAdminSettings();
    let itemCount = 0;
    let feedOk = false;
    try {
      const stats = await this.catalog.computeFeedStats('csv');
      itemCount = stats.itemCount;
      feedOk = stats.itemCount > 0;
    } catch {
      feedOk = false;
    }
    return {
      enabled: settings.enabled,
      itemCount,
      connected: settings.enabled && feedOk,
      detail: feedOk
        ? `${itemCount} položek ve feedu`
        : settings.enabled
          ? 'Feed je prázdný nebo nebyl vygenerován'
          : 'Meta katalog není zapnutý',
    };
  }

  async getCatalogEnvStatus() {
    const row = await this.prisma.metaCenterSetting.findUnique({ where: { id: SETTINGS_ID } });
    const ids = resolveMetaCenterIds(row ?? ({} as never));
    const feed = await this.getFeedStatus();
    const catalogIdSet = Boolean(ids.catalogId);
    const businessIdSet = Boolean(ids.businessId);
    return {
      businessId: ids.businessId,
      catalogId: ids.catalogId,
      datasetId: ids.datasetId,
      catalogOnline: catalogIdSet && feed.connected,
      commerceOnline: businessIdSet && catalogIdSet && feed.connected,
      catalogMessage: !catalogIdSet
        ? 'Chybí FACEBOOK_CATALOG_ID (ENV nebo Meta Connect).'
        : feed.connected
          ? `Katalog ${ids.catalogId} — ${feed.detail}`
          : feed.detail,
      commerceMessage: !businessIdSet
        ? 'Chybí FACEBOOK_BUSINESS_ID.'
        : !catalogIdSet
          ? 'Chybí FACEBOOK_CATALOG_ID.'
          : feed.connected
            ? `Business ${ids.businessId}, katalog ${ids.catalogId} — ${feed.detail}`
            : feed.detail,
      feed,
    };
  }

  async resolveBestGraphToken(): Promise<{
    token: string | null;
    source: MetaConnectionSource;
    label: string;
  }> {
    await this.autopost.reload();
    const pageToken = this.autopost.resolveFacebookPageAccessToken();
    if (pageToken) {
      return { token: pageToken, source: 'social_autopost', label: 'token Facebook stránky' };
    }
    const waToken = this.waConfig.getAccessToken();
    if (waToken) {
      return { token: waToken, source: 'whatsapp_module', label: 'WhatsApp access token' };
    }
    try {
      const marketingToken = await this.oauth.tryResolveMarketingAccessToken();
      if (marketingToken) {
        return {
          token: marketingToken,
          source: 'meta_connect',
          label: 'Meta Marketing App OAuth token',
        };
      }
      const pagesToken = await this.oauth.resolveAccessToken();
      if (pagesToken) {
        return { token: pagesToken, source: 'meta_connect', label: 'Meta Pages OAuth token' };
      }
    } catch {
      // no marketing token
    }
    return { token: null, source: 'env', label: 'žádný token' };
  }

  async pingGraphApi(): Promise<{
    ok: boolean;
    error: string | null;
    source: MetaConnectionSource;
    detail: string;
  }> {
    const resolved = await this.resolveBestGraphToken();
    if (!resolved.token) {
      return {
        ok: false,
        error: 'Chybí platný access token (stránka, WhatsApp nebo Meta Connect).',
        source: 'env',
        detail: 'Žádný token k ověření Graph API',
      };
    }
    const ping = await this.graph.get<{ id?: string; name?: string }>(
      '/me',
      resolved.token,
      { fields: 'id,name' },
    );
    return {
      ok: ping.ok,
      error: ping.ok ? null : ping.errorMessage,
      source: resolved.source,
      detail: ping.ok
        ? `Graph API OK přes ${resolved.label}${ping.data.name ? ` (${ping.data.name})` : ''}`
        : `Graph API selhalo přes ${resolved.label}`,
    };
  }

  async verifyFacebookPageToken(pageId: string, token: string) {
    const res = await this.graph.get<{ id?: string; name?: string }>(
      `/${pageId}`,
      token,
      { fields: 'id,name' },
    );
    return res;
  }

  getWebhookStatus() {
    const wa = this.waConfig.getConfigStatus();
    const fb = this.fbConfig.getConfigStatus();
    const waOk = Boolean(wa.webhookUri && wa.configured);
    const fbOk = Boolean(fb.webhookUri);
    const connected = waOk || fbOk;
    const detail = waOk
      ? `WhatsApp webhook: ${wa.webhookUri}`
      : fbOk
        ? `Facebook webhook: ${fb.webhookUri}`
        : 'Webhook URI není nastaveno';
    return { connected, detail, source: waOk ? ('whatsapp_module' as const) : ('env' as const) };
  }
}
