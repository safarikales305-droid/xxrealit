import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../../database/prisma.service';
import { TokenEncryptionService } from '../token-encryption.service';
import { FacebookConfigService } from '../facebook/facebook-config.service';
import { FacebookPageService, type FacebookPageOption } from '../facebook/facebook-page.service';
import {
  FACEBOOK_OAUTH_DIALOG,
  FACEBOOK_PAGE_API_SCOPES,
  GRAPH_API,
} from '../facebook/facebook-page.constants';
import { isFacebookPageScopeError } from '../facebook/facebook-page-scope.util';
import { SocialAutopostSettingsService } from './social-autopost-settings.service';

const ADMIN_OAUTH_MODE = 'admin_autopost';
const PREFERRED_PAGE_HINTS = ['xxrealit.cz', 'xxrealit', 'xx realit'];

type GraphTokenResponse = { access_token?: string; expires_in?: number };
type GraphAccountsResponse = {
  data?: Array<{ id?: string; name?: string; access_token?: string; picture?: { data?: { url?: string } } }>;
};
type DebugTokenResponse = {
  data?: {
    is_valid?: boolean;
    expires_at?: number;
    scopes?: string[];
    type?: string;
  };
};

export type FacebookAutopostOAuthCallbackResult = {
  ok: boolean;
  redirectUrl: string;
  message?: string;
};

@Injectable()
export class SocialAutopostFacebookOAuthService {
  private readonly logger = new Logger(SocialAutopostFacebookOAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly crypto: TokenEncryptionService,
    private readonly facebookConfig: FacebookConfigService,
    private readonly facebookPage: FacebookPageService,
    private readonly settings: SocialAutopostSettingsService,
  ) {}

  private frontendUrl(): string {
    return (
      this.config.get<string>('FRONTEND_URL')?.trim().replace(/\/+$/, '') ||
      'https://www.xxrealit.cz'
    );
  }

  getAdminSettingsUrl(): string {
    return `${this.frontendUrl()}/admin/marketing/socialni-site`;
  }

  private pageConnectRedirectUri(): string {
    return this.facebookConfig.resolvePageConnectRedirectUri();
  }

  private assertConfigured() {
    if (!this.facebookConfig.isPagesConfigured()) {
      throw new ServiceUnavailableException(this.facebookConfig.pagesConfigurationErrorMessage());
    }
  }

  private async cleanupAdminOAuthSession(userId: string) {
    await this.prisma.socialFacebookOAuthSession.deleteMany({
      where: { userId, mode: ADMIN_OAUTH_MODE },
    });
  }

