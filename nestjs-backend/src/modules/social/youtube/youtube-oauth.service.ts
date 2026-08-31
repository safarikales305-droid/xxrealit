import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../../database/prisma.service';
import { TokenEncryptionService } from '../token-encryption.service';
import { YouTubeConfigService } from './youtube.config.service';
import {
  YOUTUBE_API_BASE,
  YOUTUBE_OAUTH_AUTHORIZE,
  YOUTUBE_OAUTH_SCOPES,
  YOUTUBE_OAUTH_TOKEN,
  YOUTUBE_TOKEN_REFRESH_BUFFER_MS,
} from './youtube.constants';

export type YouTubeOAuthCallbackResult = {
  ok: boolean;
  redirectUrl: string;
  message?: string;
};

export type YouTubeChannelInfo = {
  channelId: string;
  channelTitle: string;
  channelHandle: string | null;
};

@Injectable()
export class YouTubeOAuthService {
  private readonly log = new Logger(YouTubeOAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: YouTubeConfigService,
    private readonly crypto: TokenEncryptionService,
  ) {}

  getAdminUrl(): string {
    return `${this.config.getFrontendUrl()}/admin/redakce/automatizace`;
  }

  private assertConfigured() {
    if (!this.config.isConfigured()) {
      throw new ServiceUnavailableException('YouTube OAuth není nakonfigurováno.');
    }
  }

