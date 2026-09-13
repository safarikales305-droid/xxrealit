import { Injectable, Logger } from '@nestjs/common';
import { FacebookConfigService } from '../facebook/facebook-config.service';
import { GRAPH_API } from '../facebook/facebook-page.constants';
import { MetaInstagramIdentityService } from '../../meta-center/meta-instagram-identity.service';
import { SocialAutopostSettingsService } from './social-autopost-settings.service';
import { MetaGraphCoordinatorService } from './meta-graph-coordinator.service';
import { isMetaGraphRateLimitError } from './meta-graph-error.util';
import {
  INSTAGRAM_REQUIRED_SCOPES,
  type InstagramConnectionStatus,
  type InstagramDiagnosticStep,
} from './social-instagram.types';

type GraphIgProfile = {
  id?: string;
  username?: string;
  name?: string;
  profile_picture_url?: string;
};

type DebugTokenData = {
  is_valid?: boolean;
  expires_at?: number;
  scopes?: string[];
};

@Injectable()
export class SocialInstagramConnectionService {
  private readonly logger = new Logger(SocialInstagramConnectionService.name);
  private statusCache: {
    expiresAt: number;
    status: InstagramConnectionStatus;
  } | null = null;
  private readonly statusCacheMs = 15 * 60 * 1000;

  constructor(
    private readonly settings: SocialAutopostSettingsService,
    private readonly fbConfig: FacebookConfigService,
    private readonly metaIdentity: MetaInstagramIdentityService,
    private readonly metaGraph: MetaGraphCoordinatorService,
  ) {}

  private graphBase(): string {
    const v = this.fbConfig.getGraphApiVersion();
    return GRAPH_API.replace(/v[\d.]+/, v.startsWith('v') ? v : `v${v}`);
  }

  async syncFromFacebookPage(): Promise<void> {
    await this.settings.reload();
    const pageId = this.settings.resolveFacebookPageId();
    const token = this.settings.resolveFacebookPageAccessToken();
    if (!pageId || !token) return;

    const ig = await this.metaIdentity.resolveInstagramBusinessId(pageId, token);
    let profile: GraphIgProfile | null = null;
    if (ig.id) {
      profile = await this.fetchIgProfile(ig.id, token);
    }

    const fb = this.settings.getSettings().facebook;
    await this.settings.updateSettings({
      instagram: {
        instagramBusinessId: ig.id,
        instagramUsername: profile?.username ?? ig.username,
        instagramName: profile?.name ?? null,
        profilePictureUrl: profile?.profile_picture_url ?? null,
        linkedPageId: pageId,
        linkedPageName: fb.pageName || null,
        connected: Boolean(ig.id),
        lastSyncedAt: new Date().toISOString(),
      },
    });
    this.statusCache = null;
  }

  private async fetchIgProfile(
    igUserId: string,
    accessToken: string,
  ): Promise<GraphIgProfile | null> {
    try {
      const url = `${this.graphBase()}/${encodeURIComponent(igUserId)}?fields=id,username,name,profile_picture_url&access_token=${encodeURIComponent(accessToken)}`;
      const res = await this.metaGraph.fetchJson<GraphIgProfile & { error?: { message?: string } }>(
        url,
        undefined,
        {
          dedupeKey: `ig-profile:${igUserId}`,
          cacheTtlMs: 20 * 60_000,
        },
      );
      if (!res.ok) {
        if (isMetaGraphRateLimitError(res.error)) {
          this.logger.warn(`IG profile fetch rate limited: ${res.error.message}`);
        } else {
          this.logger.warn(`IG profile fetch failed: ${res.error.message}`);
        }
        return null;
      }
      return res.data;
    } catch (err) {
      this.logger.warn(`IG profile fetch error: ${err}`);
      return null;
    }
  }

  private async debugToken(accessToken: string): Promise<DebugTokenData> {
    const appId = process.env.FACEBOOK_PAGES_APP_ID?.trim();
    const appSecret = process.env.FACEBOOK_PAGES_APP_SECRET?.trim();
    if (!appId || !appSecret) return { is_valid: true, scopes: [] };
    const input = encodeURIComponent(accessToken);
    const url = `${this.graphBase()}/debug_token?input_token=${input}&access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`;
    const res = await this.metaGraph.fetchJson<{ data?: DebugTokenData }>(url, undefined, {
      dedupeKey: `ig-debug-token:${accessToken.slice(-8)}`,
      cacheTtlMs: 20 * 60_000,
    });
    if (!res.ok) {
      if (isMetaGraphRateLimitError(res.error)) {
        return { is_valid: true, scopes: this.settings.getSettings().facebook.tokenScopes ?? [] };
      }
      return { is_valid: false, scopes: [] };
    }
    return res.data?.data ?? { is_valid: false, scopes: [] };
  }

