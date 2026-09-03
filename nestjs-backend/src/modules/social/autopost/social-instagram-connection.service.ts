import { Injectable, Logger } from '@nestjs/common';
import { FacebookConfigService } from '../facebook/facebook-config.service';
import { GRAPH_API } from '../facebook/facebook-page.constants';
import { MetaInstagramIdentityService } from '../../meta-center/meta-instagram-identity.service';
import { SocialAutopostSettingsService } from './social-autopost-settings.service';
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

  constructor(
    private readonly settings: SocialAutopostSettingsService,
    private readonly fbConfig: FacebookConfigService,
    private readonly metaIdentity: MetaInstagramIdentityService,
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
  }

  private async fetchIgProfile(
    igUserId: string,
    accessToken: string,
  ): Promise<GraphIgProfile | null> {
    try {
      const url = `${this.graphBase()}/${encodeURIComponent(igUserId)}?fields=id,username,name,profile_picture_url&access_token=${encodeURIComponent(accessToken)}`;
      const res = await fetch(url);
      const json = (await res.json()) as GraphIgProfile & { error?: { message?: string } };
      if (!res.ok) {
        this.logger.warn(`IG profile fetch failed: ${json.error?.message ?? res.status}`);
        return null;
      }
      return json;
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
    const res = await fetch(url);
    const json = (await res.json()) as { data?: DebugTokenData };
    return json.data ?? { is_valid: false, scopes: [] };
  }

  async getConnectionStatus(): Promise<InstagramConnectionStatus> {
    await this.settings.reload();
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

    const debug = token ? await this.debugToken(token) : { is_valid: false, scopes: [] };
    const scopes = debug.scopes ?? fb.tokenScopes ?? [];
    const missing = INSTAGRAM_REQUIRED_SCOPES.filter((s) => !scopes.includes(s));
    const scopesOk = missing.length === 0;
    diagnostics.push({
      key: 'permissions',
      label: 'Oprávnění',
      ok: scopesOk,
      message: scopesOk
        ? 'Všechna potřebná oprávnění'
        : `Chybí: ${missing.join(', ')}`,
    });

    diagnostics.push({
      key: 'publish_capability',
      label: 'Možnost publikování médií',
      ok: igOk && scopesOk && tokenOk && debug.is_valid !== false,
      message:
        igOk && scopesOk
          ? 'instagram_content_publish dostupné'
          : 'Nelze publikovat — dokončete propojení a oprávnění',
    });

    let apiOk = false;
    let apiMessage: string | null = null;
    if (igId && token) {
      const profile = await this.fetchIgProfile(igId, token);
      apiOk = Boolean(profile?.id);
      apiMessage = apiOk ? 'API komunikace OK' : 'Nepodařilo se načíst profil IG';
      if (profile?.username) igUsername = profile.username;
      if (profile?.name) igName = profile.name;
      if (profile?.profile_picture_url) profilePictureUrl = profile.profile_picture_url;
    }
    diagnostics.push({
      key: 'api',
      label: 'API komunikace',
      ok: apiOk,
      message: apiMessage,
    });

    const connected = igOk && tokenOk && pageOk && debug.is_valid !== false;
    const needsReconnect = !scopesOk || debug.is_valid === false;

    return {
      connected,
      instagramBusinessId: igId,
      instagramUsername: igUsername,
      instagramName: igName,
      profilePictureUrl,
      linkedPageId: pageId,
      linkedPageName: fb.pageName || null,
      tokenActive: tokenOk && debug.is_valid !== false,
      tokenExpiresAt: fb.tokenExpiresAt,
      tokenScopes: scopes,
      missingScopes: [...missing],
      scopesOk,
      needsReconnect,
      message: connected
        ? null
        : needsReconnect
          ? 'Je nutné obnovit Meta oprávnění (připojit Facebook znovu).'
          : 'Instagram účet není propojen s Facebook stránkou.',
      diagnostics,
    };
  }
}
