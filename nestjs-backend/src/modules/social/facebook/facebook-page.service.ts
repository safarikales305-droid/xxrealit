import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SocialProvider, UserRole } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../../database/prisma.service';
import { AuthService } from '../../auth/auth.service';
import { TokenEncryptionService } from '../token-encryption.service';
import { FACEBOOK_ADVANCED_PAGE_SCOPES, FACEBOOK_BASIC_SCOPES, GRAPH_API } from './facebook-page.constants';
import { FacebookConfigService } from './facebook-config.service';
import { FacebookPageSyncService } from './facebook-page-sync.service';

const PROFESSIONAL_ROLES: UserRole[] = [
  UserRole.AGENT,
  UserRole.COMPANY,
  UserRole.AGENCY,
  UserRole.FINANCIAL_ADVISOR,
  UserRole.INVESTOR,
];

type GraphTokenResponse = { access_token?: string; expires_in?: number };
type GraphMeResponse = {
  id?: string;
  name?: string;
  email?: string;
  picture?: { data?: { url?: string } };
};
type GraphPageAccount = {
  id?: string;
  name?: string;
  access_token?: string;
  tasks?: string[];
};
type GraphAccountsResponse = { data?: GraphPageAccount[] };

export type FacebookPageOption = { id: string; name: string };

export type FacebookOAuthCallbackResult = {
  ok: boolean;
  redirectUrl: string;
  accessToken?: string;
};