  private buildStatusFromStoredData(options?: {
    rateLimited?: boolean;
    cached?: boolean;
  }): InstagramConnectionStatus {
    const ig = this.settings.getSettings().instagram;
    const pageId = this.settings.resolveFacebookPageId();
    const token = this.settings.resolveFacebookPageAccessToken();
    const fb = this.settings.getSettings().facebook;
    const igId = ig.instagramBusinessId?.trim() ?? null;
    const igUsername = ig.instagramUsername?.trim() ?? null;
    const scopes = fb.tokenScopes ?? [];
    const missing = INSTAGRAM_REQUIRED_SCOPES.filter((s) => !scopes.includes(s));
    const scopesOk = missing.length === 0;
    const tokenOk = Boolean(token);
    const pageOk = Boolean(pageId);
    const igOk = Boolean(igId);
    const rateLimited = options?.rateLimited === true;

    const diagnostics: InstagramDiagnosticStep[] = [
      {
        key: 'meta_token',
        label: 'Meta token',
        ok: tokenOk,
        message: tokenOk ? 'Aktivní (cache)' : 'Chybí Page Access Token — připojte Facebook',
      },
      {
        key: 'facebook_page',
        label: 'Facebook Page nalezena',
        ok: pageOk,
        message: pageOk ? `${fb.pageName || pageId}` : 'Chybí Page ID',
      },
      {
        key: 'instagram_account',
        label: 'Instagram Business Account nalezen',
        ok: igOk,
        message: igOk
          ? `@${igUsername ?? igId}`
          : 'Stránka nemá propojený instagram_business_account',
      },
      {
        key: 'permissions',
        label: 'Oprávnění',
        ok: scopesOk,
        message: scopesOk
          ? 'Všechna potřebná oprávnění (cache)'
          : `Chybí: ${missing.join(', ')}`,
      },
      {
        key: 'publish_capability',
        label: 'Možnost publikování médií',
        ok: igOk && scopesOk && tokenOk,
        message:
          igOk && scopesOk
            ? rateLimited
              ? 'Meta dočasně omezuje API — publikace bude odložena'
              : 'Publikace Reels přes Page token (cache)'
            : 'Nelze publikovat — dokončete propojení stránky a Page oprávnění',
      },
      {
        key: 'api',
        label: 'API komunikace',
        ok: !rateLimited,
        message: rateLimited
          ? 'Meta rate limit — použita cache'
          : 'Použita cache (bez live Graph volání)',
      },
    ];

    const connected = igOk && tokenOk && pageOk;
    const needsReconnect = !scopesOk && !rateLimited;

    return {
      connected,
      instagramBusinessId: igId,
      instagramUsername: igUsername,
      instagramName: ig.instagramName?.trim() ?? null,
      profilePictureUrl: ig.profilePictureUrl?.trim() ?? null,
      linkedPageId: pageId,
      linkedPageName: fb.pageName || null,
      tokenActive: tokenOk,
      tokenExpiresAt: fb.tokenExpiresAt,
      tokenScopes: scopes,
      missingScopes: [...missing],
      scopesOk,
      needsReconnect,
      rateLimited,
      cached: options?.cached ?? true,
      message: rateLimited
        ? 'Instagram je propojen, Meta dočasně omezuje počet požadavků.'
        : connected
          ? null
          : needsReconnect
            ? 'Je nutné obnovit Meta oprávnění (připojit Facebook znovu).'
            : 'Instagram účet není propojen s Facebook stránkou.',
      diagnostics,
    };
  }