  async buildConnectUrl(adminUserId: string): Promise<string> {
    this.assertConfigured();
    const state = `yt${randomBytes(22).toString('hex')}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await this.prisma.youTubeOAuthSession.deleteMany({ where: { adminUserId } });
    await this.prisma.youTubeOAuthSession.create({
      data: { id: state, adminUserId, expiresAt },
    });

    const params = new URLSearchParams({
      client_id: this.config.getClientId(),
      redirect_uri: this.config.getRedirectUri(),
      response_type: 'code',
      scope: YOUTUBE_OAUTH_SCOPES,
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
    });

    return `${YOUTUBE_OAUTH_AUTHORIZE}?${params.toString()}`;
  }

  async handleCallback(
    code: string | undefined,
    state: string | undefined,
    oauthError?: string,
  ): Promise<YouTubeOAuthCallbackResult> {
    const adminUrl = this.getAdminUrl();

    if (oauthError?.trim()) {
      return {
        ok: false,
        redirectUrl: `${adminUrl}?youtube=error&reason=${encodeURIComponent(oauthError)}`,
      };
    }
    if (!code?.trim() || !state?.trim()) {
      return { ok: false, redirectUrl: `${adminUrl}?youtube=error&reason=missing_code` };
    }

    const session = await this.prisma.youTubeOAuthSession.findUnique({ where: { id: state.trim() } });
    if (!session || session.expiresAt.getTime() < Date.now()) {
      return { ok: false, redirectUrl: `${adminUrl}?youtube=error&reason=session_expired` };
    }

    try {
      const tokenData = await this.exchangeCode(code.trim());
      if (!tokenData.refresh_token?.trim()) {
        return {
          ok: false,
          redirectUrl: `${adminUrl}?youtube=error&reason=missing_refresh_token`,
          message: 'Google nevrátil refresh token — zrušte přístup v Google účtu a zkuste znovu.',
        };
      }

      const channel = await this.fetchMyChannel(tokenData.access_token);
      const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

      await this.prisma.youTubeOAuthConnection.upsert({
        where: { channelId: channel.channelId },
        create: {
          channelId: channel.channelId,
          channelTitle: channel.channelTitle,
          channelHandle: channel.channelHandle,
          accessTokenEncrypted: this.crypto.encrypt(tokenData.access_token),
          refreshTokenEncrypted: this.crypto.encrypt(tokenData.refresh_token),
          scopes: YOUTUBE_OAUTH_SCOPES,
          expiresAt,
          connectedByUserId: session.adminUserId,
          isActive: true,
          lastError: null,
        },
        update: {
          channelTitle: channel.channelTitle,
          channelHandle: channel.channelHandle,
          accessTokenEncrypted: this.crypto.encrypt(tokenData.access_token),
          refreshTokenEncrypted: this.crypto.encrypt(tokenData.refresh_token),
          scopes: YOUTUBE_OAUTH_SCOPES,
          expiresAt,
          connectedByUserId: session.adminUserId,
          isActive: true,
          lastError: null,
        },
      });

      await this.prisma.youTubeOAuthSession.delete({ where: { id: session.id } });

      return {
        ok: true,
        redirectUrl: `${adminUrl}?youtube=connected&channel=${encodeURIComponent(channel.channelTitle)}`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.warn(`YouTube OAuth callback failed: ${msg}`);
      return {
        ok: false,
        redirectUrl: `${adminUrl}?youtube=error&reason=${encodeURIComponent(msg.slice(0, 120))}`,
      };
    }
  }

  async getConnectionStatus() {
    const conn = await this.prisma.youTubeOAuthConnection.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' },
    });
    if (!conn) {
      return {
        connected: false,
        configured: this.config.isConfigured(),
        channelId: null,
        channelTitle: null,
        uploadScopeOk: false,
        refreshTokenOk: false,
        autoPublishReady: false,
      };
    }

    const hasUploadScope = conn.scopes.includes('youtube.upload');
    const hasRefresh = Boolean(conn.refreshTokenEncrypted?.trim());
    const channelMismatch =
      conn.expectedChannelId && conn.expectedChannelId !== conn.channelId;

    return {
      connected: true,
      configured: this.config.isConfigured(),
      channelId: conn.channelId,
      channelTitle: conn.channelTitle,
      channelHandle: conn.channelHandle,
      uploadScopeOk: hasUploadScope,
      refreshTokenOk: hasRefresh,
      autoPublishReady: hasUploadScope && hasRefresh && !channelMismatch,
      channelMismatch: Boolean(channelMismatch),
      expectedChannelId: conn.expectedChannelId,
      expiresAt: conn.expiresAt.toISOString(),
      lastError: conn.lastError,
    };
  }

  async getValidAccessToken(): Promise<string> {
    const conn = await this.prisma.youTubeOAuthConnection.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' },
    });
    if (!conn) {
      throw new Error('AUTH_REQUIRED: YouTube účet není připojen.');
    }
    if (conn.expectedChannelId && conn.expectedChannelId !== conn.channelId) {
      throw new Error('AUTH_REQUIRED: Připojený kanál neodpovídá očekávanému XXREALIT kanálu.');
    }
    if (!conn.scopes.includes('youtube.upload')) {
      throw new Error('AUTH_REQUIRED: Chybí oprávnění youtube.upload.');
    }

    const needsRefresh = conn.expiresAt.getTime() - Date.now() < YOUTUBE_TOKEN_REFRESH_BUFFER_MS;
    if (!needsRefresh) {
      return this.crypto.decrypt(conn.accessTokenEncrypted);
    }

    const refreshToken = this.crypto.decrypt(conn.refreshTokenEncrypted);
    const refreshed = await this.refreshAccessToken(refreshToken);

    const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
    await this.prisma.youTubeOAuthConnection.update({
      where: { id: conn.id },
      data: {
        accessTokenEncrypted: this.crypto.encrypt(refreshed.access_token),
        expiresAt,
        lastError: null,
      },
    });

    return refreshed.access_token;
  }

  async setExpectedChannelId(channelId: string | null) {
    const conn = await this.prisma.youTubeOAuthConnection.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' },
    });
    if (!conn) return { ok: false };
    await this.prisma.youTubeOAuthConnection.update({
      where: { id: conn.id },
      data: { expectedChannelId: channelId?.trim() || null },
    });
    return { ok: true };
  }

  private async exchangeCode(code: string) {
    const body = new URLSearchParams({
      code,
      client_id: this.config.getClientId(),
      client_secret: this.config.getClientSecret(),
      redirect_uri: this.config.getRedirectUri(),
      grant_type: 'authorization_code',
    });
    const res = await fetch(YOUTUBE_OAUTH_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const data = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };
    if (!res.ok || !data.access_token) {
      throw new Error(data.error_description || data.error || 'token_exchange_failed');
    }
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token ?? '',
      expires_in: data.expires_in ?? 3600,
    };
  }

  private async refreshAccessToken(refreshToken: string) {
    const body = new URLSearchParams({
      refresh_token: refreshToken,
      client_id: this.config.getClientId(),
      client_secret: this.config.getClientSecret(),
      grant_type: 'refresh_token',
    });
    const res = await fetch(YOUTUBE_OAUTH_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const data = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };
    if (!res.ok || !data.access_token) {
      const reason = data.error_description || data.error || 'refresh_failed';
      if (/invalid_grant|revoked/i.test(reason)) {
        await this.prisma.youTubeOAuthConnection.updateMany({
          where: { isActive: true },
          data: { lastError: 'invalid_grant', isActive: false },
        });
        throw new Error(`AUTH_REQUIRED: ${reason}`);
      }
      throw new Error(reason);
    }
    return { access_token: data.access_token, expires_in: data.expires_in ?? 3600 };
  }

  private async fetchMyChannel(accessToken: string): Promise<YouTubeChannelInfo> {
    const url = `${YOUTUBE_API_BASE}/channels?part=snippet&mine=true`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    });
    const data = (await res.json()) as {
      items?: Array<{
        id: string;
        snippet?: { title?: string; customUrl?: string };
      }>;
      error?: { message?: string; errors?: Array<{ reason?: string }> };
    };
    if (!res.ok) {
      throw new Error(data.error?.message || 'channel_fetch_failed');
    }
    const item = data.items?.[0];
    if (!item?.id) throw new Error('channel_not_found');
    return {
      channelId: item.id,
      channelTitle: item.snippet?.title?.trim() || item.id,
      channelHandle: item.snippet?.customUrl?.trim() || null,
    };
  }
}
