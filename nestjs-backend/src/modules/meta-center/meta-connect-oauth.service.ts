import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';
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

export const META_OAUTH_LOG_PHASES = [
  'OAuth Request',
  'OAuth Callback',
  'OAuth Exchange',
  'OAuth Success',
  'OAuth Error',
] as const;

export type MetaOAuthLogPhase = (typeof META_OAUTH_LOG_PHASES)[number];

const FACEBOOK_OAUTH_PARAM_KEYS = [
  'code',
  'state',
  'error',
  'error_reason',
  'error_description',
  'error_code',
  'granted_scopes',
  'denied_scopes',
] as const;

export type MetaOAuthCallbackContext = {
  originalUrl: string;
  fullUrl: string;
  query: Record<string, string | null>;
  queryString: string;
  facebookParams: Record<string, string | null>;
  headers: Record<string, string>;
  cookies: Record<string, string>;
  ip: string | null;
  userAgent: string | null;
  receivedAt: string;
};

export type MetaOAuthLastCallback = MetaOAuthCallbackContext & {
  outcome: 'success' | 'error' | 'pending';
  reason: string | null;
  parsedJson: Record<string, unknown>;
};

export type MetaOAuthCompletedStatus = {
  completed: boolean;
  reason: string | null;
  at: string | null;
};

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

  private async logOAuthPhase(input: {
    phase: MetaOAuthLogPhase;
    request: Record<string, unknown>;
    response: Record<string, unknown>;
    errorCode?: string | null;
    errorMessage?: string | null;
    httpStatus?: number | null;
    durationMs?: number | null;
  }) {
    try {
      await this.prisma.metaCenterApiLog.create({
        data: {
          endpoint: input.phase,
          method: 'GET',
          request: this.toInputJson(input.request),
          response: this.toInputJson(input.response),
          httpStatus: input.httpStatus ?? null,
          errorCode: input.errorCode ?? null,
          errorMessage: input.errorMessage ?? null,
          durationMs: input.durationMs ?? null,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Meta OAuth log write failed (${input.phase}): ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  private parseCookies(cookieHeader: string | undefined): Record<string, string> {
    const cookies: Record<string, string> = {};
    if (!cookieHeader?.trim()) return cookies;
    for (const part of cookieHeader.split(';')) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const raw = trimmed.slice(eq + 1);
      try {
        cookies[key] = decodeURIComponent(raw);
      } catch {
        cookies[key] = raw;
      }
    }
    return cookies;
  }

  private sanitizeHeaders(headers: Request['headers']): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      if (value == null) continue;
      const lower = key.toLowerCase();
      if (lower === 'authorization' || lower === 'cookie') {
        out[key] = '[redacted]';
        continue;
      }
      out[key] = Array.isArray(value) ? value.join(', ') : String(value);
    }
    return out;
  }

  private normalizeQuery(
    query: Record<string, string | string[] | undefined>,
  ): Record<string, string | null> {
    const out: Record<string, string | null> = {};
    for (const [key, value] of Object.entries(query)) {
      if (Array.isArray(value)) out[key] = value[0] ?? null;
      else if (typeof value === 'string') out[key] = value;
      else out[key] = value != null ? String(value) : null;
    }
    return out;
  }

  private extractFacebookParams(
    query: Record<string, string | null>,
  ): Record<string, string | null> {
    const params: Record<string, string | null> = {};
    for (const key of FACEBOOK_OAUTH_PARAM_KEYS) {
      params[key] = query[key] ?? null;
    }
    return params;
  }

  private buildQueryString(query: Record<string, string | null>): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value != null && value !== '') params.set(key, value);
    }
    return params.toString();
  }

  buildCallbackContext(req: Request): MetaOAuthCallbackContext {
    const protocol = req.protocol || 'https';
    const host = req.get('host') ?? '';
    const originalUrl = req.originalUrl ?? req.url ?? '';
    const proxyOriginalUrl = req.get('x-oauth-original-url')?.trim();
    const query = this.normalizeQuery(
      req.query as Record<string, string | string[] | undefined>,
    );
    if (proxyOriginalUrl) {
      try {
        const parsed = new URL(proxyOriginalUrl);
        for (const [key, value] of parsed.searchParams.entries()) {
          if (!query[key]) query[key] = value;
        }
      } catch {
        // ignore invalid proxy URL
      }
    }
    const queryString = this.buildQueryString(query);
    const fullUrl =
      proxyOriginalUrl?.trim() ||
      (host ? `${protocol}://${host}${originalUrl}` : originalUrl);
    const ip =
      req.get('x-oauth-client-ip')?.trim() ||
      req.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.ip ||
      null;
    const userAgent = req.get('x-oauth-user-agent')?.trim() || req.get('user-agent') || null;

    return {
      originalUrl: proxyOriginalUrl ? new URL(proxyOriginalUrl).pathname + new URL(proxyOriginalUrl).search : originalUrl,
      fullUrl,
      query,
      queryString,
      facebookParams: this.extractFacebookParams(query),
      headers: this.sanitizeHeaders(req.headers),
      cookies: this.parseCookies(req.get('cookie')),
      ip,
      userAgent,
      receivedAt: new Date().toISOString(),
    };
  }

  private async persistLastCallback(
    ctx: MetaOAuthCallbackContext,
    outcome: MetaOAuthLastCallback['outcome'],
    reason: string | null,
  ) {
    const lastCallback: MetaOAuthLastCallback = {
      ...ctx,
      outcome,
      reason,
      parsedJson: {
        facebookParams: ctx.facebookParams,
        allQueryParams: ctx.query,
        queryString: ctx.queryString,
      },
    };
    const oauthCompleted: MetaOAuthCompletedStatus = {
      completed: outcome === 'success',
      reason,
      at: ctx.receivedAt,
    };
    try {
      const row = await this.prisma.metaCenterSetting.findUnique({ where: { id: SETTINGS_ID } });
      const snap =
        row?.diagnosticsSnapshot && typeof row.diagnosticsSnapshot === 'object'
          ? (row.diagnosticsSnapshot as Record<string, unknown>)
          : {};
      await this.prisma.metaCenterSetting.upsert({
        where: { id: SETTINGS_ID },
        create: {
          id: SETTINGS_ID,
          diagnosticsSnapshot: {
            ...snap,
            lastOAuthCallback: lastCallback,
            oauthCompleted,
          } as Prisma.InputJsonValue,
        },
        update: {
          diagnosticsSnapshot: {
            ...snap,
            lastOAuthCallback: lastCallback,
            oauthCompleted,
          } as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      this.logger.warn(
        `lastOAuthCallback persist failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  async getLastOAuthCallback(): Promise<MetaOAuthLastCallback | null> {
    const row = await this.prisma.metaCenterSetting.findUnique({ where: { id: SETTINGS_ID } });
    const snap = row?.diagnosticsSnapshot;
    if (!snap || typeof snap !== 'object') return null;
    const last = (snap as Record<string, unknown>).lastOAuthCallback;
    if (!last || typeof last !== 'object') return null;
    return last as MetaOAuthLastCallback;
  }

  async getOAuthCompletedStatus(): Promise<MetaOAuthCompletedStatus> {
    const row = await this.prisma.metaCenterSetting.findUnique({ where: { id: SETTINGS_ID } });
    const snap = row?.diagnosticsSnapshot;
    if (snap && typeof snap === 'object') {
      const status = (snap as Record<string, unknown>).oauthCompleted;
      if (status && typeof status === 'object') {
        const s = status as Record<string, unknown>;
        return {
          completed: s.completed === true,
          reason: typeof s.reason === 'string' ? s.reason : null,
          at: typeof s.at === 'string' ? s.at : null,
        };
      }
    }
    const connected = Boolean(row?.metaConnectedAt && row.metaUserAccessTokenEncrypted);
    return {
      completed: connected,
      reason: connected ? null : 'Meta účet není připojen',
      at: row?.metaConnectedAt?.toISOString() ?? null,
    };
  }

  async listOAuthDebugLogs(take = 50) {
    const items = await this.prisma.metaCenterApiLog.findMany({
      where: { endpoint: { in: [...META_OAUTH_LOG_PHASES] } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(200, Math.max(1, take)),
    });
    return {
      items: items.map((r) => ({
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        phase: r.endpoint,
        method: r.method,
        request: r.request,
        response: r.response,
        httpStatus: r.httpStatus,
        errorCode: r.errorCode,
        errorMessage: r.errorMessage,
        durationMs: r.durationMs,
      })),
    };
  }

  private resolveFacebookOAuthError(
    facebookParams: Record<string, string | null>,
    query: Record<string, string | null>,
  ): {
    hasError: boolean;
    error: string | null;
    errorReason: string | null;
    errorDescription: string | null;
    displayMessage: string;
  } {
    const error =
      facebookParams.error?.trim() ||
      facebookParams.error_code?.trim() ||
      query.error?.trim() ||
      query.error_code?.trim() ||
      null;
    const errorReason =
      facebookParams.error_reason?.trim() || query.error_reason?.trim() || null;
    const errorDescription =
      facebookParams.error_description?.trim() || query.error_description?.trim() || null;
    const hasError = Boolean(error || errorReason || errorDescription);
    const parts = [errorDescription, errorReason, error].filter(Boolean);
    const displayMessage = parts.length ? parts.join(' — ') : 'oauth_denied';
    return { hasError, error, errorReason, errorDescription, displayMessage };
  }

  private formatMissingCodeReason(ctx: MetaOAuthCallbackContext): string {
    const qs = ctx.queryString ? `?${ctx.queryString}` : '(prázdná query string)';
    const fb = ctx.facebookParams;
    const parts = [
      'Chybí authorization code (code=).',
      `Celá query: ${qs}`,
      fb.state ? `state=${fb.state}` : 'state=chybí',
      fb.granted_scopes ? `granted_scopes=${fb.granted_scopes}` : null,
      fb.denied_scopes ? `denied_scopes=${fb.denied_scopes}` : null,
    ].filter(Boolean);
    return parts.join(' | ');
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

    if (!dryRun) {
      void this.logOAuthPhase({
        phase: 'OAuth Request',
        request: {
          client_id: preview.client_id,
          redirect_uri: preview.redirect_uri,
          scope: preview.scope,
          response_type: preview.response_type,
          state: preview.state,
          facebookOAuthUrl: preview.facebookOAuthUrl,
          adminUserId,
        },
        response: { status: 'redirect_prepared' },
      });
    }

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

  async handleCallbackFromRequest(req: Request): Promise<MetaConnectCallbackResult> {
    const ctx = this.buildCallbackContext(req);
    return this.handleCallbackWithContext(ctx);
  }

  /** @deprecated Použijte handleCallbackFromRequest — zachováno pro zpětnou kompatibilitu. */
  async handleCallback(
    code: string | undefined,
    state: string | undefined,
    oauthError?: string,
    errorReason?: string,
    errorDescription?: string,
  ): Promise<MetaConnectCallbackResult> {
    const query: Record<string, string | null> = {
      code: code ?? null,
      state: state ?? null,
      error: oauthError ?? null,
      error_reason: errorReason ?? null,
      error_description: errorDescription ?? null,
    };
    const ctx: MetaOAuthCallbackContext = {
      originalUrl: '/social/facebook/meta-connect-callback',
      fullUrl: '/social/facebook/meta-connect-callback',
      query,
      queryString: this.buildQueryString(query),
      facebookParams: this.extractFacebookParams(query),
      headers: {},
      cookies: {},
      ip: null,
      userAgent: null,
      receivedAt: new Date().toISOString(),
    };
    return this.handleCallbackWithContext(ctx);
  }

  private async handleCallbackWithContext(
    ctx: MetaOAuthCallbackContext,
  ): Promise<MetaConnectCallbackResult> {
    const adminUrl = this.getAdminUrl();
    const redirectUri = this.resolveRedirectUri();
    const { facebookParams, query } = ctx;
    const code = facebookParams.code?.trim() || query.code?.trim() || '';
    const state = facebookParams.state?.trim() || query.state?.trim() || '';

    this.logger.log(`META_OAUTH_CALLBACK FULL_URL=${ctx.fullUrl}`);
    this.logger.log(`META_OAUTH_CALLBACK originalUrl=${ctx.originalUrl}`);
    this.logger.log(`META_OAUTH_CALLBACK query=${JSON.stringify(ctx.query)}`);
    this.logger.log(`META_OAUTH_CALLBACK headers=${JSON.stringify(ctx.headers)}`);
    this.logger.log(`META_OAUTH_CALLBACK cookies=${JSON.stringify(Object.keys(ctx.cookies))}`);
    this.logger.log(`META_OAUTH_CALLBACK facebookParams=${JSON.stringify(facebookParams)}`);

    await this.logOAuthPhase({
      phase: 'OAuth Callback',
      request: {
        fullUrl: ctx.fullUrl,
        originalUrl: ctx.originalUrl,
        query: ctx.query,
        queryString: ctx.queryString,
        facebookParams,
        headers: ctx.headers,
        cookieKeys: Object.keys(ctx.cookies),
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      },
      response: { receivedAt: ctx.receivedAt },
    });

    const fbError = this.resolveFacebookOAuthError(facebookParams, query);
    if (fbError.hasError) {
      const oauthErrorJson = {
        error: fbError.error,
        error_reason: fbError.errorReason,
        error_description: fbError.errorDescription,
        granted_scopes: facebookParams.granted_scopes,
        denied_scopes: facebookParams.denied_scopes,
        redirect_uri_used: redirectUri,
        state: state || null,
        full_query: ctx.query,
        query_string: ctx.queryString,
      };
      const isRedirectMismatch =
        (fbError.errorReason ?? '').trim() === 'redirect_uri_mismatch' ||
        fbError.displayMessage.toLowerCase().includes('redirect_uri') ||
        fbError.displayMessage.toLowerCase().includes("isn't whitelisted") ||
        fbError.displayMessage.toLowerCase().includes('url je zablokovan') ||
        fbError.displayMessage.toLowerCase().includes('url blocked') ||
        fbError.displayMessage.toLowerCase().includes('blocked');

      await this.logOAuthPhase({
        phase: 'OAuth Error',
        request: oauthErrorJson,
        response: { phase: 'callback_facebook_error' },
        errorCode: fbError.errorReason ?? fbError.error ?? 'oauth_error',
        errorMessage: fbError.displayMessage,
      });
      await this.persistLastCallback(ctx, 'error', fbError.displayMessage);

      const reason = isRedirectMismatch
        ? `${fbError.displayMessage} — použitá redirect URI: ${redirectUri}`
        : fbError.displayMessage.slice(0, 300);
      return {
        ok: false,
        redirectUrl: this.formatOAuthErrorRedirect(reason, redirectUri),
        message: reason,
      };
    }

    if (!code) {
      const reason = this.formatMissingCodeReason(ctx);
      await this.logOAuthPhase({
        phase: 'OAuth Error',
        request: {
          fullUrl: ctx.fullUrl,
          query: ctx.query,
          queryString: ctx.queryString,
          facebookParams,
        },
        response: { phase: 'missing_code' },
        errorCode: 'missing_code',
        errorMessage: reason,
      });
      await this.persistLastCallback(ctx, 'error', reason);
      return {
        ok: false,
        redirectUrl: this.formatOAuthErrorRedirect(reason.slice(0, 300), redirectUri),
        message: reason,
      };
    }

    if (!state.startsWith(META_CENTER_OAUTH_STATE_PREFIX)) {
      const reason = `Neplatný nebo chybějící OAuth state. Query: ?${ctx.queryString || '—'}`;
      await this.logOAuthPhase({
        phase: 'OAuth Error',
        request: { state, query: ctx.query },
        response: { phase: 'missing_state' },
        errorCode: 'missing_state',
        errorMessage: reason,
      });
      await this.persistLastCallback(ctx, 'error', reason);
      return {
        ok: false,
        redirectUrl: this.formatOAuthErrorRedirect('missing_state', redirectUri),
        message: reason,
      };
    }

    const session = await this.prisma.socialFacebookOAuthSession.findUnique({
      where: { id: state },
    });
    if (
      !session?.userId ||
      session.mode !== META_CENTER_OAUTH_MODE ||
      session.expiresAt.getTime() < Date.now()
    ) {
      const reason = 'OAuth session vypršela nebo neexistuje — zkuste připojení znovu.';
      await this.logOAuthPhase({
        phase: 'OAuth Error',
        request: { state, sessionFound: Boolean(session) },
        response: { phase: 'session_expired' },
        errorCode: 'session_expired',
        errorMessage: reason,
      });
      await this.persistLastCallback(ctx, 'error', reason);
      return {
        ok: false,
        redirectUrl: this.formatOAuthErrorRedirect('session_expired', redirectUri),
        message: reason,
      };
    }

    const exchangeStarted = Date.now();
    try {
      await this.logOAuthPhase({
        phase: 'OAuth Exchange',
        request: { state, redirect_uri: redirectUri, codePresent: true },
        response: { status: 'started' },
      });

      const shortToken = await this.exchangeCodeForToken(code);
      const longLived = await this.exchangeForLongLivedToken(shortToken);
      const userToken = longLived.access_token?.trim() || shortToken;
      const expiresIn = longLived.expires_in;
      const tokenExpiresAt =
        expiresIn != null && Number.isFinite(expiresIn)
          ? new Date(Date.now() + expiresIn * 1000)
          : null;

      await this.logOAuthPhase({
        phase: 'OAuth Exchange',
        request: { state, redirect_uri: redirectUri },
        response: {
          status: 'token_received',
          expiresIn: expiresIn ?? null,
        },
        durationMs: Date.now() - exchangeStarted,
      });

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

      await this.logOAuthPhase({
        phase: 'OAuth Success',
        request: { state, userId: session.userId },
        response: {
          businessId: discovered.business?.id ?? null,
          pageId: discovered.page?.id ?? null,
          catalogId: discovered.catalog?.id ?? null,
          pixelId: discovered.pixel?.id ?? null,
          datasetId: discovered.dataset?.id ?? null,
        },
      });
      await this.persistLastCallback(ctx, 'success', null);

      return {
        ok: true,
        redirectUrl: `${adminUrl}?meta=connected`,
        message: 'Meta účet byl úspěšně připojen.',
      };
    } catch (err) {
      await this.cleanupSession(session.userId);
      const reason = err instanceof Error ? err.message : 'oauth_failed';
      await this.logOAuthPhase({
        phase: 'OAuth Error',
        request: { state, userId: session.userId },
        response: { phase: 'exchange_or_discovery_failed' },
        errorCode: isFacebookPageScopeError(reason) ? 'scopes_unavailable' : 'oauth_failed',
        errorMessage: reason,
        durationMs: Date.now() - exchangeStarted,
      });
      await this.persistLastCallback(ctx, 'error', reason);

      if (isFacebookPageScopeError(reason)) {
        return {
          ok: false,
          redirectUrl: `${adminUrl}?meta=error&reason=scopes_unavailable`,
          message: reason,
        };
      }
      return {
        ok: false,
        redirectUrl: this.formatOAuthErrorRedirect(reason.slice(0, 300), redirectUri),
        message: reason,
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
