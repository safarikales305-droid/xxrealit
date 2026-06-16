import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SocialProvider, UserRole, MarketingBonusActionType } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../../database/prisma.service';
import { TokenEncryptionService } from '../token-encryption.service';
import {
  FACEBOOK_OAUTH_DIALOG,
  FACEBOOK_PAGE_API_SCOPES,
  GRAPH_API,
} from './facebook-page.constants';
import { FacebookConfigService } from './facebook-config.service';
import { FacebookPageSyncService } from './facebook-page-sync.service';
import { BonusCampaignService } from '../../bonus-campaign/bonus-campaign.service';
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

type FacebookOAuthMode = 'connect' | 'change_page';

type ParsedOAuthSessionMode = {
  oauthMode: FacebookOAuthMode;
  previousPageId: string | null;
};

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
    private readonly bonusCampaigns: BonusCampaignService,
  ) {}

  isConfigured(): boolean {
    return this.facebookConfig.isPagesConfigured();
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

  private pageConnectRedirectUri(): string {
    return this.facebookConfig.resolvePageConnectRedirectUri();
  }

  private assertProfessional(userId: string, role: UserRole) {
    if (!PROFESSIONAL_ROLES.includes(role)) {
      throw new ForbiddenException(
        'Propojení Facebook stránky je dostupné jen pro profesionální účty.',
      );
    }
  }

  private parseOAuthSessionMode(mode: string): ParsedOAuthSessionMode {
    if (mode.startsWith('change_page:')) {
      const previousPageId = mode.slice('change_page:'.length);
      return {
        oauthMode: 'change_page',
        previousPageId: previousPageId === 'none' ? null : previousPageId,
      };
    }
    return { oauthMode: 'connect', previousPageId: null };
  }

  private isPagesConnectSession(mode: string): boolean {
    return mode === 'connect' || mode === 'account' || mode.startsWith('change_page');
  }

  private buildPagesOAuthRedirect(
    settingsUrl: string,
    pages: FacebookPageOption[],
    sessionMode: string,
  ): FacebookOAuthCallbackResult {
    const { oauthMode, previousPageId } = this.parseOAuthSessionMode(sessionMode);

    if (!pages.length) {
      return { ok: false, redirectUrl: `${settingsUrl}&facebook=error&reason=no_pages` };
    }

    if (pages.length === 1) {
      const only = pages[0];
      if (oauthMode === 'change_page' && previousPageId && only.id === previousPageId) {
        return {
          ok: true,
          redirectUrl:
            `${settingsUrl}&facebook=only_previous` +
            `&pageId=${encodeURIComponent(only.id)}` +
            `&pageName=${encodeURIComponent(only.name)}` +
            `&previousPageId=${encodeURIComponent(previousPageId)}`,
        };
      }
      return {
        ok: true,
        redirectUrl:
          `${settingsUrl}&facebook=confirm` +
          `&pageId=${encodeURIComponent(only.id)}` +
          `&pageName=${encodeURIComponent(only.name)}`,
      };
    }

    const previousQuery = previousPageId
      ? `&previousPageId=${encodeURIComponent(previousPageId)}`
      : '';
    return { ok: true, redirectUrl: `${settingsUrl}&facebook=select${previousQuery}` };
  }

  async preparePageReselect(userId: string): Promise<void> {
    this.logger.log(`FACEBOOK_PAGE_RESELECT_PREPARE userId=${userId}`);
    await this.disconnectActivePage(userId);
    await this.prisma.facebookPagesUserAuth.deleteMany({ where: { userId } });
    await this.cleanupPageOAuthSession(userId);
    await this.cleanupAccountOAuthSession(userId);
  }

  async buildConnectUrl(
    userId: string,
    role: UserRole,
    options?: { mode?: FacebookOAuthMode },
  ): Promise<string> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(this.facebookConfig.pagesConfigurationErrorMessage());
    }
    this.assertProfessional(userId, role);

    const oauthMode: FacebookOAuthMode =
      options?.mode === 'change_page' ? 'change_page' : 'connect';

    const previousPageId =
      oauthMode === 'change_page'
        ? (
            await this.prisma.facebookPageConnection.findFirst({
              where: { userId, isActive: true },
              select: { pageId: true },
            })
          )?.pageId ?? null
        : null;

    if (oauthMode === 'change_page') {
      await this.preparePageReselect(userId);
    }

    const statePrefix = oauthMode === 'change_page' ? 'c' : 'a';
    const state = `${statePrefix}${randomBytes(23).toString('hex')}`;
    const sessionMode =
      oauthMode === 'change_page'
        ? `change_page:${previousPageId ?? 'none'}`
        : 'connect';
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await this.cleanupAccountOAuthSession(userId);
    await this.cleanupPageOAuthSession(userId);
    await this.prisma.socialFacebookOAuthSession.create({
      data: {
        id: state,
        userId,
        mode: sessionMode,
        userAccessToken: this.crypto.encrypt('pending'),
        expiresAt,
      },
    });

    this.logger.log(
      `FACEBOOK_OAUTH_START userId=${userId} oauthMode=${oauthMode} state=${state} sessionMode=${sessionMode} previousPageId=${previousPageId ?? 'none'}`,
    );

    const redirectUri = encodeURIComponent(this.pageConnectRedirectUri());
    const appId = encodeURIComponent(this.facebookConfig.getPagesAppId()!);
    const scope = encodeURIComponent(FACEBOOK_PAGE_API_SCOPES);
    const forceReauthParams =
      oauthMode === 'change_page'
        ? '&auth_type=rerequest&prompt=select_account&force_reauth=true'
        : '&prompt=select_account';
    return (
      `${FACEBOOK_OAUTH_DIALOG}?` +
      `client_id=${appId}&redirect_uri=${redirectUri}&state=${state}&scope=${scope}&response_type=code${forceReauthParams}`
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
    this.logger.log(
      `FACEBOOK_OAUTH_CALLBACK mode=page state=${state?.trim() ?? 'missing'} error=${oauthError ?? 'none'}`,
    );
    if (state?.trim().startsWith('a') || state?.trim().startsWith('c')) {
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
      await this.persistPagesUserToken(session.userId, userToken, tokenExpiresAt);

      const pages = await this.listManagedPages(session.userId, {
        accessToken: userToken,
        tokenSource: 'new_oauth',
      });
      this.logger.log(
        `FACEBOOK_OAUTH_PAGES userId=${session.userId} count=${pages.length} pageIds=${pages.map((p) => p.id).join(',') || 'none'} tokenSource=new_oauth`,
      );

      await this.cleanupPageOAuthSession(session.userId);
      return this.buildPagesOAuthRedirect(settingsUrl, pages, session.mode);
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
    if (!state?.trim() || (!state.trim().startsWith('a') && !state.trim().startsWith('c'))) {
      return { ok: false, redirectUrl: `${settingsUrl}&facebook=error&reason=missing_state` };
    }

    const session = await this.prisma.socialFacebookOAuthSession.findUnique({
      where: { id: state.trim() },
    });
    if (
      !session?.userId ||
      !this.isPagesConnectSession(session.mode) ||
      session.expiresAt.getTime() < Date.now()
    ) {
      return { ok: false, redirectUrl: `${settingsUrl}&facebook=error&reason=session_expired` };
    }

    const { oauthMode } = this.parseOAuthSessionMode(session.mode);
    this.logger.log(
      `FACEBOOK_OAUTH_CALLBACK userId=${session.userId} oauthMode=${oauthMode} state=${state.trim()}`,
    );

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

      const me = await this.persistPagesUserToken(session.userId, userToken, tokenExpiresAt);
      this.logger.log(
        `FACEBOOK_OAUTH_TOKEN userId=${session.userId} facebookUserId=${me.id ?? 'unknown'} tokenSource=new_oauth`,
      );

      await this.cleanupAccountOAuthSession(session.userId);

      try {
        const pages = await this.listManagedPages(session.userId, {
          accessToken: userToken,
          tokenSource: 'new_oauth',
        });
        this.logger.log(
          `FACEBOOK_OAUTH_PAGES userId=${session.userId} oauthMode=${oauthMode} facebookUserId=${me.id ?? 'unknown'} count=${pages.length} pageIds=${pages.map((p) => p.id).join(',') || 'none'} tokenSource=new_oauth`,
        );
        return this.buildPagesOAuthRedirect(settingsUrl, pages, session.mode);
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
    const [loginAccounts, pagesAccounts, pages, syncedPosts, lastSync, lastError] =
      await Promise.all([
      this.prisma.facebookConnection.count(),
      this.prisma.facebookPagesUserAuth.count(),
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
      connectedAccounts: pagesAccounts,
      connectedLoginAccounts: loginAccounts,
      connectedPages: pages,
      syncedPosts,
      lastSyncAt: lastSync?.lastSyncAt?.toISOString() ?? null,
      lastError: lastError
        ? { message: lastError.lastSyncError, pageName: lastError.pageName, at: lastError.updatedAt.toISOString() }
        : null,
    };
  }

  async getConnectionStatus(userId: string) {
    const pagesAuth = await this.prisma.facebookPagesUserAuth.findUnique({ where: { userId } });
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
    const accountConnected = Boolean(pagesAuth?.facebookUserId);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    const pageConnectScopesAvailable = this.facebookConfig.arePageConnectScopesAvailable(
      user?.role,
      pagesAuth?.facebookUserId,
    );
    return {
      configured: this.isConfigured(),
      accountConnected,
      pageConnectScopesAvailable,
      connected: Boolean(activePage?.pageId),
      facebookUserId: pagesAuth?.facebookUserId ?? null,
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
      throw new BadRequestException('Nejprve propojte Facebook stránku přes OAuth.');
    }
    return this.listManagedPages(userId);
  }

  async listManagedPages(
    userId: string,
    options?: { accessToken?: string; tokenSource?: 'new_oauth' | 'oauth_session' | 'pages_auth_db' },
  ): Promise<FacebookPageOption[]> {
    try {
      let userToken: string;
      let tokenSource: string;
      if (options?.accessToken?.trim()) {
        userToken = options.accessToken.trim();
        tokenSource = options.tokenSource ?? 'new_oauth';
      } else {
        const resolved = await this.resolveUserAccessToken(userId);
        userToken = resolved.token;
        tokenSource = resolved.source;
      }
      this.logger.log(
        `FACEBOOK_PAGES_FETCH userId=${userId} tokenSource=${tokenSource}`,
      );
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
      this.logger.log(
        `FACEBOOK_PAGES_LOADED userId=${userId} count=${pages.length} pageIds=${pages.map((p) => p.id).join(',') || 'none'} tokenSource=${tokenSource}`,
      );
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
    const { token: userToken, source: tokenSource } = await this.resolveUserAccessToken(userId);
    this.logger.log(
      `FACEBOOK_PAGE_SELECT_START userId=${userId} selectedPageId=${pageId.trim()} tokenSource=${tokenSource}`,
    );
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
      `FACEBOOK_PAGE_SELECTED userId=${userId} pageId=${pageRow.id} pageName=${pageRow.name} tokenSource=${tokenSource}`,
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

    void this.bonusCampaigns
      .evaluateMarketingBonuses(userId, MarketingBonusActionType.FACEBOOK_CONNECT)
      .catch(() => undefined);

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
    await this.prisma.facebookPagesUserAuth.deleteMany({ where: { userId } });
    await this.prisma.socialFacebookOAuthSession.deleteMany({ where: { userId } });
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        facebookUrl: null,
        facebookLastSyncAt: null,
        facebookImportEnabled: false,
        facebookImportError: null,
      },
    });
    this.logger.log(`FACEBOOK_DISCONNECTED userId=${userId}`);
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

  private async persistPagesUserToken(
    userId: string,
    userToken: string,
    tokenExpiresAt: Date | null,
  ) {
    const me = await this.fetchGraphJson<GraphMeResponse>(
      `${GRAPH_API}/me?fields=id,name,email,picture&access_token=${encodeURIComponent(userToken)}`,
    );
    if (!me.id) throw new BadRequestException('Neplatný Facebook token.');

    const scopes = FACEBOOK_PAGE_API_SCOPES.split(',');
    const encryptedToken = this.crypto.encrypt(userToken);
    await this.prisma.facebookPagesUserAuth.upsert({
      where: { userId },
      create: {
        userId,
        facebookUserId: me.id,
        accessTokenEncrypted: encryptedToken,
        tokenExpiresAt,
        scopes,
      },
      update: {
        facebookUserId: me.id,
        accessTokenEncrypted: encryptedToken,
        tokenExpiresAt,
        scopes,
      },
    });
    return me;
  }

  private async resolveUserAccessToken(
    userId: string,
  ): Promise<{ token: string; source: 'oauth_session' | 'pages_auth_db' }> {
    const session = await this.prisma.socialFacebookOAuthSession.findFirst({
      where: { userId, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (session?.userAccessToken) {
      const token = this.crypto.decrypt(session.userAccessToken);
      if (token !== 'pending') {
        return { token, source: 'oauth_session' };
      }
    }

    const pagesAuth = await this.prisma.facebookPagesUserAuth.findUnique({
      where: { userId },
      select: { accessTokenEncrypted: true, tokenExpiresAt: true },
    });
    if (pagesAuth?.accessTokenEncrypted) {
      try {
        const token = this.crypto.decrypt(pagesAuth.accessTokenEncrypted);
        if (
          pagesAuth.tokenExpiresAt &&
          pagesAuth.tokenExpiresAt.getTime() < Date.now()
        ) {
          throw new BadRequestException(
            'Facebook Pages propojení vypršelo. Klikněte na „Propojit Facebook stránku“.',
          );
        }
        return { token, source: 'pages_auth_db' };
      } catch (err) {
        if (err instanceof BadRequestException) throw err;
        // fall through
      }
    }

    throw new BadRequestException(
      'Facebook stránka není propojena. Klikněte na „Propojit Facebook stránku“.',
    );
  }

  private async exchangeCodeForToken(code: string, redirectUriRaw?: string): Promise<string> {
    const appId = this.facebookConfig.getPagesAppId()!;
    const appSecret = this.facebookConfig.getPagesAppSecret()!;
    const redirectUri = encodeURIComponent(redirectUriRaw ?? this.pageConnectRedirectUri());
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
    const appId = this.facebookConfig.getPagesAppId()!;
    const appSecret = this.facebookConfig.getPagesAppSecret()!;
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
