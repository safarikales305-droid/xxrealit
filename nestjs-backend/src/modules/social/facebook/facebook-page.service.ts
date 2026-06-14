import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SocialProvider, UserRole } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../../database/prisma.service';
import { TokenEncryptionService } from '../token-encryption.service';
import {
  FACEBOOK_FULL_SCOPES,
  FACEBOOK_LOGIN_SCOPES,
  FACEBOOK_OAUTH_DIALOG,
  GRAPH_API,
} from './facebook-page.constants';
import { FacebookConfigService } from './facebook-config.service';
import { FacebookPageSyncService } from './facebook-page-sync.service';
import {
  FACEBOOK_PAGES_LIST_PERMISSION_MESSAGE,
  FACEBOOK_PAGE_SCOPES_NOT_AVAILABLE_LOG,
  FACEBOOK_PAGE_SCOPES_NOT_AVAILABLE_MESSAGE,
  isFacebookPageScopeError,
} from './facebook-page-scope.util';

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
  picture?: { data?: { url?: string } };
  tasks?: string[];
};
type GraphAccountsResponse = { data?: GraphPageAccount[] };

export type FacebookPageOption = { id: string; name: string; picture?: string | null };

export type FacebookOAuthCallbackResult = {
  ok: boolean;
  redirectUrl: string;
  accessToken?: string;
  isNewUser?: boolean;
  pageReviewRequired?: boolean;
  pageScopesNotAvailable?: boolean;
  message?: string;
};

