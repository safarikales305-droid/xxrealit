import {
  BadRequestException,
  Injectable,
  Logger,
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
  private readonly logger = new Logger(FacebookAuthService.name);

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
    return `${this.frontendUrl()}/profil/dashboard`;
  }

  getFinishLoginRedirectUrl(state: string): string {
    return `${this.frontendUrl()}/api/social/facebook/finish-login?state=${encodeURIComponent(state)}`;
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
    options?: { returnTokenInBody?: boolean },
  ): Promise<FacebookOAuthCallbackResult> {
    if (!code?.trim()) {
      return { ok: false, redirectUrl: this.getErrorRedirectUrl('missing_code') };
    }
    if (!state?.trim() || !state.trim().startsWith('l')) {
      return { ok: false, redirectUrl: this.getErrorRedirectUrl('missing_state') };
    }

    const sessionId = state.trim();
    const session = await this.prisma.socialFacebookOAuthSession.findUnique({
      where: { id: sessionId },
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

      const { user, wasCreated } = await this.findOrCreateUserFromFacebook(me);

      const encryptedToken = this.crypto.encrypt(userToken);
      await this.prisma.facebookConnection.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          facebookUserId: me.id,
          accessToken: '',
          accessTokenEncrypted: encryptedToken,
          tokenExpiresAt,
          scopes: FACEBOOK_LOGIN_SCOPES.split(','),
        },
        update: {
          facebookUserId: me.id,
          accessToken: '',
          accessTokenEncrypted: encryptedToken,
          tokenExpiresAt,
        },
      });

      const tokens = this.auth.issueTokens(user);
      this.logger.log(`FACEBOOK_JWT_CREATED userId=${user.id}`);
      this.logger.log(`FACEBOOK_LOGIN_SUCCESS userId=${user.id} newUser=${wasCreated}`);

      const returnTokenInBody = options?.returnTokenInBody === true;
      if (returnTokenInBody) {
        await this.prisma.socialFacebookOAuthSession.delete({ where: { id: session.id } });
        const redirectUrl = `${this.getSuccessRedirectUrl()}?facebook=connected`;
        this.logger.log(`FACEBOOK_LOGIN_SUCCESS userId=${user.id} via=json`);
        return {
          ok: true,
          redirectUrl,
          accessToken: tokens.accessToken,
          isNewUser: wasCreated,
        };
      }

      await this.prisma.socialFacebookOAuthSession.update({
        where: { id: session.id },
        data: {
          userId: user.id,
          mode: 'login_complete',
          userAccessToken: this.crypto.encrypt(tokens.accessToken),
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        },
      });

      const redirectUrl = this.getFinishLoginRedirectUrl(sessionId);
      this.logger.log(`FACEBOOK_REDIRECT_SUCCESS userId=${user.id} via=finish_login`);
      return {
        ok: true,
        redirectUrl,
        isNewUser: wasCreated,
      };
    } catch (err) {
      const reason = err instanceof Error ? err.message.slice(0, 120) : 'oauth_failed';
      this.logger.warn(`FACEBOOK_LOGIN_FAIL reason=${reason}`);
      return { ok: false, redirectUrl: this.getErrorRedirectUrl(reason) };
    }
  }

  async consumeLoginSession(state: string | undefined): Promise<FacebookOAuthCallbackResult> {
    if (!state?.trim() || !state.trim().startsWith('l')) {
      return { ok: false, redirectUrl: this.getErrorRedirectUrl('missing_state') };
    }

    const session = await this.prisma.socialFacebookOAuthSession.findUnique({
      where: { id: state.trim() },
    });
    if (
      !session ||
      session.mode !== 'login_complete' ||
      session.expiresAt.getTime() < Date.now()
    ) {
      return { ok: false, redirectUrl: this.getErrorRedirectUrl('session_expired') };
    }

    try {
      const accessToken = this.crypto.decrypt(session.userAccessToken);
      await this.prisma.socialFacebookOAuthSession.delete({ where: { id: session.id } });
      const redirectUrl = `${this.getSuccessRedirectUrl()}?facebook=connected`;
      this.logger.log(
        `FACEBOOK_LOGIN_SUCCESS userId=${session.userId ?? 'unknown'} via=consume cookies=pending`,
      );
      return {
        ok: true,
        redirectUrl,
        accessToken,
      };
    } catch (err) {
      const reason = err instanceof Error ? err.message.slice(0, 120) : 'session_invalid';
      return { ok: false, redirectUrl: this.getErrorRedirectUrl(reason) };
    }
  }

  private async findOrCreateUserFromFacebook(me: GraphMeResponse) {
    const facebookId = me.id!.trim();
    const emailFromFb = me.email?.trim().toLowerCase() || null;
    const displayName =
      me.name?.trim() ||
      [me.first_name, me.last_name].filter(Boolean).join(' ') ||
      'Facebook uživatel';
    const avatarUrl = me.picture?.data?.url ?? null;

    const byFacebook = await this.prisma.user.findFirst({ where: { facebookId } });
    if (byFacebook) {
      const updated = await this.prisma.user.update({
        where: { id: byFacebook.id },
        data: {
          name: byFacebook.name?.trim() ? byFacebook.name : displayName,
          avatar: avatarUrl ?? byFacebook.avatar,
        },
      });
      this.logger.log(
        `FACEBOOK_USER_FOUND match=facebookId userId=${updated.id} email=${updated.email}`,
      );
      return { user: updated, wasCreated: false };
    }

    if (emailFromFb) {
      const byEmail = await this.prisma.user.findUnique({ where: { email: emailFromFb } });
      if (byEmail) {
        const updated = await this.prisma.user.update({
          where: { id: byEmail.id },
          data: {
            facebookId,
            name: byEmail.name?.trim() ? byEmail.name : displayName,
            avatar: avatarUrl ?? byEmail.avatar,
          },
        });
        this.logger.log(
          `FACEBOOK_USER_FOUND match=email userId=${updated.id} email=${updated.email}`,
        );
        return { user: updated, wasCreated: false };
      }
    }

    const byFbConnection = await this.prisma.facebookConnection.findFirst({
      where: { facebookUserId: facebookId },
      include: { user: true },
    });
    if (byFbConnection?.user) {
      const updated = await this.prisma.user.update({
        where: { id: byFbConnection.user.id },
        data: {
          facebookId,
          name: byFbConnection.user.name?.trim() ? byFbConnection.user.name : displayName,
          avatar: avatarUrl ?? byFbConnection.user.avatar,
        },
      });
      this.logger.log(
        `FACEBOOK_USER_FOUND match=connection userId=${updated.id} email=${updated.email}`,
      );
      return { user: updated, wasCreated: false };
    }

    const email = emailFromFb || `facebook+${facebookId}@users.xxrealit.cz`;
    const passwordHash = await bcrypt.hash(randomBytes(32).toString('hex'), 10);

    const created = await this.prisma.user.create({
      data: {
        email,
        name: displayName,
        password: passwordHash,
        role: UserRole.USER,
        facebookId,
        avatar: avatarUrl,
        phone: '',
      },
    });
    this.logger.log(
      `FACEBOOK_USER_CREATED userId=${created.id} email=${created.email} facebookId=${facebookId}`,
    );
    return { user: created, wasCreated: true };
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
