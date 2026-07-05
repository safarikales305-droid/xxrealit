import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { FacebookConfigService } from '../social/facebook/facebook-config.service';
import { FacebookPageService } from '../social/facebook/facebook-page.service';
import { TokenEncryptionService } from '../social/token-encryption.service';
import { isFacebookPageScopeError } from '../social/facebook/facebook-page-scope.util';
import {
  META_CENTER_ADMIN_URL,
  META_CENTER_CONNECT_SCOPES,
  META_CENTER_OAUTH_MODE,
  META_CENTER_OAUTH_STATE_PREFIX,
} from './meta-connect.constants';
import { MetaConnectDiscoveryService } from './meta-connect-discovery.service';
import { MetaGraphClientService } from './meta-graph-client.service';

const SETTINGS_ID = 'default';

type GraphTokenResponse = { access_token?: string; expires_in?: number };
type DebugTokenResponse = {
  data?: { is_valid?: boolean; expires_at?: number; scopes?: string[] };
};

export type MetaConnectCallbackResult = {
  ok: boolean;
  redirectUrl: string;
  message?: string;
};

@Injectable()
export class MetaConnectOAuthService {
  private readonly logger = new Logger(MetaConnectOAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly crypto: TokenEncryptionService,
    private readonly fbConfig: FacebookConfigService,
    private readonly facebookPage: FacebookPageService,
    private readonly graph: MetaGraphClientService,
    private readonly discovery: MetaConnectDiscoveryService,
  ) {}

  private frontendUrl(): string {
    return (
      this.config.get<string>('FRONTEND_URL')?.trim().replace(/\/+$/, '') ||
      'https://www.xxrealit.cz'
    );
  }

  getAdminUrl(): string {
    return `${this.frontendUrl()}${META_CENTER_ADMIN_URL}`;
  }

  resolveRedirectUri(): string {
    return this.fbConfig.resolveMetaConnectRedirectUri();
  }

  private assertConfigured() {
    if (!this.fbConfig.isPagesConfigured()) {
      throw new ServiceUnavailableException(this.fbConfig.pagesConfigurationErrorMessage());
    }
  }

  private async cleanupSession(userId: string) {
    await this.prisma.socialFacebookOAuthSession.deleteMany({
      where: { userId, mode: META_CENTER_OAUTH_MODE },
    });
  }

