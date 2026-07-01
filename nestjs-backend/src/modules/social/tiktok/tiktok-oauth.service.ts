import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../../database/prisma.service';
import { TokenEncryptionService } from '../token-encryption.service';
import { TikTokApiClient } from './tiktok-api.client';
import { TikTokConfigService } from './tiktok.config.service';
import {
  TIKTOK_OAUTH_AUTHORIZE,
  TIKTOK_OAUTH_SCOPES,
  TIKTOK_TOKEN_REFRESH_BUFFER_MS,
} from './tiktok.constants';
import { maskAccessToken } from '../autopost/social-autopost.types';
import { TIKTOK_ERROR_MESSAGES } from './tiktok.errors';

function generateCodeVerifier(): string {
  return randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export type TikTokOAuthCallbackResult = {
  ok: boolean;
  redirectUrl: string;
  message?: string;
};

@Injectable()
export class TikTokOAuthService {
  private readonly logger = new Logger(TikTokOAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: TikTokConfigService,
    private readonly crypto: TokenEncryptionService,
    private readonly api: TikTokApiClient,
  ) {}

  getAdminUrl(): string {
    return `${this.config.getFrontendUrl()}/admin/marketing/tiktok`;
  }

  private assertConfigured() {
    if (!this.config.isConfigured()) {
      throw new ServiceUnavailableException(TIKTOK_ERROR_MESSAGES.NOT_CONFIGURED);
    }
  }

  async buildConnectUrl(adminUserId: string): Promise<string> {
    this.assertConfigured();
    const state = `t${randomBytes(22).toString('hex')}`;
    const codeVerifier = generateCodeVerifier();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await this.prisma.tikTokOAuthSession.deleteMany({ where: { adminUserId } });
    await this.prisma.tikTokOAuthSession.create({
      data: { id: state, adminUserId, codeVerifier, expiresAt },
    });

    const params = new URLSearchParams({
      client_key: this.config.getClientKey(),
      response_type: 'code',
      scope: TIKTOK_OAUTH_SCOPES,
      redirect_uri: this.config.getRedirectUri(),
      state,
      code_challenge: generateCodeChallenge(codeVerifier),
      code_challenge_method: 'S256',
    });

    return `${TIKTOK_OAUTH_AUTHORIZE}?${params.toString()}`;
  }

  async handleCallback(
    code: string | undefined,
    state: string | undefined,
    oauthError?: string,
    errorDescription?: string,
  ): Promise<TikTokOAuthCallbackResult> {
    const adminUrl = this.getAdminUrl();

    if (oauthError?.trim()) {
      const reason = (errorDescription ?? oauthError).slice(0, 160);
      return { ok: false, redirectUrl: `${adminUrl}?tiktok=error&reason=${encodeURIComponent(reason)}` };
    }
    if (!code?.trim() || !state?.trim()) {
      return { ok: false, redirectUrl: `${adminUrl}?tiktok=error&reason=missing_code` };
    }

    const session = await this.prisma.tikTokOAuthSession.findUnique({ where: { id: state.trim() } });
    if (!session || session.expiresAt.getTime() < Date.now()) {
      return { ok: false, redirectUrl: `${adminUrl}?tiktok=error&reason=session_expired` };
    }

    try {
      const tokenData = await this.api.exchangeToken({
        client_key: this.config.getClientKey(),
        client_secret: this.config.getClientSecret(),
        code: code.trim(),
        grant_type: 'authorization_code',
        redirect_uri: this.config.getRedirectUri(),
        code_verifier: session.codeVerifier,
      });

      let accountName: string | null = null;
      try {
        const userInfo = await this.api.getUserInfo(tokenData.access_token);
        accountName = userInfo.user?.display_name?.trim() || null;
      } catch (err) {
        this.logger.warn(`TikTok user info failed: ${err instanceof Error ? err.message : err}`);
      }

      const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);
      const refreshExpiresAt =
        tokenData.refresh_expires_in != null
          ? new Date(Date.now() + tokenData.refresh_expires_in * 1000)
          : null;

      await this.prisma.tikTokConnection.updateMany({ data: { isActive: false } });
      await this.prisma.tikTokConnection.upsert({
        where: { openId: tokenData.open_id },
        create: {
          openId: tokenData.open_id,
          accessToken: this.crypto.encrypt(tokenData.access_token),
          refreshToken: this.crypto.encrypt(tokenData.refresh_token),
          scope: tokenData.scope,
          expiresAt,
          refreshExpiresAt,
          accountName,
          isActive: true,
        },
        update: {
          accessToken: this.crypto.encrypt(tokenData.access_token),
          refreshToken: this.crypto.encrypt(tokenData.refresh_token),
          scope: tokenData.scope,
          expiresAt,
          refreshExpiresAt,
          accountName,
          isActive: true,
        },
      });

      await this.prisma.tikTokOAuthSession.delete({ where: { id: session.id } });
      this.logger.log(`TikTok connected openId=${tokenData.open_id}`);
      return { ok: true, redirectUrl: `${adminUrl}?tiktok=connected` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'oauth_failed';
      return { ok: false, redirectUrl: `${adminUrl}?tiktok=error&reason=${encodeURIComponent(msg)}` };
    }
  }

  async disconnect(): Promise<void> {
    await this.prisma.tikTokConnection.updateMany({ data: { isActive: false } });
  }

  async getActiveConnection() {
    return this.prisma.tikTokConnection.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getValidAccessToken(): Promise<{ accessToken: string; connectionId: string; scope: string }> {
    const conn = await this.getActiveConnection();
    if (!conn) {
      throw new Error(TIKTOK_ERROR_MESSAGES.NOT_CONNECTED);
    }

    const needsRefresh = conn.expiresAt.getTime() - Date.now() < TIKTOK_TOKEN_REFRESH_BUFFER_MS;
    if (!needsRefresh) {
      return {
        accessToken: this.crypto.decrypt(conn.accessToken),
        connectionId: conn.id,
        scope: conn.scope,
      };
    }

    try {
      const refreshToken = this.crypto.decrypt(conn.refreshToken);
      const tokenData = await this.api.refreshToken(refreshToken);
      const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);
      const refreshExpiresAt =
        tokenData.refresh_expires_in != null
          ? new Date(Date.now() + tokenData.refresh_expires_in * 1000)
          : conn.refreshExpiresAt;

      await this.prisma.tikTokConnection.update({
        where: { id: conn.id },
        data: {
          accessToken: this.crypto.encrypt(tokenData.access_token),
          refreshToken: this.crypto.encrypt(tokenData.refresh_token),
          scope: tokenData.scope ?? conn.scope,
          expiresAt,
          refreshExpiresAt,
          isActive: true,
        },
      });

      return {
        accessToken: tokenData.access_token,
        connectionId: conn.id,
        scope: tokenData.scope ?? conn.scope,
      };
    } catch (err) {
      await this.prisma.tikTokConnection.update({
        where: { id: conn.id },
        data: { isActive: false },
      });
      await this.prisma.tikTokPublishJob.updateMany({
        where: { status: { in: ['WAITING', 'UPLOADING'] } },
        data: { status: 'NEEDS_REAUTH', errorMessage: TIKTOK_ERROR_MESSAGES.TOKEN_EXPIRED },
      });
      throw new Error(TIKTOK_ERROR_MESSAGES.TOKEN_EXPIRED);
    }
  }

  async getPublicStatus() {
    const conn = await this.getActiveConnection();
    return {
      configured: this.config.isConfigured(),
      connected: Boolean(conn?.isActive),
      clientKeyMasked: this.config.maskClientKey(),
      clientSecretMasked: this.config.maskSecret(),
      redirectUri: this.config.getRedirectUri(),
      accountName: conn?.accountName ?? null,
      openId: conn?.openId ?? null,
      accessTokenMasked: conn
        ? maskAccessToken(this.crypto.decrypt(conn.accessToken))
        : null,
      expiresAt: conn?.expiresAt?.toISOString() ?? null,
      refreshExpiresAt: conn?.refreshExpiresAt?.toISOString() ?? null,
      scope: conn?.scope ?? null,
    };
  }

  async testConnection(): Promise<{ ok: boolean; message: string; creatorUsername?: string }> {
    const { accessToken } = await this.getValidAccessToken();
    const info = await this.api.queryCreatorInfo(accessToken);
    return {
      ok: true,
      message: 'Spojení s TikTok API je funkční.',
      creatorUsername: info.creator_username,
    };
  }
}