  async buildConnectUrl(adminUserId: string): Promise<string> {
    this.assertConfigured();
    const state = `m${randomBytes(23).toString('hex')}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await this.cleanupAdminOAuthSession(adminUserId);
    await this.prisma.socialFacebookOAuthSession.create({
      data: {
        id: state,
        userId: adminUserId,
        mode: ADMIN_OAUTH_MODE,
        userAccessToken: this.crypto.encrypt('pending'),
        expiresAt,
      },
    });

    this.logger.log(`[admin-autopost-oauth] start userId=${adminUserId} state=${state}`);

    const redirectUri = encodeURIComponent(this.pageConnectRedirectUri());
    const appId = encodeURIComponent(this.facebookConfig.getPagesAppId()!);
    const scope = encodeURIComponent(FACEBOOK_PAGE_API_SCOPES);
    return (
      `${FACEBOOK_OAUTH_DIALOG}?` +
      `client_id=${appId}&redirect_uri=${redirectUri}&state=${state}&scope=${scope}&response_type=code&prompt=select_account`
    );
  }

  async handleCallback(
    code: string | undefined,
    state: string | undefined,
    oauthError?: string,
    errorReason?: string,
    errorDescription?: string,
  ): Promise<FacebookAutopostOAuthCallbackResult> {
    const settingsUrl = this.getAdminSettingsUrl();

    if (oauthError?.trim() || errorReason?.trim() || errorDescription?.trim()) {
      const reason = (errorDescription ?? errorReason ?? oauthError ?? 'oauth_denied').slice(0, 120);
      return {
        ok: false,
        redirectUrl: `${settingsUrl}?facebook=error&reason=${encodeURIComponent(reason)}`,
      };
    }

    if (!code?.trim()) {
      return { ok: false, redirectUrl: `${settingsUrl}?facebook=error&reason=missing_code` };
    }
    if (!state?.trim().startsWith('m')) {
      return { ok: false, redirectUrl: `${settingsUrl}?facebook=error&reason=missing_state` };
    }

    const session = await this.prisma.socialFacebookOAuthSession.findUnique({
      where: { id: state.trim() },
    });
    if (
      !session?.userId ||
      session.mode !== ADMIN_OAUTH_MODE ||
      session.expiresAt.getTime() < Date.now()
    ) {
      return { ok: false, redirectUrl: `${settingsUrl}?facebook=error&reason=session_expired` };
    }

    try {
      const shortToken = await this.exchangeCodeForToken(code.trim());
      const longLived = await this.exchangeForLongLivedToken(shortToken);
      const userToken = longLived.access_token?.trim() || shortToken;
      const userExpiresIn = longLived.expires_in;
      const userTokenExpiresAt =
        userExpiresIn != null && Number.isFinite(userExpiresIn)
          ? new Date(Date.now() + userExpiresIn * 1000)
          : null;

      await this.persistPagesUserToken(session.userId, userToken, userTokenExpiresAt);

      await this.settings.updateSettings({
        facebook: {
          userAccessToken: userToken,
          tokenObtainedAt: new Date().toISOString(),
          tokenWarning: null,
        },
      });

      const pages = await this.listManagedPages(session.userId, userToken);
      await this.cleanupAdminOAuthSession(session.userId);

      this.logger.log(
        `[admin-autopost-oauth] pages loaded userId=${session.userId} count=${pages.length}`,
      );

      if (!pages.length) {
        return { ok: false, redirectUrl: `${settingsUrl}?facebook=error&reason=no_pages` };
      }

      const preferred = this.findPreferredPage(pages);
      if (pages.length === 1) {
        const only = pages[0];
        return {
          ok: true,
          redirectUrl:
            `${settingsUrl}?facebook=confirm` +
            `&pageId=${encodeURIComponent(only.id)}` +
            `&pageName=${encodeURIComponent(only.name)}` +
            (preferred ? '&preferred=1' : ''),
        };
      }

      const preferredQuery = preferred ? `&preferredPageId=${encodeURIComponent(preferred.id)}` : '';
      return { ok: true, redirectUrl: `${settingsUrl}?facebook=select${preferredQuery}` };
    } catch (err) {
      await this.cleanupAdminOAuthSession(session.userId);
      const reason = err instanceof Error ? err.message : 'oauth_failed';
      if (isFacebookPageScopeError(reason)) {
        return {
          ok: false,
          redirectUrl: `${settingsUrl}?facebook=error&reason=scopes_unavailable`,
          message: reason,
        };
      }
      return {
        ok: false,
        redirectUrl: `${settingsUrl}?facebook=error&reason=${encodeURIComponent(reason.slice(0, 120))}`,
      };
    }
  }

  async listPages(adminUserId: string): Promise<{ ok: boolean; pages: FacebookPageOption[]; error?: string }> {
    try {
      const { token } = await this.resolveUserAccessToken(adminUserId);
      const pages = await this.listManagedPages(adminUserId, token);
      return { ok: true, pages };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Nepodařilo se načíst stránky.';
      return { ok: false, pages: [], error: message };
    }
  }

  async selectPage(
    adminUserId: string,
    pageId: string,
  ): Promise<{ ok: boolean; pageId?: string; pageName?: string; error?: string }> {
    try {
      const { token: userToken } = await this.resolveUserAccessToken(adminUserId);
      const accounts = await this.facebookPage.fetchGraphJson<GraphAccountsResponse>(
        `${GRAPH_API}/me/accounts?fields=id,name,access_token&limit=100&access_token=${encodeURIComponent(userToken)}`,
      );
      const pageRow = (accounts.data ?? []).find((p) => p.id === pageId.trim());
      if (!pageRow?.id || !pageRow.name) {
        throw new BadRequestException('Vybraná stránka není mezi stránkami, které spravujete.');
      }
      const pageToken = pageRow.access_token?.trim();
      if (!pageToken) {
        throw new BadRequestException('Nepodařilo se získat Page Access Token.');
      }

      const debug = await this.debugToken(pageToken);
      const tokenExpiresAt =
        debug.expires_at && debug.expires_at > 0
          ? new Date(debug.expires_at * 1000).toISOString()
          : null;

      await this.settings.updateSettings({
        facebook: {
          pageId: pageRow.id,
          pageName: pageRow.name,
          pageAccessToken: pageToken,
          userAccessToken: userToken,
          tokenObtainedAt: new Date().toISOString(),
          tokenExpiresAt,
          tokenScopes: debug.scopes ?? FACEBOOK_PAGE_API_SCOPES.split(','),
          tokenWarning: null,
          connectedViaOAuth: true,
        },
      });

      this.logger.log(
        `[admin-autopost-oauth] page selected userId=${adminUserId} pageId=${pageRow.id} pageName=${pageRow.name}`,
      );

      return { ok: true, pageId: pageRow.id, pageName: pageRow.name };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Výběr stránky selhal.';
      return { ok: false, error: message };
    }
  }

  async refreshPageAccessToken(): Promise<{ ok: boolean; error?: string }> {
    await this.settings.reload();
    const pageId = this.settings.resolveFacebookPageId();
    const userToken = this.settings.resolveFacebookUserAccessToken();
    if (!pageId || !userToken) {
      return { ok: false, error: 'Chybí uložený token — připojte Facebook znovu přes OAuth.' };
    }

    try {
      const refreshedUser = await this.exchangeForLongLivedToken(userToken);
      const newUserToken = refreshedUser.access_token?.trim() || userToken;
      const userExpiresIn = refreshedUser.expires_in;
      const userTokenExpiresAt =
        userExpiresIn != null && Number.isFinite(userExpiresIn)
          ? new Date(Date.now() + userExpiresIn * 1000).toISOString()
          : null;

      const accounts = await this.facebookPage.fetchGraphJson<GraphAccountsResponse>(
        `${GRAPH_API}/me/accounts?fields=id,name,access_token&limit=100&access_token=${encodeURIComponent(newUserToken)}`,
      );
      const pageRow = (accounts.data ?? []).find((p) => p.id === pageId);
      const pageToken = pageRow?.access_token?.trim();
      if (!pageToken) {
        return { ok: false, error: 'Stránka již není dostupná pod tímto účtem — obnovte OAuth.' };
      }

      const debug = await this.debugToken(pageToken);
      const pageExpiresAt =
        debug.expires_at && debug.expires_at > 0
          ? new Date(debug.expires_at * 1000).toISOString()
          : userTokenExpiresAt;

      await this.settings.updateSettings({
        facebook: {
          pageAccessToken: pageToken,
          userAccessToken: newUserToken,
          tokenExpiresAt: pageExpiresAt,
          tokenObtainedAt: new Date().toISOString(),
          tokenScopes: debug.scopes ?? undefined,
          tokenWarning: null,
        },
      });

      this.logger.log(`[admin-autopost-oauth] token refreshed pageId=${pageId}`);
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Obnova tokenu selhala.';
      await this.settings.setTokenWarning(message);
      return { ok: false, error: message };
    }
  }

  async debugToken(accessToken: string): Promise<{
    is_valid: boolean;
    expires_at: number;
    scopes: string[];
  }> {
    const appId = this.facebookConfig.getPagesAppId();
    const appSecret = this.facebookConfig.getPagesAppSecret();
    if (!appId || !appSecret) {
      return { is_valid: true, expires_at: 0, scopes: [] };
    }
    const appToken = `${appId}|${appSecret}`;
    const url =
      `${GRAPH_API}/debug_token?` +
      `input_token=${encodeURIComponent(accessToken)}` +
      `&access_token=${encodeURIComponent(appToken)}`;
    const res = await this.facebookPage.fetchGraphJson<DebugTokenResponse>(url);
    return {
      is_valid: res.data?.is_valid !== false,
      expires_at: res.data?.expires_at ?? 0,
      scopes: res.data?.scopes ?? [],
    };
  }

  findPreferredPage(pages: FacebookPageOption[]): FacebookPageOption | null {
    const normalized = (s: string) => s.toLowerCase().replace(/\s+/g, '');
    for (const hint of PREFERRED_PAGE_HINTS) {
      const match = pages.find((p) => normalized(p.name).includes(normalized(hint)));
      if (match) return match;
    }
    return null;
  }

  private async listManagedPages(userId: string, userToken: string): Promise<FacebookPageOption[]> {
    return this.facebookPage.listManagedPages(userId, {
      accessToken: userToken,
      tokenSource: 'new_oauth',
    });
  }

  private async resolveUserAccessToken(
    adminUserId: string,
  ): Promise<{ token: string; source: 'pages_auth_db' | 'settings' }> {
    const pagesAuth = await this.prisma.facebookPagesUserAuth.findUnique({
      where: { userId: adminUserId },
    });
    if (pagesAuth?.accessTokenEncrypted) {
      try {
        const token = this.crypto.decrypt(pagesAuth.accessTokenEncrypted);
        if (
          pagesAuth.tokenExpiresAt &&
          pagesAuth.tokenExpiresAt.getTime() < Date.now()
        ) {
          throw new BadRequestException('Facebook OAuth vypršel — klikněte na „Obnovit token“.');
        }
        return { token, source: 'pages_auth_db' };
      } catch (err) {
        if (err instanceof BadRequestException) throw err;
      }
    }

    const fromSettings = this.settings.resolveFacebookUserAccessToken();
    if (fromSettings) {
      return { token: fromSettings, source: 'settings' };
    }

    throw new BadRequestException(
      'Facebook není propojen. Klikněte na „Připojit Facebook“.',
    );
  }

  private async persistPagesUserToken(
    userId: string,
    userToken: string,
    tokenExpiresAt: Date | null,
  ) {
    const me = await this.facebookPage.fetchGraphJson<{ id?: string }>(
      `${GRAPH_API}/me?fields=id&access_token=${encodeURIComponent(userToken)}`,
    );
    if (!me.id) throw new BadRequestException('Neplatný Facebook token.');

    const scopes = FACEBOOK_PAGE_API_SCOPES.split(',');
    await this.prisma.facebookPagesUserAuth.upsert({
      where: { userId },
      create: {
        userId,
        facebookUserId: me.id,
        accessTokenEncrypted: this.crypto.encrypt(userToken),
        tokenExpiresAt,
        scopes,
      },
      update: {
        facebookUserId: me.id,
        accessTokenEncrypted: this.crypto.encrypt(userToken),
        tokenExpiresAt,
        scopes,
      },
    });
  }

  private async exchangeCodeForToken(code: string): Promise<string> {
    const appId = this.facebookConfig.getPagesAppId()!;
    const appSecret = this.facebookConfig.getPagesAppSecret()!;
    const redirectUri = encodeURIComponent(this.pageConnectRedirectUri());
    const url =
      `${GRAPH_API}/oauth/access_token?` +
      `client_id=${encodeURIComponent(appId)}` +
      `&redirect_uri=${redirectUri}` +
      `&client_secret=${encodeURIComponent(appSecret)}` +
      `&code=${encodeURIComponent(code)}`;
    const data = await this.facebookPage.fetchGraphJson<GraphTokenResponse>(url);
    const token = data.access_token?.trim();
    if (!token) throw new BadRequestException('Facebook OAuth nevrátil access token.');
    return token;
  }

  private async exchangeForLongLivedToken(shortToken: string): Promise<GraphTokenResponse> {
    const appId = this.facebookConfig.getPagesAppId()!;
    const appSecret = this.facebookConfig.getPagesAppSecret()!;
    const url =
      `${GRAPH_API}/oauth/access_token?` +
      `grant_type=fb_exchange_token&client_id=${encodeURIComponent(appId)}` +
      `&client_secret=${encodeURIComponent(appSecret)}` +
      `&fb_exchange_token=${encodeURIComponent(shortToken)}`;
    return this.facebookPage.fetchGraphJson<GraphTokenResponse>(url);
  }
}