@Injectable()
export class FacebookPageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly crypto: TokenEncryptionService,
    private readonly sync: FacebookPageSyncService,
    private readonly facebookConfig: FacebookConfigService,
    private readonly auth: AuthService,
  ) {}

  isConfigured(): boolean {
    return this.facebookConfig.isConfigured();
  }

  getConfigStatus() {
    return this.facebookConfig.getConfigStatus();
  }

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

  getFrontendSettingsUrl(): string {
    return `${this.frontendUrl()}/profil/dashboard?tab=settings`;
  }

  private oauthRedirectUri(): string {
    return this.facebookConfig.resolveOAuthRedirectUri();
  }

  private assertProfessional(userId: string, role: UserRole) {
    if (!PROFESSIONAL_ROLES.includes(role)) {
      throw new ForbiddenException(
        'Propojení Facebook stránky je dostupné jen pro profesionální účty.',
      );
    }
  }

  async buildConnectUrl(
    userId: string,
    role: UserRole,
    options?: { advanced?: boolean },
  ): Promise<string> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(this.facebookConfig.configurationErrorMessage());
    }
    this.assertProfessional(userId, role);

    const advanced = options?.advanced === true;
    const statePrefix = advanced ? 'a' : 'b';
    const state = `${statePrefix}${randomBytes(23).toString('hex')}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await this.prisma.socialFacebookOAuthSession.deleteMany({ where: { userId } });
    await this.prisma.socialFacebookOAuthSession.create({
      data: {
        id: state,
        userId,
        userAccessToken: this.crypto.encrypt('pending'),
        expiresAt,
      },
    });

    const redirectUri = encodeURIComponent(this.oauthRedirectUri());
    const appId = encodeURIComponent(this.facebookConfig.getAppId()!);
    const scope = encodeURIComponent(
      advanced
        ? `${FACEBOOK_BASIC_SCOPES},${FACEBOOK_ADVANCED_PAGE_SCOPES}`
        : FACEBOOK_BASIC_SCOPES,
    );
    return (
      `https://www.facebook.com/v21.0/dialog/oauth?` +
      `client_id=${appId}&redirect_uri=${redirectUri}&state=${state}&scope=${scope}&response_type=code`
    );
  }

  async handleOAuthCallback(
    code: string | undefined,
    state: string | undefined,
  ): Promise<FacebookOAuthCallbackResult> {
    if (!code?.trim()) {
      return { ok: false, redirectUrl: this.getErrorRedirectUrl('missing_code') };
    }
    if (!state?.trim()) {
      return { ok: false, redirectUrl: this.getErrorRedirectUrl('missing_state') };
    }

    const stateValue = state.trim();
    const advanced = stateValue.startsWith('a');

    const session = await this.prisma.socialFacebookOAuthSession.findUnique({
      where: { id: stateValue },
    });
    if (!session || session.expiresAt.getTime() < Date.now()) {
      return { ok: false, redirectUrl: this.getErrorRedirectUrl('session_expired') };
    }

    try {
      const shortToken = await this.exchangeCodeForToken(code.trim());
      const longLived = await this.exchangeForLongLivedToken(shortToken);
      const userToken = longLived.access_token?.trim() || shortToken;
      const me = await this.fetchGraphJson<GraphMeResponse>(
        `${GRAPH_API}/me?fields=id,name,picture&access_token=${encodeURIComponent(userToken)}`,
      );
      if (!me.id) throw new BadRequestException('Neplatný Facebook token.');

      const facebookName = me.name?.trim() || null;
      const facebookPicture = me.picture?.data?.url?.trim() || null;

      await this.prisma.socialConnection.upsert({
        where: {
          userId_provider: { userId: session.userId, provider: SocialProvider.FACEBOOK },
        },
        create: {
          userId: session.userId,
          provider: SocialProvider.FACEBOOK,
          facebookUserId: me.id,
          facebookName,
          facebookEmail: null,
          facebookPicture,
          syncEnabled: false,
        },
        update: {
          facebookUserId: me.id,
          facebookName,
          facebookEmail: null,
          facebookPicture,
          lastSyncError: null,
        },
      });

      const user = await this.prisma.user.findUnique({
        where: { id: session.userId },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          avatar: true,
          coverImage: true,
          bio: true,
          city: true,
          createdAt: true,
        },
      });
      const accessToken = user ? this.auth.issueTokens(user).accessToken : undefined;

      if (advanced) {
        await this.prisma.socialFacebookOAuthSession.update({
          where: { id: session.id },
          data: { userAccessToken: this.crypto.encrypt(userToken) },
        });
        return {
          ok: true,
          redirectUrl: `${this.getFrontendSettingsUrl()}&facebook=select`,
          accessToken,
        };
      }

      await this.prisma.socialFacebookOAuthSession.deleteMany({ where: { userId: session.userId } });
      return {
        ok: true,
        redirectUrl: this.getSuccessRedirectUrl(),
        accessToken,
      };
    } catch (err) {
      const reason =
        err instanceof Error ? err.message.slice(0, 120) : 'oauth_failed';
      return { ok: false, redirectUrl: this.getErrorRedirectUrl(reason) };
    }
  }

  async getConnectionStatus(userId: string) {
    const row = await this.prisma.socialConnection.findUnique({
      where: { userId_provider: { userId, provider: SocialProvider.FACEBOOK } },
      select: {
        facebookUserId: true,
        facebookName: true,
        facebookEmail: true,
        facebookPicture: true,
        pageId: true,
        pageName: true,
        syncEnabled: true,
        lastSyncAt: true,
        lastSyncError: true,
        tokenExpiresAt: true,
        updatedAt: true,
      },
    });

    const tokenInvalid = this.isTokenError(row?.lastSyncError);
    const accountConnected = Boolean(row?.facebookUserId);
    return {
      configured: this.isConfigured(),
      accountConnected,
      connected: Boolean(row?.pageId),
      facebookUserId: row?.facebookUserId ?? null,
      facebookName: row?.facebookName ?? null,
      facebookEmail: row?.facebookEmail ?? null,
      facebookPicture: row?.facebookPicture ?? null,
      pageId: row?.pageId ?? null,
      pageName: row?.pageName ?? null,
      syncEnabled: row?.syncEnabled ?? false,
      lastSyncAt: row?.lastSyncAt?.toISOString() ?? null,
      lastSyncError: row?.lastSyncError ?? null,
      tokenNeedsReauth: tokenInvalid,
      pendingPageSelection:
        !row?.pageId && accountConnected && (await this.hasPendingOAuthSession(userId)),
    };
  }

  private async hasPendingOAuthSession(userId: string): Promise<boolean> {
    const session = await this.prisma.socialFacebookOAuthSession.findFirst({
      where: { userId, expiresAt: { gt: new Date() } },
      select: { userAccessToken: true },
    });
    if (!session?.userAccessToken) return false;
    try {
      return this.crypto.decrypt(session.userAccessToken) !== 'pending';
    } catch {
      return false;
    }
  }

  async adminListConnections() {
    const rows = await this.prisma.socialConnection.findMany({
      where: { provider: SocialProvider.FACEBOOK },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        _count: { select: { importedPosts: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((r) => ({
      userId: r.userId,
      userName: r.user.name,
      email: r.user.email,
      role: r.user.role,
      pageId: r.pageId,
      pageName: r.pageName,
      syncEnabled: r.syncEnabled,
      lastSyncAt: r.lastSyncAt?.toISOString() ?? null,
      importedCount: r._count.importedPosts,
      lastSyncError: r.lastSyncError,
      connected: Boolean(r.pageId),
    }));
  }

  private isTokenError(message: string | null | undefined): boolean {
    if (!message) return false;
    const m = message.toLowerCase();
    return (
      m.includes('expired') ||
      m.includes('invalid') ||
      m.includes('oauth') ||
      m.includes('session') ||
      m.includes('190')
    );
  }

  async listManagedPages(userId: string): Promise<FacebookPageOption[]> {
    const userToken = await this.resolveUserAccessToken(userId);
    const data = await this.fetchGraphJson<GraphAccountsResponse>(
      `${GRAPH_API}/me/accounts?fields=id,name,access_token&limit=100&access_token=${encodeURIComponent(userToken)}`,
    );
    return (data.data ?? [])
      .filter((p) => p.id && p.name)
      .map((p) => ({ id: p.id!, name: p.name! }));
  }

  async selectPage(userId: string, role: UserRole, pageId: string) {
    this.assertProfessional(userId, role);
    const pages = await this.listManagedPages(userId);
    const selected = pages.find((p) => p.id === pageId.trim());
    if (!selected) {
      throw new BadRequestException('Vybraná Facebook stránka není mezi stránkami, které spravujete.');
    }

    const userToken = await this.resolveUserAccessToken(userId);
    const accounts = await this.fetchGraphJson<GraphAccountsResponse>(
      `${GRAPH_API}/me/accounts?fields=id,name,access_token&limit=100&access_token=${encodeURIComponent(userToken)}`,
    );
    const pageRow = (accounts.data ?? []).find((p) => p.id === selected.id);
    const pageToken = pageRow?.access_token?.trim();
    if (!pageToken) {
      throw new BadRequestException('Nepodařilo se získat přístupový token pro vybranou stránku.');
    }

    const connection = await this.prisma.socialConnection.upsert({
      where: { userId_provider: { userId, provider: SocialProvider.FACEBOOK } },
      create: {
        userId,
        provider: SocialProvider.FACEBOOK,
        pageId: selected.id,
        pageName: selected.name,
        pageAccessToken: this.crypto.encrypt(pageToken),
        syncEnabled: true,
      },
      update: {
        pageId: selected.id,
        pageName: selected.name,
        pageAccessToken: this.crypto.encrypt(pageToken),
        syncEnabled: true,
        lastSyncError: null,
      },
    });

    await this.prisma.socialFacebookOAuthSession.deleteMany({ where: { userId } });

    void this.sync.syncConnection(connection.id).catch(() => undefined);

    return {
      ok: true,
      pageId: selected.id,
      pageName: selected.name,
      syncEnabled: true,
      message:
        'Hotovo. Nové příspěvky z vaší Facebook stránky budeme automaticky přidávat i na xxrealit.',
    };
  }

  async setSyncEnabled(userId: string, syncEnabled: boolean) {
    const row = await this.prisma.socialConnection.findUnique({
      where: { userId_provider: { userId, provider: SocialProvider.FACEBOOK } },
    });
    if (!row?.pageId) throw new NotFoundException('Facebook stránka není propojena.');
    await this.prisma.socialConnection.update({
      where: { id: row.id },
      data: { syncEnabled },
    });
    return { ok: true, syncEnabled };
  }

  async disconnect(userId: string) {
    await this.prisma.socialImportedPost.deleteMany({ where: { userId } });
    await this.prisma.socialConnection.deleteMany({
      where: { userId, provider: SocialProvider.FACEBOOK },
    });
    await this.prisma.socialFacebookOAuthSession.deleteMany({ where: { userId } });
    return { ok: true };
  }

  async syncNow(userId: string) {
    const row = await this.prisma.socialConnection.findUnique({
      where: { userId_provider: { userId, provider: SocialProvider.FACEBOOK } },
    });
    if (!row?.pageId || !row.pageAccessToken) {
      throw new BadRequestException('Nejprve propojte Facebook stránku.');
    }
    return this.sync.syncConnection(row.id);
  }

  decryptPageToken(encrypted: string): string {
    return this.crypto.decrypt(encrypted);
  }

  private async resolveUserAccessToken(userId: string): Promise<string> {
    const session = await this.prisma.socialFacebookOAuthSession.findFirst({
      where: { userId, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (session?.userAccessToken) {
      const token = this.crypto.decrypt(session.userAccessToken);
      if (token !== 'pending') return token;
    }
    throw new BadRequestException(
      'Facebook propojení vyžaduje nové přihlášení. Klikněte na „Propojit Facebook stránku“.',
    );
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

  async fetchGraphJson<T>(url: string): Promise<T> {
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
