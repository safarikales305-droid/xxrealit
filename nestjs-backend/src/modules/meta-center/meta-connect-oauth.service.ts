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
import { FacebookConfigService, type MetaOAuthPreviewDto } from '../social/facebook/facebook-config.service';
import { FacebookPageService } from '../social/facebook/facebook-page.service';
import { TokenEncryptionService } from '../social/token-encryption.service';
import { isFacebookPageScopeError } from '../social/facebook/facebook-page-scope.util';
import { SocialAutopostSettingsService } from '../social/autopost/social-autopost-settings.service';
import { SocialAutopostFacebookOAuthService } from '../social/autopost/social-autopost-facebook-oauth.service';
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
    private readonly autopostSettings: SocialAutopostSettingsService,
    private readonly autopostOAuth: SocialAutopostFacebookOAuthService,
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
    return this.fbConfig.getMetaRedirectUri();
  }

  getOAuthRedirectDiagnostics() {
    return this.fbConfig.getMetaOAuthRedirectDiagnostics();
  }

  private async logOAuthDialogEvent(input: {
    request: Record<string, unknown>;
    response: Record<string, unknown>;
    errorCode?: string | null;
    errorMessage?: string | null;
  }) {
    try {
      await this.prisma.metaCenterApiLog.create({
        data: {
          endpoint: 'oauth/dialog',
          method: 'GET',
          request: this.toInputJson(input.request),
          response: this.toInputJson(input.response),
          httpStatus: null,
          errorCode: input.errorCode ?? null,
          errorMessage: input.errorMessage ?? null,
          durationMs: null,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Meta OAuth log write failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  private composeOAuthPreview(input: {
    clientId: string;
    redirectUri: string;
    state: string;
    reauthorize: boolean;
    dryRun: boolean;
  }): MetaOAuthPreviewDto {
    const scope = META_CENTER_CONNECT_SCOPES;
    const params = new URLSearchParams({
      client_id: input.clientId,
      redirect_uri: input.redirectUri,
      state: input.state,
      scope,
      response_type: 'code',
      prompt: 'consent',
    });
    if (input.reauthorize) {
      params.set('auth_type', 'rerequest');
    }
    const facebookOAuthUrl = `${this.graph.oauthDialogUrl()}?${params.toString()}`;
    const allowedRedirectUris = this.fbConfig.getMetaAllowedRedirectUris();
    const redirectUriInAllowedConfig = this.fbConfig.isMetaRedirectUriInAllowedConfig(
      input.redirectUri,
    );
    return {
      facebookOAuthUrl,
      client_id: input.clientId,
      redirect_uri: input.redirectUri,
      scope,
      response_type: 'code',
      state: input.state,
      prompt: 'consent',
      auth_type: input.reauthorize ? 'rerequest' : null,
      redirectUriInAllowedConfig,
      allowedRedirectUris,
      facebookLoginSettingsUrl: this.fbConfig.getMetaFacebookLoginSettingsUrl(),
      dryRun: input.dryRun,
    };
  }

  /** Náhled OAuth parametrů bez přesměrování (ladění). */
  async buildOAuthPreview(adminUserId: string, dryRun = true): Promise<MetaOAuthPreviewDto> {
    this.assertConfigured();
    this.fbConfig.assertPagesAppIdValid();
    const pagesAppId = this.fbConfig.getPagesAppId();
    if (!pagesAppId) {
      throw new ServiceUnavailableException(this.fbConfig.pagesConfigurationErrorMessage());
    }
    const redirectUri = this.resolveRedirectUri();
    const reauthorize = dryRun ? false : await this.isAlreadyConnected(adminUserId);
    const state = dryRun
      ? `${META_CENTER_OAUTH_STATE_PREFIX}preview_${randomBytes(12).toString('hex')}`
      : `${META_CENTER_OAUTH_STATE_PREFIX}${randomBytes(23).toString('hex')}`;

    if (!dryRun) {
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
    }

    const preview = this.composeOAuthPreview({
      clientId: pagesAppId,
      redirectUri,
      state,
      reauthorize,
      dryRun,
    });

    this.logger.log(`META OAuth URL: ${preview.facebookOAuthUrl}`);
    this.logger.log(`META OAuth redirect_uri: ${preview.redirect_uri}`);
    this.logger.log(`META OAuth state: ${preview.state}`);
    this.logger.log(`META OAuth scope: ${preview.scope}`);

    return preview;
  }

  private formatOAuthErrorRedirect(
    reason: string,
    redirectUri?: string,
  ): string {
    const adminUrl = this.getAdminUrl();
    const params = new URLSearchParams({ reason: reason.slice(0, 200) });
    if (redirectUri) {
      params.set('redirect_uri', redirectUri);
    }
    return `${adminUrl}?meta=error&${params.toString()}`;
  }

  private async isAlreadyConnected(adminUserId: string): Promise<boolean> {
    const row = await this.prisma.metaCenterSetting.findUnique({ where: { id: SETTINGS_ID } });
    if (row?.metaConnectedAt && row.metaUserAccessTokenEncrypted) return true;

    const pagesAuth = await this.prisma.facebookPagesUserAuth.findUnique({
      where: { userId: adminUserId },
    });
    if (pagesAuth?.accessTokenEncrypted) return true;

    await this.autopostSettings.reload();
    return Boolean(this.autopostSettings.resolveFacebookUserAccessToken());
  }

  async isConnectedForReauthorize(adminUserId: string): Promise<boolean> {
    return this.isAlreadyConnected(adminUserId);
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
    const preview = await this.buildOAuthPreview(adminUserId, false);
    return preview.facebookOAuthUrl;
  }

  async handleCallback(
    code: string | undefined,
    state: string | undefined,
    oauthError?: string,
    errorReason?: string,
    errorDescription?: string,
  ): Promise<MetaConnectCallbackResult> {
    const adminUrl = this.getAdminUrl();
    const redirectUri = this.resolveRedirectUri();

    if (oauthError?.trim() || errorReason?.trim() || errorDescription?.trim()) {
      const fbReason = (errorDescription ?? errorReason ?? oauthError ?? 'oauth_denied').trim();
      const oauthErrorJson = {
        error: oauthError ?? null,
        error_reason: errorReason ?? null,
        error_description: errorDescription ?? null,
        redirect_uri_used: redirectUri,
        state: state ?? null,
      };
      const isRedirectMismatch =
        (errorReason ?? '').trim() === 'redirect_uri_mismatch' ||
        fbReason.toLowerCase().includes('redirect_uri') ||
        fbReason.toLowerCase().includes("isn't whitelisted") ||
        fbReason.toLowerCase().includes('url je zablokovan') ||
        fbReason.toLowerCase().includes('url blocked') ||
        fbReason.toLowerCase().includes('blocked');
      if (isRedirectMismatch || oauthError?.trim()) {
        await this.logOAuthDialogEvent({
          request: {
            redirect_uri: redirectUri,
            state: state ?? null,
            phase: 'callback_error',
          },
          response: oauthErrorJson,
          errorCode: errorReason ?? oauthError ?? 'oauth_error',
          errorMessage: fbReason,
        });
      }
      const reason = isRedirectMismatch
        ? `${fbReason} — použitá redirect URI: ${redirectUri}`
        : fbReason.slice(0, 160);
      return {
        ok: false,
        redirectUrl: this.formatOAuthErrorRedirect(reason, redirectUri),
        message: reason,
      };
    }
    if (!code?.trim()) {
      return {
        ok: false,
        redirectUrl: this.formatOAuthErrorRedirect('missing_code', redirectUri),
      };
    }
    if (!state?.trim().startsWith(META_CENTER_OAUTH_STATE_PREFIX)) {
      return {
        ok: false,
        redirectUrl: this.formatOAuthErrorRedirect('missing_state', redirectUri),
      };
    }

    const session = await this.prisma.socialFacebookOAuthSession.findUnique({
      where: { id: state.trim() },
    });
    if (
      !session?.userId ||
      session.mode !== META_CENTER_OAUTH_MODE ||
      session.expiresAt.getTime() < Date.now()
    ) {
      return {
        ok: false,
        redirectUrl: this.formatOAuthErrorRedirect('session_expired', redirectUri),
      };
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
      await this.autopostOAuth.persistSharedPagesUserToken(
        session.userId,
        userToken,
        tokenExpiresAt,
      );
      await this.autopostSettings.updateSettings({
        facebook: {
          userAccessToken: userToken,
          tokenObtainedAt: new Date().toISOString(),
          tokenWarning: null,
        },
      });
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
        redirectUrl: this.formatOAuthErrorRedirect(reason.slice(0, 160), redirectUri),
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
    if (row?.metaUserAccessTokenEncrypted) {
      if (row.metaUserTokenExpiresAt && row.metaUserTokenExpiresAt.getTime() < Date.now()) {
        throw new BadRequestException('Meta access token expiroval — obnovte připojení.');
      }
      return this.crypto.decrypt(row.metaUserAccessTokenEncrypted);
    }

    await this.autopostSettings.reload();
    const fromAutopost = this.autopostSettings.resolveFacebookUserAccessToken();
    if (fromAutopost) return fromAutopost;

    const pagesAuth = await this.prisma.facebookPagesUserAuth.findFirst({
      orderBy: { updatedAt: 'desc' },
    });
    if (pagesAuth?.accessTokenEncrypted) {
      if (pagesAuth.tokenExpiresAt && pagesAuth.tokenExpiresAt.getTime() < Date.now()) {
        throw new BadRequestException('Facebook token expiroval — obnovte připojení v Meta Centru.');
      }
      return this.crypto.decrypt(pagesAuth.accessTokenEncrypted);
    }

    throw new BadRequestException(
      'Meta účet není připojen. Klikněte na „Připojit Meta účet“ (sdílený Facebook OAuth portálu).',
    );
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
