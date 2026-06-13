import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../../database/prisma.service';
import { AuthService } from '../../auth/auth.service';
import { TokenEncryptionService } from '../token-encryption.service';
import { FACEBOOK_LOGIN_SCOPES, GRAPH_API } from './facebook-page.constants';
import { FacebookConfigService } from './facebook-config.service';
import type { FacebookOAuthCallbackResult } from './facebook-page.service';

type GraphTokenResponse = { access_token?: string; expires_in?: number };
type GraphMeResponse = {
  id?: string;
  name?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  picture?: { data?: { url?: string } };
};

@Injectable()
export class FacebookAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly crypto: TokenEncryptionService,
    private readonly facebookConfig: FacebookConfigService,
    private readonly auth: AuthService,
  ) {}

  private frontendUrl(): string {
    return (
      this.config.get<string>('FRONTEND_URL')?.trim().replace(/\/+$/, '') ||
      'https://www.xxrealit.cz'
    );
  }

  getSuccessRedirectUrl(): string {
    return `${this.frontendUrl()}/profil/dashboard?facebook=connected`;
  }

  getErrorRedirectUrl(reason?: string): string {
    const base = `${this.frontendUrl()}/login?facebook=error`;
    if (!reason?.trim()) return base;
    return `${base}&reason=${encodeURIComponent(reason.trim().slice(0, 120))}`;
  }

  private oauthRedirectUri(): string {
    return this.facebookConfig.resolveOAuthRedirectUri();
  }

  async buildLoginUrl(): Promise<string> {
    if (!this.facebookConfig.isConfigured()) {
      throw new ServiceUnavailableException(this.facebookConfig.configurationErrorMessage());
    }

    const state = `l${randomBytes(23).toString('hex')}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await this.prisma.socialFacebookOAuthSession.create({
      data: {
        id: state,
        mode: 'login',
        userAccessToken: this.crypto.encrypt('pending'),
        expiresAt,
      },
    });

    const redirectUri = encodeURIComponent(this.oauthRedirectUri());
    const appId = encodeURIComponent(this.facebookConfig.getAppId()!);
    const scope = encodeURIComponent(FACEBOOK_LOGIN_SCOPES);
    return (
      `https://www.facebook.com/v21.0/dialog/oauth?` +
      `client_id=${appId}&redirect_uri=${redirectUri}&state=${state}&scope=${scope}&response_type=code`
    );
  }

  async handleLoginCallback(
    code: string | undefined,
    state: string | undefined,
  ): Promise<FacebookOAuthCallbackResult> {
    if (!code?.trim()) {
      return { ok: false, redirectUrl: this.getErrorRedirectUrl('missing_code') };
    }
    if (!state?.trim() || !state.trim().startsWith('l')) {
      return { ok: false, redirectUrl: this.getErrorRedirectUrl('missing_state') };
    }

    const session = await this.prisma.socialFacebookOAuthSession.findUnique({
      where: { id: state.trim() },
    });
    if (!session || session.mode !== 'login' || session.expiresAt.getTime() < Date.now()) {
      return { ok: false, redirectUrl: this.getErrorRedirectUrl('session_expired') };
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

      const me = await this.fetchGraphJson<GraphMeResponse>(
        `${GRAPH_API}/me?fields=id,name,email,first_name,last_name,picture&access_token=${encodeURIComponent(userToken)}`,
      );
      if (!me.id) throw new BadRequestException('Neplatný Facebook token.');

      const user = await this.findOrCreateUserFromFacebook(me);

      const encryptedToken = this.crypto.encrypt(userToken);
      await this.prisma.facebookConnection.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          facebookUserId: me.id,
          accessToken: '',
          accessTokenEncrypted: encryptedToken,
          tokenExpiresAt,
          scopes: [FACEBOOK_LOGIN_SCOPES],
        },
        update: {
          facebookUserId: me.id,
          accessToken: '',
          accessTokenEncrypted: encryptedToken,
          tokenExpiresAt,
        },
      });

      await this.prisma.socialFacebookOAuthSession.delete({ where: { id: session.id } });

      const tokens = this.auth.issueTokens(user);
      return {
        ok: true,
        redirectUrl: this.getSuccessRedirectUrl(),
        accessToken: tokens.accessToken,
        isNewUser: user.wasCreated,
      };
    } catch (err) {
      const reason = err instanceof Error ? err.message.slice(0, 120) : 'oauth_failed';
      return { ok: false, redirectUrl: this.getErrorRedirectUrl(reason) };
    }
  }

  private async findOrCreateUserFromFacebook(me: GraphMeResponse) {
    const facebookId = me.id!.trim();
    const byFacebook = await this.prisma.user.findFirst({ where: { facebookId } });
    if (byFacebook) {
      return { ...byFacebook, wasCreated: false };
    }

    const byFbConnection = await this.prisma.facebookConnection.findFirst({
      where: { facebookUserId: facebookId },
      include: { user: true },
    });
    if (byFbConnection?.user) {
      const updated = await this.prisma.user.update({
        where: { id: byFbConnection.user.id },
        data: { facebookId },
      });
      return { ...updated, wasCreated: false };
    }

    const emailFromFb = me.email?.trim().toLowerCase();
    if (emailFromFb) {
      const byEmail = await this.prisma.user.findUnique({ where: { email: emailFromFb } });
      if (byEmail) {
        const updated = await this.prisma.user.update({
          where: { id: byEmail.id },
          data: {
            facebookId,
            avatar: byEmail.avatar ?? me.picture?.data?.url ?? null,
          },
        });
        return { ...updated, wasCreated: false };
      }
    }

    const displayName =
      me.name?.trim() ||
      [me.first_name, me.last_name].filter(Boolean).join(' ') ||
      'Facebook uživatel';
    const email = emailFromFb || `facebook+${facebookId}@users.xxrealit.cz`;
    const passwordHash = await bcrypt.hash(randomBytes(32).toString('hex'), 10);

    const created = await this.prisma.user.create({
      data: {
        email,
        name: displayName,
        password: passwordHash,
        role: UserRole.USER,
        facebookId,
        avatar: me.picture?.data?.url ?? null,
        phone: '',
      },
    });
    return { ...created, wasCreated: true };
  }

  private async exchangeCodeForToken(code: string): Promise<string> {
    const appId = this.facebookConfig.getAppId()!;
    const appSecret = this.facebookConfig.getAppSecret()!;
    const redirectUri = encodeURIComponent(this.oauthRedirectUri());
    const url =
      `${GRAPH_API}/oauth/access_token?` +
      `client_id=${encodeURIComponent(appId)}` +
      `&redirect_uri=${redirectUri}` +
      `&client_secret=${encodeURIComponent(appSecret)}` +
      `&code=${encodeURIComponent(code)}`;
    const data = await this.fetchGraphJson<GraphTokenResponse>(url);
    const token = data.access_token?.trim();
    if (!token) throw new BadRequestException('Facebook OAuth nevrátil access token.');
    return token;
  }

  private async exchangeForLongLivedToken(shortToken: string): Promise<GraphTokenResponse> {
    const appId = this.facebookConfig.getAppId()!;
    const appSecret = this.facebookConfig.getAppSecret()!;
    const url =
      `${GRAPH_API}/oauth/access_token?` +
      `grant_type=fb_exchange_token&client_id=${encodeURIComponent(appId)}` +
      `&client_secret=${encodeURIComponent(appSecret)}` +
      `&fb_exchange_token=${encodeURIComponent(shortToken)}`;
    return this.fetchGraphJson<GraphTokenResponse>(url);
  }

  private async fetchGraphJson<T>(url: string): Promise<T> {
    const res = await fetch(url);
    const data = (await res.json().catch(() => ({}))) as T & {
      error?: { message?: string; code?: number };
    };
    if (!res.ok || data.error) {
      const msg =
        typeof data.error?.message === 'string'
          ? data.error.message
          : `Facebook API HTTP ${res.status}`;
      throw new BadRequestException(msg);
    }
    return data;
  }
}