@Injectable()
export class FacebookPageService {
  private readonly logger = new Logger(FacebookPageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly crypto: TokenEncryptionService,
    private readonly sync: FacebookPageSyncService,
    private readonly facebookConfig: FacebookConfigService,
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

  getSocialIntegrationsUrl(): string {
    return `${this.frontendUrl()}/profil/dashboard?tab=social-integrations`;
  }

  getPageScopesNotAvailableRedirectUrl(): string {
    return `${this.getSocialIntegrationsUrl()}&facebookPage=scopes_unavailable`;
  }

  /** @deprecated Použijte getPageScopesNotAvailableRedirectUrl */
  getPageReviewRequiredRedirectUrl(): string {
    return this.getPageScopesNotAvailableRedirectUrl();
  }

  private async cleanupPageOAuthSession(userId: string) {
    await this.prisma.socialFacebookOAuthSession.deleteMany({
      where: { userId, mode: 'page' },
    });
  }

  private async cleanupAccountOAuthSession(userId: string) {
    await this.prisma.socialFacebookOAuthSession.deleteMany({
      where: { userId, mode: 'account' },
    });
  }

  private pageScopesNotAvailableResult(): FacebookOAuthCallbackResult {
    return {
      ok: false,
      redirectUrl: this.getPageScopesNotAvailableRedirectUrl(),
      pageReviewRequired: true,
      pageScopesNotAvailable: true,
      message: FACEBOOK_PAGE_SCOPES_NOT_AVAILABLE_MESSAGE,
    };
  }

  handlePageOAuthDenied(
    oauthError?: string,
    errorReason?: string,
    errorDescription?: string,
  ): FacebookOAuthCallbackResult | null {
    if (!oauthError?.trim() && !errorReason?.trim() && !errorDescription?.trim()) {
      return null;
    }
    if (isFacebookPageScopeError(oauthError, errorReason, errorDescription)) {
      return this.pageScopesNotAvailableResult();
    }
    return {
      ok: false,
      redirectUrl: `${this.getSocialIntegrationsUrl()}&facebook=error&reason=${encodeURIComponent(
        (errorDescription ?? errorReason ?? oauthError ?? 'oauth_denied').slice(0, 120),
      )}`,
    };
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

  private pageConnectRedirectUri(): string {
    return this.facebookConfig.resolvePageConnectRedirectUri();
  }

  async buildConnectUrl(userId: string, role: UserRole): Promise<string> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(this.facebookConfig.configurationErrorMessage());
    }
    this.assertProfessional(userId, role);

    const state = `a${randomBytes(23).toString('hex')}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await this.cleanupAccountOAuthSession(userId);
    await this.cleanupPageOAuthSession(userId);
    await this.prisma.socialFacebookOAuthSession.create({
      data: {
        id: state,
        userId,
        mode: 'account',
        userAccessToken: this.crypto.encrypt('pending'),
        expiresAt,
      },
    });

    const redirectUri = encodeURIComponent(this.pageConnectRedirectUri());
    const appId = encodeURIComponent(this.facebookConfig.getAppId()!);
    const scope = encodeURIComponent(FACEBOOK_FULL_SCOPES);
    return (
      `${FACEBOOK_OAUTH_DIALOG}?` +
      `client_id=${appId}&redirect_uri=${redirectUri}&state=${state}&scope=${scope}&response_type=code`
    );
  }

  /** @deprecated Použijte buildConnectUrl */
  async buildAccountConnectUrl(userId: string, role: UserRole): Promise<string> {
    return this.buildConnectUrl(userId, role);
  }

  /** @deprecated Použijte buildConnectUrl */
  async buildPageConnectUrl(userId: string, role: UserRole): Promise<string> {
    return this.buildConnectUrl(userId, role);
  }

  async handlePageCallback(
    code: string | undefined,
    state: string | undefined,
    oauthError?: string,
    errorReason?: string,
    errorDescription?: string,
  ): Promise<FacebookOAuthCallbackResult> {
    if (state?.trim().startsWith('a')) {
      return this.handleAccountCallback(code, state, oauthError, errorReason, errorDescription);
    }

    const denied = this.handlePageOAuthDenied(oauthError, errorReason, errorDescription);
    if (denied) {
      if (denied.pageReviewRequired && state?.trim().startsWith('p')) {
        const session = await this.prisma.socialFacebookOAuthSession.findUnique({
          where: { id: state.trim() },
        });
        if (session?.userId) await this.cleanupPageOAuthSession(session.userId);
      }
      return denied;
    }

    const settingsUrl = this.getSocialIntegrationsUrl();
    if (!code?.trim()) {
      return { ok: false, redirectUrl: `${settingsUrl}&facebook=error&reason=missing_code` };
    }
    if (!state?.trim() || !state.trim().startsWith('p')) {
      return { ok: false, redirectUrl: `${settingsUrl}&facebook=error&reason=missing_state` };
    }

    const session = await this.prisma.socialFacebookOAuthSession.findUnique({
      where: { id: state.trim() },
    });
    if (!session?.userId || session.mode !== 'page' || session.expiresAt.getTime() < Date.now()) {
      return { ok: false, redirectUrl: `${settingsUrl}&facebook=error&reason=session_expired` };
    }

    try {
      const shortToken = await this.exchangeCodeForToken(
        code.trim(),
        this.pageConnectRedirectUri(),
      );
      const longLived = await this.exchangeForLongLivedToken(shortToken);
      const userToken = longLived.access_token?.trim() || shortToken;
      const expiresIn = longLived.expires_in;
      const tokenExpiresAt =
        expiresIn != null && Number.isFinite(expiresIn)
          ? new Date(Date.now() + expiresIn * 1000)
          : null;

      await this.prisma.socialFacebookOAuthSession.update({
        where: { id: session.id },
        data: { userAccessToken: this.crypto.encrypt(userToken) },
      });
      await this.persistUserFacebookToken(session.userId, userToken, tokenExpiresAt, true);

      const pages = await this.listManagedPages(session.userId);
      if (!pages.length) {
        await this.cleanupPageOAuthSession(session.userId);
        return { ok: false, redirectUrl: `${settingsUrl}&facebook=error&reason=no_pages` };
      }

      if (pages.length === 1) {
        const user = await this.prisma.user.findUnique({ where: { id: session.userId } });
        await this.selectPage(session.userId, (user?.role ?? UserRole.AGENT) as UserRole, pages[0].id);
        await this.cleanupPageOAuthSession(session.userId);
        return { ok: true, redirectUrl: `${settingsUrl}&facebook=page_connected` };
      }

      return { ok: true, redirectUrl: `${settingsUrl}&facebook=select` };
    } catch (err) {
      await this.cleanupPageOAuthSession(session.userId);
      const reason = err instanceof Error ? err.message : 'oauth_failed';
      if (isFacebookPageScopeError(reason)) {
        return this.pageScopesNotAvailableResult();
      }
      return {
        ok: false,
        redirectUrl: `${settingsUrl}&facebook=error&reason=${encodeURIComponent(reason.slice(0, 120))}`,
      };
    }
  }

  async handleAccountCallback(
    code: string | undefined,
    state: string | undefined,
    oauthError?: string,
    errorReason?: string,
    errorDescription?: string,
  ): Promise<FacebookOAuthCallbackResult> {
    const settingsUrl = this.getSocialIntegrationsUrl();
    if (oauthError?.trim() || errorReason?.trim() || errorDescription?.trim()) {
      const reason = (errorDescription ?? errorReason ?? oauthError ?? 'oauth_denied').slice(0, 120);
      return {
        ok: false,
        redirectUrl: `${settingsUrl}&facebook=error&reason=${encodeURIComponent(reason)}`,
      };
    }

    if (!code?.trim()) {
      return { ok: false, redirectUrl: `${settingsUrl}&facebook=error&reason=missing_code` };
    }
    if (!state?.trim() || !state.trim().startsWith('a')) {
      return { ok: false, redirectUrl: `${settingsUrl}&facebook=error&reason=missing_state` };
    }

    const session = await this.prisma.socialFacebookOAuthSession.findUnique({
      where: { id: state.trim() },
    });
    if (!session?.userId || session.mode !== 'account' || session.expiresAt.getTime() < Date.now()) {
      return { ok: false, redirectUrl: `${settingsUrl}&facebook=error&reason=session_expired` };
    }

    try {
      const shortToken = await this.exchangeCodeForToken(
        code.trim(),
        this.pageConnectRedirectUri(),
      );
      const longLived = await this.exchangeForLongLivedToken(shortToken);
      const userToken = longLived.access_token?.trim() || shortToken;
      const expiresIn = longLived.expires_in;
      const tokenExpiresAt =
        expiresIn != null && Number.isFinite(expiresIn)
          ? new Date(Date.now() + expiresIn * 1000)
          : null;

      await this.persistUserFacebookToken(session.userId, userToken, tokenExpiresAt, true);

      await this.cleanupAccountOAuthSession(session.userId);

      const user = await this.prisma.user.findUnique({
        where: { id: session.userId },
        select: { role: true },
      });
      const role = (user?.role ?? UserRole.AGENT) as UserRole;

      try {
        const pages = await this.listManagedPages(session.userId);
        if (pages.length === 1) {
          await this.selectPage(session.userId, role, pages[0].id);
          return {
            ok: true,
            redirectUrl: `${settingsUrl}&facebook=page_connected&pageName=${encodeURIComponent(pages[0].name)}`,
          };
        }
        if (pages.length > 1) {
          return { ok: true, redirectUrl: `${settingsUrl}&facebook=select` };
        }
        return {
          ok: true,
          redirectUrl: `${settingsUrl}&facebook=connected&reason=no_pages`,
        };
      } catch (pagesErr) {
        const reason = pagesErr instanceof Error ? pagesErr.message : 'pages_failed';
        if (isFacebookPageScopeError(reason)) {
          this.logger.warn(
            `${FACEBOOK_PAGE_SCOPES_NOT_AVAILABLE_LOG} userId=${session.userId} reason=${reason}`,
          );
          return this.pageScopesNotAvailableResult();
        }
        this.logger.warn(
          `FACEBOOK_PAGES_LOAD_FAILED userId=${session.userId} reason=${reason}`,
        );
        return { ok: true, redirectUrl: `${settingsUrl}&facebook=connected` };
      }
    } catch (err) {
      await this.cleanupAccountOAuthSession(session.userId);
      const reason = err instanceof Error ? err.message : 'oauth_failed';
      return {
        ok: false,
        redirectUrl: `${settingsUrl}&facebook=error&reason=${encodeURIComponent(reason.slice(0, 120))}`,
      };
    }
  }

  async handleOAuthCallback(
    code: string | undefined,
    state: string | undefined,
  ): Promise<FacebookOAuthCallbackResult> {
    if (state?.trim().startsWith('p')) {
      return this.handlePageCallback(code, state);
    }
    return { ok: false, redirectUrl: this.getErrorRedirectUrl('invalid_oauth_flow') };
  }

  async getAdminStats() {
    const [accounts, pages, syncedPosts, lastSync, lastError] = await Promise.all([
      this.prisma.facebookConnection.count(),
      this.prisma.facebookPageConnection.count({ where: { isActive: true } }),
      this.prisma.facebookSyncedPost.count(),
      this.prisma.facebookPageConnection.findFirst({
        where: { lastSyncAt: { not: null } },
        orderBy: { lastSyncAt: 'desc' },
        select: { lastSyncAt: true },
      }),
      this.prisma.facebookPageConnection.findFirst({
        where: { lastSyncError: { not: null } },
        orderBy: { updatedAt: 'desc' },
        select: { lastSyncError: true, pageName: true, updatedAt: true },
      }),
    ]);
    return {
      connectedAccounts: accounts,
      connectedPages: pages,
      syncedPosts,
      lastSyncAt: lastSync?.lastSyncAt?.toISOString() ?? null,
      lastError: lastError
        ? { message: lastError.lastSyncError, pageName: lastError.pageName, at: lastError.updatedAt.toISOString() }
        : null,
    };
  }

  async getConnectionStatus(userId: string) {
    const fbLogin = await this.prisma.facebookConnection.findUnique({ where: { userId } });
    const activePage = await this.prisma.facebookPageConnection.findFirst({
      where: { userId, isActive: true },
      orderBy: { updatedAt: 'desc' },
    });
    const allPages = await this.prisma.facebookPageConnection.findMany({
      where: { userId },
      orderBy: { pageName: 'asc' },
      select: {
        id: true,
        pageId: true,
        pageName: true,
        pagePictureUrl: true,
        isActive: true,
        lastSyncAt: true,
        lastSyncError: true,
      },
    });

    const tokenInvalid = this.isTokenError(activePage?.lastSyncError);
    const accountConnected = Boolean(fbLogin?.facebookUserId);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    const pageConnectScopesAvailable = this.facebookConfig.arePageConnectScopesAvailable(
      user?.role,
      fbLogin?.facebookUserId,
    );
    return {
      configured: this.isConfigured(),
      accountConnected,
      pageConnectScopesAvailable,
      connected: Boolean(activePage?.pageId),
      facebookUserId: fbLogin?.facebookUserId ?? null,
      facebookName: null,
      facebookEmail: null,
      facebookPicture: null,
      pageId: activePage?.pageId ?? null,
      pageName: activePage?.pageName ?? null,
      pagePictureUrl: activePage?.pagePictureUrl ?? null,
      pages: allPages.map((p) => ({
        id: p.id,
        pageId: p.pageId,
        pageName: p.pageName,
        pagePictureUrl: p.pagePictureUrl,
        isActive: p.isActive,
        lastSyncAt: p.lastSyncAt?.toISOString() ?? null,
        lastSyncError: p.lastSyncError,
      })),
      syncEnabled: activePage?.isActive ?? false,
      lastSyncAt: activePage?.lastSyncAt?.toISOString() ?? null,
      lastSyncError: activePage?.lastSyncError ?? null,
      tokenNeedsReauth: tokenInvalid,
      pendingPageSelection:
        !activePage?.pageId &&
        (accountConnected || (await this.hasPendingOAuthSession(userId))),
      needsPageSelection: accountConnected && !activePage?.pageId,
    };
  }

  private async hasPendingOAuthSession(userId: string): Promise<boolean> {
    const session = await this.prisma.socialFacebookOAuthSession.findFirst({
      where: { userId, mode: 'page', expiresAt: { gt: new Date() } },
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

  async listAvailablePages(userId: string, _role: UserRole): Promise<FacebookPageOption[]> {
    const status = await this.getConnectionStatus(userId);
    if (!status.accountConnected) {
      throw new BadRequestException('Nejprve propojte Facebook účet.');
    }
    return this.listManagedPages(userId);
  }

  async listManagedPages(userId: string): Promise<FacebookPageOption[]> {
    try {
      const userToken = await this.resolveUserAccessToken(userId);
      const data = await this.fetchGraphJson<GraphAccountsResponse>(
        `${GRAPH_API}/me/accounts?fields=id,name,picture.type(large),access_token&limit=100&access_token=${encodeURIComponent(userToken)}`,
      );
      const pages = (data.data ?? [])
        .filter((p) => p.id && p.name)
        .map((p) => ({
          id: p.id!,
          name: p.name!,
          picture: p.picture?.data?.url ?? null,
        }));
      this.logger.log(`FACEBOOK_PAGES_LOADED userId=${userId} count=${pages.length}`);
      return pages;
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown';
      if (isFacebookPageScopeError(reason)) {
        throw new ForbiddenException(FACEBOOK_PAGES_LIST_PERMISSION_MESSAGE);
      }
      throw err;
    }
  }

  async selectPage(userId: string, role: UserRole, pageId: string) {
    this.assertProfessional(userId, role);
    const userToken = await this.resolveUserAccessToken(userId);
    const accounts = await this.fetchGraphJson<GraphAccountsResponse>(
      `${GRAPH_API}/me/accounts?fields=id,name,picture.type(large),access_token&limit=100&access_token=${encodeURIComponent(userToken)}`,
    );
    const pageRow = (accounts.data ?? []).find((p) => p.id === pageId.trim());
    if (!pageRow?.id || !pageRow.name) {
      throw new BadRequestException('Vybraná Facebook stránka není mezi stránkami, které spravujete.');
    }
    const pageToken = pageRow.access_token?.trim();
    if (!pageToken) {
      throw new BadRequestException('Nepodařilo se získat přístupový token pro vybranou stránku.');
    }
    const pagePictureUrl = pageRow.picture?.data?.url ?? null;

    await this.prisma.facebookPageConnection.updateMany({
      where: { userId },
      data: { isActive: false },
    });

    const pageConnection = await this.prisma.facebookPageConnection.upsert({
      where: { userId_pageId: { userId, pageId: pageRow.id } },
      create: {
        userId,
        pageId: pageRow.id,
        pageName: pageRow.name,
        pagePictureUrl,
        pageAccessTokenEncrypted: this.crypto.encrypt(pageToken),
        isActive: true,
      },
      update: {
        pageName: pageRow.name,
        pagePictureUrl,
        pageAccessTokenEncrypted: this.crypto.encrypt(pageToken),
        isActive: true,
        lastSyncError: null,
      },
    });

    await this.prisma.socialConnection.upsert({
      where: { userId_provider: { userId, provider: SocialProvider.FACEBOOK } },
      create: {
        userId,
        provider: SocialProvider.FACEBOOK,
        pageId: pageRow.id,
        pageName: pageRow.name,
        pageAccessToken: this.crypto.encrypt(pageToken),
        syncEnabled: true,
      },
      update: {
        pageId: pageRow.id,
        pageName: pageRow.name,
        pageAccessToken: this.crypto.encrypt(pageToken),
        syncEnabled: true,
        lastSyncError: null,
      },
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        facebookUrl: `https://www.facebook.com/${pageRow.id}`,
      },
    });

    await this.prisma.socialFacebookOAuthSession.deleteMany({ where: { userId } });

    this.logger.log(
      `FACEBOOK_PAGE_SELECTED userId=${userId} pageId=${pageRow.id} pageName=${pageRow.name}`,
    );

    const syncResult = await this.sync.syncPageConnection(pageConnection.id).catch((syncErr) => {
      const message = syncErr instanceof Error ? syncErr.message : 'sync_failed';
      this.logger.warn(
        `FACEBOOK_PAGE_SYNC_FAILED userId=${userId} pageId=${pageRow.id} error=${message}`,
      );
      return { imported: 0, error: message };
    });
    if (!syncResult.error) {
      this.logger.log(
        `FACEBOOK_PAGE_POSTS_SYNCED userId=${userId} pageId=${pageRow.id} imported=${syncResult.imported ?? 0}`,
      );
    }

    return {
      ok: true,
      pageId: pageRow.id,
      pageName: pageRow.name,
      pagePictureUrl,
      syncEnabled: true,
      imported: syncResult.imported ?? 0,
      message: `Synchronizována stránka: ${pageRow.name}`,
    };
  }

  async setSyncEnabled(userId: string, syncEnabled: boolean) {
    const row = await this.prisma.facebookPageConnection.findFirst({
      where: { userId, isActive: true },
    });
    if (!row) throw new NotFoundException('Facebook stránka není propojena.');
    await this.prisma.facebookPageConnection.update({
      where: { id: row.id },
      data: { isActive: syncEnabled },
    });
    await this.prisma.socialConnection.updateMany({
      where: { userId, provider: SocialProvider.FACEBOOK },
      data: { syncEnabled },
    });
    return { ok: true, syncEnabled };
  }

  async disconnect(userId: string) {
    await this.disconnectActivePage(userId);
    await this.prisma.facebookConnection.deleteMany({ where: { userId } });
    await this.prisma.socialFacebookOAuthSession.deleteMany({ where: { userId } });
    return { ok: true };
  }

  async disconnectActivePage(userId: string) {
    await this.prisma.facebookSyncedPost.deleteMany({ where: { userId } });
    await this.prisma.facebookPageConnection.deleteMany({ where: { userId } });
    await this.prisma.socialImportedPost.deleteMany({ where: { userId } });
    await this.prisma.socialConnection.deleteMany({
      where: { userId, provider: SocialProvider.FACEBOOK },
    });
    return { ok: true };
  }

  async disconnectPage(userId: string, pageId: string) {
    const row = await this.prisma.facebookPageConnection.findFirst({
      where: { userId, pageId },
    });
    if (!row) throw new NotFoundException('Facebook stránka není propojena.');
    await this.prisma.facebookSyncedPost.deleteMany({ where: { pageConnectionId: row.id } });
    await this.prisma.facebookPageConnection.delete({ where: { id: row.id } });
    return { ok: true };
  }

  async syncNow(userId: string) {
    const row = await this.prisma.facebookPageConnection.findFirst({
      where: { userId, isActive: true },
    });
    if (!row) {
      throw new BadRequestException('Nejprve propojte Facebook stránku.');
    }
    return this.sync.syncPageConnection(row.id);
  }

  async syncPageById(userId: string, pageId: string) {
    const row = await this.prisma.facebookPageConnection.findFirst({
      where: { userId, pageId },
    });
    if (!row) throw new NotFoundException('Facebook stránka není propojena.');
    return this.sync.syncPageConnection(row.id);
  }

  decryptPageToken(encrypted: string): string {
    return this.crypto.decrypt(encrypted);
  }

  private async persistUserFacebookToken(
    userId: string,
    userToken: string,
    tokenExpiresAt: Date | null,
    includePageScopes: boolean,
  ) {
    const me = await this.fetchGraphJson<GraphMeResponse>(
      `${GRAPH_API}/me?fields=id,name,email,picture&access_token=${encodeURIComponent(userToken)}`,
    );
    if (!me.id) throw new BadRequestException('Neplatný Facebook token.');

    const scopes = includePageScopes ? FACEBOOK_FULL_SCOPES.split(',') : FACEBOOK_LOGIN_SCOPES.split(',');

    const encryptedToken = this.crypto.encrypt(userToken);
    await this.prisma.facebookConnection.upsert({
      where: { userId },
      create: {
        userId,
        facebookUserId: me.id,
        accessToken: '',
        accessTokenEncrypted: encryptedToken,
        tokenExpiresAt,
        scopes,
      },
      update: {
        facebookUserId: me.id,
        accessToken: '',
        accessTokenEncrypted: encryptedToken,
        tokenExpiresAt,
        scopes,
      },
    });
    return me;
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

    const connection = await this.prisma.facebookConnection.findUnique({
      where: { userId },
      select: { accessTokenEncrypted: true, accessToken: true },
    });
    if (connection?.accessTokenEncrypted) {
      try {
        return this.crypto.decrypt(connection.accessTokenEncrypted);
      } catch {
        // fall through
      }
    }
    if (connection?.accessToken?.trim()) {
      return connection.accessToken.trim();
    }

    throw new BadRequestException(
      'Facebook propojení vyžaduje nové přihlášení. Klikněte na „Propojit Facebook stránku“.',
    );
  }

  private async exchangeCodeForToken(code: string, redirectUriRaw?: string): Promise<string> {
    const appId = this.facebookConfig.getAppId()!;
    const appSecret = this.facebookConfig.getAppSecret()!;
    const redirectUri = encodeURIComponent(redirectUriRaw ?? this.oauthRedirectUri());
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