  async getConnectionStatus(options?: {
    bypassCache?: boolean;
    forceLive?: boolean;
  }): Promise<InstagramConnectionStatus> {
    await this.settings.reload();
    const now = Date.now();
    if (
      !options?.bypassCache &&
      !options?.forceLive &&
      this.statusCache &&
      this.statusCache.expiresAt > now
    ) {
      return { ...this.statusCache.status, cached: true };
    }

    if (
      !options?.forceLive &&
      (this.metaGraph.isInBackoff() || this.metaGraph.getTelemetry().apiStatus === 'BACKOFF')
    ) {
      const cached = this.buildStatusFromStoredData({ rateLimited: true, cached: true });
      this.statusCache = { expiresAt: now + this.statusCacheMs, status: cached };
      return cached;
    }

    const ig = this.settings.getSettings().instagram;
    const pageId = this.settings.resolveFacebookPageId();
    const token = this.settings.resolveFacebookPageAccessToken();
    const fb = this.settings.getSettings().facebook;
    const diagnostics: InstagramDiagnosticStep[] = [];

    const tokenOk = Boolean(token);
    diagnostics.push({
      key: 'meta_token',
      label: 'Meta token',
      ok: tokenOk,
      message: tokenOk ? 'Aktivní' : 'Chybí Page Access Token — připojte Facebook',
    });

    const pageOk = Boolean(pageId);
    diagnostics.push({
      key: 'facebook_page',
      label: 'Facebook Page nalezena',
      ok: pageOk,
      message: pageOk ? `${fb.pageName || pageId}` : 'Chybí Page ID',
    });

    let igId = ig.instagramBusinessId?.trim() ?? null;
    let igUsername = ig.instagramUsername?.trim() ?? null;
    let igName = ig.instagramName?.trim() ?? null;
    let profilePictureUrl = ig.profilePictureUrl?.trim() ?? null;
    let rateLimited = false;

    if (pageOk && tokenOk && !igId && !options?.forceLive) {
      const cached = this.buildStatusFromStoredData({ cached: false });
      this.statusCache = { expiresAt: now + this.statusCacheMs, status: cached };
      return cached;
    }

    if (pageOk && tokenOk && !igId) {
      const resolved = await this.metaIdentity.resolveInstagramBusinessId(pageId!, token!);
      igId = resolved.id;
      igUsername = resolved.username;
    }

    const igOk = Boolean(igId);
    diagnostics.push({
      key: 'instagram_account',
      label: 'Instagram Business Account nalezen',
      ok: igOk,
      message: igOk
        ? `@${igUsername ?? igId}`
        : 'Stránka nemá propojený instagram_business_account',
    });

    const expiresAt = fb.tokenExpiresAt?.trim();
    const skipDebugToken = !expiresAt || expiresAt === 'never';
    const debug = token && !skipDebugToken ? await this.debugToken(token) : { is_valid: true, scopes: [] };
    if (token && skipDebugToken) {
      rateLimited = this.metaGraph.isInBackoff();
    }
    const scopes = debug.scopes ?? fb.tokenScopes ?? [];
    const missing = INSTAGRAM_REQUIRED_SCOPES.filter((s) => !scopes.includes(s));
    const scopesOk = missing.length === 0;
    diagnostics.push({
      key: 'permissions',
      label: 'Oprávnění',
      ok: scopesOk,
      message: scopesOk
        ? skipDebugToken
          ? 'Všechna potřebná oprávnění (Page token)'
          : 'Všechna potřebná oprávnění'
        : `Chybí: ${missing.join(', ')}`,
    });

    diagnostics.push({
      key: 'publish_capability',
      label: 'Možnost publikování médií',
      ok: igOk && scopesOk && tokenOk && debug.is_valid !== false && !rateLimited,
      message:
        rateLimited
          ? 'Meta dočasně omezuje API — publikace bude odložena'
          : igOk && scopesOk
            ? 'Publikace Reels přes Page token (instagram_business_account)'
            : 'Nelze publikovat — dokončete propojení stránky a Page oprávnění',
    });

    let apiOk = false;
    let apiMessage: string | null = null;
    if (igId && token && options?.forceLive) {
      const profile = await this.fetchIgProfile(igId, token);
      apiOk = Boolean(profile?.id);
      apiMessage = apiOk ? 'API komunikace OK' : 'Nepodařilo se načíst profil IG';
      if (profile?.username) igUsername = profile.username;
      if (profile?.name) igName = profile.name;
      if (profile?.profile_picture_url) profilePictureUrl = profile.profile_picture_url;
    } else if (igId && token) {
      apiOk = true;
      apiMessage = 'Použita uložená data (bez live Graph volání)';
    }
    diagnostics.push({
      key: 'api',
      label: 'API komunikace',
      ok: apiOk && !rateLimited,
      message: rateLimited ? 'Meta rate limit — použita cache' : apiMessage,
    });

    const connected = (igOk && tokenOk && pageOk && debug.is_valid !== false) || rateLimited;
    const needsReconnect = !rateLimited && (!scopesOk || debug.is_valid === false);

    const status: InstagramConnectionStatus = {
      connected,
      instagramBusinessId: igId,
      instagramUsername: igUsername,
      instagramName: igName,
      profilePictureUrl,
      linkedPageId: pageId,
      linkedPageName: fb.pageName || null,
      tokenActive: tokenOk && (debug.is_valid !== false || rateLimited),
      tokenExpiresAt: fb.tokenExpiresAt,
      tokenScopes: scopes,
      missingScopes: [...missing],
      scopesOk,
      needsReconnect,
      rateLimited,
      cached: false,
      message: rateLimited
        ? 'Instagram je propojen, Meta dočasně omezuje počet požadavků.'
        : connected
          ? null
          : needsReconnect
            ? 'Je nutné obnovit Meta oprávnění (připojit Facebook znovu).'
            : 'Instagram účet není propojen s Facebook stránkou.',
      diagnostics,
    };

    if (!options?.forceLive) {
      this.statusCache = { expiresAt: now + this.statusCacheMs, status };
    }
    return status;
  }
}