  async buildConnectUrl(adminUserId: string): Promise<string> {
    this.assertConfigured();
    this.fbConfig.assertPagesAppIdValid();

    const pagesAppId = this.fbConfig.getPagesAppId();
    if (!pagesAppId) {
      throw new ServiceUnavailableException(this.fbConfig.pagesConfigurationErrorMessage());
    }

    const state = `${META_CENTER_OAUTH_STATE_PREFIX}${randomBytes(23).toString('hex')}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await this.cleanupSession(adminUserId);
    await this.prisma.socialFacebookOAuthSession.create({
      data: {
        id: state,
        userId: adminUserId,
        mode: META_CENTER_OAUTH_MODE,
        userAccessToken: this.crypto.encrypt('pending'),
        expiresAt,
      },
    });

    const redirectUri = encodeURIComponent(this.resolveRedirectUri());
    const appId = encodeURIComponent(pagesAppId);
    const scope = encodeURIComponent(META_CENTER_CONNECT_SCOPES);
    return (
      `${this.graph.oauthDialogUrl()}?` +
      `client_id=${appId}&redirect_uri=${redirectUri}&state=${state}` +
      `&scope=${scope}&response_type=code&prompt=consent`
    );
  }

  async handleCallback(
    code: string | undefined,
    state: string | undefined,
    oauthError?: string,
    errorReason?: string,
    errorDescription?: string,
  ): Promise<MetaConnectCallbackResult> {
    const adminUrl = this.getAdminUrl();

    if (oauthError?.trim() || errorReason?.trim() || errorDescription?.trim()) {
      const reason = (errorDescription ?? errorReason ?? oauthError ?? 'oauth_denied').slice(0, 160);
      return {
        ok: false,
        redirectUrl: `${adminUrl}?meta=error&reason=${encodeURIComponent(reason)}`,
      };
    }
    if (!code?.trim()) {
      return { ok: false, redirectUrl: `${adminUrl}?meta=error&reason=missing_code` };
    }
    if (!state?.trim().startsWith(META_CENTER_OAUTH_STATE_PREFIX)) {
      return { ok: false, redirectUrl: `${adminUrl}?meta=error&reason=missing_state` };
    }

    const session = await this.prisma.socialFacebookOAuthSession.findUnique({
      where: { id: state.trim() },
    });
    if (
      !session?.userId ||
      session.mode !== META_CENTER_OAUTH_MODE ||
      session.expiresAt.getTime() < Date.now()
    ) {
      return { ok: false, redirectUrl: `${adminUrl}?meta=error&reason=session_expired` };
    }

    try {
      const shortToken = await this.exchangeCodeForToken(code.trim());
      const longLived = await this.exchangeForLongLivedToken(shortToken);
      const userToken = longLived.access_token?.trim() || shortToken;
      const expiresIn = longLived.expires_in;
      const tokenExpiresAt =
        expiresIn != null && Number.isFinite(expiresIn)
          ? new Date(Date.now() + expiresIn * 1000)
          : null;

      await this.persistEnvAppCredentials();
      await this.saveUserToken(userToken, tokenExpiresAt, session.userId);
      const discovered = await this.discovery.discoverAndPersist(userToken);
      await this.cleanupSession(session.userId);

      this.logger.log(
        `[meta-connect] completed userId=${session.userId} business=${discovered.business?.id ?? 'none'}`,
      );

      return {
        ok: true,
        redirectUrl: `${adminUrl}?meta=connected`,
        message: 'Meta účet byl úspěšně připojen.',
      };
    } catch (err) {
      await this.cleanupSession(session.userId);
      const reason = err instanceof Error ? err.message : 'oauth_failed';
      if (isFacebookPageScopeError(reason)) {
        return {
          ok: false,
          redirectUrl: `${adminUrl}?meta=error&reason=scopes_unavailable`,
          message: reason,
        };
      }
      return {
        ok: false,
        redirectUrl: `${adminUrl}?meta=error&reason=${encodeURIComponent(reason.slice(0, 160))}`,
      };
    }
  }

  private async persistEnvAppCredentials() {
    const pagesAppId = this.fbConfig.getPagesAppId();
    const pagesSecret = this.fbConfig.getPagesAppSecret();
    const loginAppId = this.fbConfig.getLoginAppId();
    const loginSecret = this.fbConfig.getLoginAppSecret();
    const encryptionKey = process.env.SOCIAL_TOKEN_ENCRYPTION_KEY?.trim() || null;
    const metaConnectRedirect = this.resolveRedirectUri();
    const frontendUrl = this.fbConfig.resolveFrontendUrl();
    const backendUrl = this.fbConfig.resolveBackendUrl();

    await this.prisma.metaCenterSetting.upsert({
      where: { id: SETTINGS_ID },
      create: {
        id: SETTINGS_ID,
        facebookAppId: loginAppId,
        facebookAppSecret: loginSecret,
        facebookPagesAppId: pagesAppId,
        facebookPagesSecret: pagesSecret,
        encryptionKey,
        graphApiVersion: this.fbConfig.getGraphApiVersion(),
        frontendUrl,
        backendUrl,
        redirectUri: metaConnectRedirect,
        callbackUrl: metaConnectRedirect,
      },
      update: {
        facebookAppId: loginAppId ?? undefined,
        facebookAppSecret: loginSecret ?? undefined,
        facebookPagesAppId: pagesAppId ?? undefined,
        facebookPagesSecret: pagesSecret ?? undefined,
        encryptionKey: encryptionKey ?? undefined,
        graphApiVersion: this.fbConfig.getGraphApiVersion(),
        frontendUrl: frontendUrl ?? undefined,
        backendUrl: backendUrl ?? undefined,
        redirectUri: metaConnectRedirect,
        callbackUrl: metaConnectRedirect,
      },
    });
  }

  private async saveUserToken(userToken: string, tokenExpiresAt: Date | null, adminUserId: string) {
    const me = await this.graph.get<{ id?: string; name?: string }>(
      '/me',
      userToken,
      { fields: 'id,name' },
    );
    if (!me.ok || !me.data.id) {
      throw new BadRequestException('Neplatný Facebook token po přihlášení.');
    }

    await this.prisma.metaCenterSetting.upsert({
      where: { id: SETTINGS_ID },
      create: {
        id: SETTINGS_ID,
        metaUserAccessTokenEncrypted: this.crypto.encrypt(userToken),
        metaUserTokenExpiresAt: tokenExpiresAt,
        metaConnectedUserId: me.data.id,
        metaConnectedUserName: me.data.name ?? null,
        metaConnectedAt: new Date(),
        syncEnabled: true,
        conversionsApiToken: userToken,
      },
      update: {
        metaUserAccessTokenEncrypted: this.crypto.encrypt(userToken),
        metaUserTokenExpiresAt: tokenExpiresAt,
        metaConnectedUserId: me.data.id,
        metaConnectedUserName: me.data.name ?? null,
        metaConnectedAt: new Date(),
        syncEnabled: true,
        conversionsApiToken: userToken,
      },
    });

    void adminUserId;
  }

  async resolveAccessToken(): Promise<string> {
    const row = await this.prisma.metaCenterSetting.findUnique({ where: { id: SETTINGS_ID } });
    if (!row?.metaUserAccessTokenEncrypted) {
      throw new BadRequestException('Meta účet není připojen. Klikněte na „Připojit Meta účet“.');
    }
    if (row.metaUserTokenExpiresAt && row.metaUserTokenExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Meta access token expiroval — obnovte připojení.');
    }
    return this.crypto.decrypt(row.metaUserAccessTokenEncrypted);
  }

  async resolvePageAccessToken(): Promise<string | null> {
    const row = await this.prisma.metaCenterSetting.findUnique({ where: { id: SETTINGS_ID } });
    if (!row?.pageAccessTokenEncrypted) return null;
    return this.crypto.decrypt(row.pageAccessTokenEncrypted);
  }

  async refreshAccessToken(): Promise<{ ok: boolean; error?: string }> {
    try {
      const current = await this.resolveAccessToken();
      const refreshed = await this.exchangeForLongLivedToken(current);
      const userToken = refreshed.access_token?.trim() || current;
      const expiresIn = refreshed.expires_in;
      const tokenExpiresAt =
        expiresIn != null && Number.isFinite(expiresIn)
          ? new Date(Date.now() + expiresIn * 1000)
          : null;

      await this.prisma.metaCenterSetting.update({
        where: { id: SETTINGS_ID },
        data: {
          metaUserAccessTokenEncrypted: this.crypto.encrypt(userToken),
          metaUserTokenExpiresAt: tokenExpiresAt,
          conversionsApiToken: userToken,
          lastAutoSyncAt: new Date(),
        },
      });
      await this.discovery.discoverAndPersist(userToken);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Obnova tokenu selhala.' };
    }
  }

  async debugToken(accessToken: string) {
    const appId = this.fbConfig.getPagesAppId();
    const appSecret = this.fbConfig.getPagesAppSecret();
    if (!appId || !appSecret) {
      return { is_valid: true, expires_at: 0, scopes: [] as string[] };
    }
    const appToken = `${appId}|${appSecret}`;
    const res = await this.facebookPage.fetchGraphJson<DebugTokenResponse>(
      `${this.graph.legacyGraphApi()}/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(appToken)}`,
    );
    return {
      is_valid: res.data?.is_valid !== false,
      expires_at: res.data?.expires_at ?? 0,
      scopes: res.data?.scopes ?? [],
    };
  }

  private async exchangeCodeForToken(code: string): Promise<string> {
    const appId = this.fbConfig.getPagesAppId()!;
    const appSecret = this.fbConfig.getPagesAppSecret()!;
    const redirectUri = encodeURIComponent(this.resolveRedirectUri());
    const url =
      `${this.graph.legacyGraphApi()}/oauth/access_token?` +
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
    const appId = this.fbConfig.getPagesAppId()!;
    const appSecret = this.fbConfig.getPagesAppSecret()!;
    const url =
      `${this.graph.legacyGraphApi()}/oauth/access_token?` +
      `grant_type=fb_exchange_token&client_id=${encodeURIComponent(appId)}` +
      `&client_secret=${encodeURIComponent(appSecret)}` +
      `&fb_exchange_token=${encodeURIComponent(shortToken)}`;
    return this.facebookPage.fetchGraphJson<GraphTokenResponse>(url);
  }

  toInputJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
