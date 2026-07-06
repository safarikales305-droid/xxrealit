import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  forwardRef,
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
  META_CENTER_OAUTH_STATE_PREFIX,
  REQUIRED_MARKETING_ADS_SCOPES,
} from './meta-connect.constants';
import {
  META_CENTER_DEFAULT_FLOW,
  META_CENTER_SESSION_MODES,
  META_OAUTH_FLOWS,
  getMetaOAuthFlowDefinition,
  isMetaCenterSessionMode,
  normalizeMetaOAuthFlowKey,
  parseFlowFromOAuthState,
  type MetaOAuthFlowKey,
  type MetaOAuthFlowStatus,
} from './meta-oauth-flows';
import {
  assertOAuthUrlScopes,
  resolveScopesForOAuthFlow,
  type ResolvedOAuthScopes,
} from './meta-oauth-scope-resolver';
import {
  findLocalhostInJson,
  isLocalhostLikeUrl,
  isProductionEnvironment,
} from './meta-oauth-redirect-uri.util';
import { MetaConnectDiscoveryService } from './meta-connect-discovery.service';
import { hasMarketingAdsScopes } from './meta-marketing-token.util';
import { MetaGraphClientService } from './meta-graph-client.service';
import { MetaMarketingDiagnosticsService } from './meta-marketing-diagnostics.service';
import { MetaCenterApiLogService } from './meta-center-api-log.service';
import {
  formatMetaGraphErrorMessage,
  maskAccessToken,
  redactOAuthTokenPayload,
  type MetaGraphErrorBody,
} from './meta-graph-error.util';

const SETTINGS_ID = 'default';

export type MetaOAuthFlowGrant = {
  grantedScopes: string[];
  requestedScopes: string[];
  connectedAt: string;
  businessId?: string | null;
  adAccountId?: string | null;
  adsApiActive?: boolean;
  catalogManagementGranted?: boolean;
  catalogPermissionsStatus?: 'granted' | 'missing' | 'partial' | 'not_required';
};

export type MetaOAuthFlowGrantMap = Partial<Record<string, MetaOAuthFlowGrant>>;

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

type GraphTokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  token_type?: string;
};
type GraphPermissionsResponse = {
  data?: Array<{ permission?: string; status?: string }>;
};
type DebugTokenResponse = {
  data?: { is_valid?: boolean; expires_at?: number; scopes?: string[] };
};

export type MetaOAuthUrlResult =
  | { success: true; url: string; preview: MetaOAuthPreviewDto }
  | { success: false; message: string; scopeWarnings?: string[] };

export const META_MARKETING_APP_NOT_CONFIGURED_MESSAGE =
  'Marketing aplikace není nakonfigurována.';

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
    @Inject(forwardRef(() => MetaMarketingDiagnosticsService))
    private readonly marketingDiagnostics: MetaMarketingDiagnosticsService,
    private readonly apiLog: MetaCenterApiLogService,
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
    const canonicalRedirect = this.resolveRedirectUri();
    const canonicalFullUrl = queryString
      ? `${canonicalRedirect}?${queryString}`
      : canonicalRedirect;
    const ip =
      req.get('x-oauth-client-ip')?.trim() ||
      req.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.ip ||
      null;
    const userAgent = req.get('x-oauth-user-agent')?.trim() || req.get('user-agent') || null;

    return {
      originalUrl: `${new URL(canonicalRedirect).pathname}${queryString ? `?${queryString}` : ''}`,
      fullUrl: canonicalFullUrl,
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

  private sanitizeLastCallback(last: MetaOAuthLastCallback): MetaOAuthLastCallback {
    if (!isLocalhostLikeUrl(last.fullUrl)) return last;
    const canonical = this.resolveRedirectUri();
    const qs = last.queryString ? `?${last.queryString}` : '';
    return {
      ...last,
      fullUrl: `${canonical}${qs}`,
      originalUrl: `${new URL(canonical).pathname}${qs}`,
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
    return this.sanitizeLastCallback(last as MetaOAuthLastCallback);
  }

  async clearOAuthUrlCache(): Promise<{
    ok: boolean;
    cleared: string[];
    redirectUri: string;
  }> {
    const redirectUri = this.resolveRedirectUri();
    const cleared: string[] = ['redirectUri', 'callbackUrl'];
    const row = await this.prisma.metaCenterSetting.findUnique({ where: { id: SETTINGS_ID } });
    const snap =
      row?.diagnosticsSnapshot && typeof row.diagnosticsSnapshot === 'object'
        ? ({ ...(row.diagnosticsSnapshot as Record<string, unknown>) } as Record<string, unknown>)
        : {};

    if (snap.lastOAuthCallback) {
      delete snap.lastOAuthCallback;
      cleared.push('lastOAuthCallback');
    }

    await this.prisma.metaCenterSetting.upsert({
      where: { id: SETTINGS_ID },
      create: {
        id: SETTINGS_ID,
        redirectUri,
        callbackUrl: redirectUri,
        diagnosticsSnapshot: snap as Prisma.InputJsonValue,
      },
      update: {
        redirectUri,
        callbackUrl: redirectUri,
        diagnosticsSnapshot: snap as Prisma.InputJsonValue,
      },
    });

    return { ok: true, cleared, redirectUri };
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
    const productionMode = isProductionEnvironment();
    const canonicalRedirect = this.resolveRedirectUri();
    const mapped = items.map((r) => {
      const localhostHits = findLocalhostInJson({
        request: r.request,
        response: r.response,
      });
      return {
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
        localhostHits,
        hasLocalhost: localhostHits.length > 0,
      };
    });
    const hasLocalhostInLogs = mapped.some((row) => row.hasLocalhost);
    return {
      items: mapped,
      productionMode,
      canonicalRedirectUri: canonicalRedirect,
      localhostDetected: hasLocalhostInLogs,
      localhostWarning:
        productionMode && hasLocalhostInLogs
          ? 'V OAuth logu jsou staré záznamy s localhost — spusťte „Vyčistit OAuth cache“ nebo proveďte nový OAuth pokus.'
          : null,
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

  getOAuthFlowsDiagnostics() {
    return this.buildOAuthFlowsDiagnostics();
  }

  async buildOAuthFlowsDiagnostics() {
    const grants = await this.getOAuthFlowGrants();
    return Object.values(META_OAUTH_FLOWS)
      .filter((flow) => !flow.hiddenInMetaCenterOAuth)
      .map((flow) => {
      const resolved = resolveScopesForOAuthFlow(flow.key);
      const grant = grants[flow.key];
      const grantedSet = new Set(grant?.grantedScopes ?? []);
      const missingGranted = resolved.requestedScopes.filter((scope) => !grantedSet.has(scope));
      let status: MetaOAuthFlowStatus = 'ready';
      if (resolved.approvedScopes.length === 0) {
        status = 'env_missing';
      } else if (
        grant?.connectedAt &&
        resolved.requestedScopes.every((scope) => grantedSet.has(scope))
      ) {
        status = 'connected';
      } else if (grant?.connectedAt && missingGranted.length > 0) {
        status = 'missing_scopes';
      } else if (grant?.connectedAt) {
        status = 'reconnect';
      }
      return {
        key: flow.key,
        label: flow.label,
        description: flow.description,
        requestedScopes: resolved.requestedScopes,
        scopes: resolved.approvedScopes,
        excludedScopes: resolved.excludedScopes,
        warnings: resolved.warnings,
        scopeString: resolved.scope,
        canConnect: resolved.approvedScopes.length > 0,
        usesLoginApp: flow.usesLoginApp,
        usesPagesApp: flow.usesPagesApp,
        usesMarketingApp: flow.usesMarketingApp,
        sessionMode: flow.sessionMode,
        oauthEndpoint: flow.oauthPath,
        envVarKey: flow.envVarKey,
        status,
        grantedScopes: grant?.grantedScopes ?? [],
        missingScopes: missingGranted,
        connectedAt: grant?.connectedAt ?? null,
      };
    });
  }

  private async getOAuthFlowGrants(): Promise<MetaOAuthFlowGrantMap> {
    const row = await this.prisma.metaCenterSetting.findUnique({ where: { id: SETTINGS_ID } });
    const snap = row?.diagnosticsSnapshot;
    if (!snap || typeof snap !== 'object') return {};
    const grants = (snap as Record<string, unknown>).oauthFlowGrants;
    if (!grants || typeof grants !== 'object') return {};
    return grants as MetaOAuthFlowGrantMap;
  }

  private catalogPermissionsStatus(
    grantedScopes: string[],
  ): MetaOAuthFlowGrant['catalogPermissionsStatus'] {
    if (grantedScopes.includes('business_management')) return 'not_required';
    return 'missing';
  }

  private async persistOAuthFlowGrant(
    flow: MetaOAuthFlowKey,
    grantedScopes: string[],
    connectedAt: Date,
    extra?: { businessId?: string | null; adAccountId?: string | null; adsApiActive?: boolean },
  ) {
    const flowKey = normalizeMetaOAuthFlowKey(flow) ?? 'pages';
    const flowDef = getMetaOAuthFlowDefinition(flowKey);
    const row = await this.prisma.metaCenterSetting.findUnique({ where: { id: SETTINGS_ID } });
    const snap =
      row?.diagnosticsSnapshot && typeof row.diagnosticsSnapshot === 'object'
        ? ({ ...(row.diagnosticsSnapshot as Record<string, unknown>) } as Record<string, unknown>)
        : {};
    const grants =
      snap.oauthFlowGrants && typeof snap.oauthFlowGrants === 'object'
        ? ({ ...(snap.oauthFlowGrants as Record<string, unknown>) } as MetaOAuthFlowGrantMap)
        : ({} as MetaOAuthFlowGrantMap);
    const catalogManagementGranted = false;
    grants[flowKey] = {
      grantedScopes,
      requestedScopes: [...flowDef.scopes],
      connectedAt: connectedAt.toISOString(),
      businessId: extra?.businessId ?? grants[flowKey]?.businessId ?? null,
      adAccountId: extra?.adAccountId ?? grants[flowKey]?.adAccountId ?? null,
      adsApiActive: extra?.adsApiActive ?? grants[flowKey]?.adsApiActive,
      catalogManagementGranted,
      catalogPermissionsStatus:
        flowKey === 'catalog'
          ? this.catalogPermissionsStatus(grantedScopes)
          : grants[flowKey]?.catalogPermissionsStatus,
    };
    snap.oauthFlowGrants = grants;
    await this.prisma.metaCenterSetting.upsert({
      where: { id: SETTINGS_ID },
      create: {
        id: SETTINGS_ID,
        diagnosticsSnapshot: snap as Prisma.InputJsonValue,
        businessManagerId: extra?.businessId ?? undefined,
      },
      update: {
        diagnosticsSnapshot: snap as Prisma.InputJsonValue,
        ...(extra?.businessId ? { businessManagerId: extra.businessId } : {}),
      },
    });
  }

  private resolveFlowScopes(flow: MetaOAuthFlowKey): ResolvedOAuthScopes {
    return resolveScopesForOAuthFlow(flow);
  }

  private composeOAuthPreview(input: {
    clientId: string;
    redirectUri: string;
    state: string;
    flow: MetaOAuthFlowKey;
    reauthorize: boolean;
    dryRun: boolean;
    resolvedScopes: ResolvedOAuthScopes;
  }): MetaOAuthPreviewDto {
    const flowDef = getMetaOAuthFlowDefinition(input.flow);
    const scope = input.resolvedScopes.scope;
    assertOAuthUrlScopes(input.flow, scope);
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
      scopesList: [...input.resolvedScopes.approvedScopes],
      requestedScopes: input.resolvedScopes.requestedScopes,
      excludedScopes: input.resolvedScopes.excludedScopes,
      scopeWarnings: input.resolvedScopes.warnings,
      oauthFlow: input.flow,
      oauthFlowLabel: flowDef.label,
      response_type: 'code',
      state: input.state,
      prompt: 'consent',
      auth_type: input.reauthorize ? 'rerequest' : null,
      redirectUriInAllowedConfig,
      allowedRedirectUris,
      facebookLoginSettingsUrl: this.fbConfig.getMetaFacebookLoginSettingsUrl(input.clientId),
      dryRun: input.dryRun,
    };
  }

  /** Náhled OAuth parametrů bez přesměrování (ladění). */
  async buildOAuthPreview(
    adminUserId: string,
    dryRun = true,
    flow: MetaOAuthFlowKey = META_CENTER_DEFAULT_FLOW,
  ): Promise<MetaOAuthPreviewDto> {
    return this.buildOAuthForFlow(adminUserId, flow, dryRun);
  }

  async buildOAuthUrl(
    adminUserId: string,
    flow: MetaOAuthFlowKey,
    dryRun = false,
  ): Promise<MetaOAuthPreviewDto> {
    return this.buildOAuthForFlow(adminUserId, flow, dryRun);
  }

  async buildOAuthUrlSafe(
    adminUserId: string,
    flow: MetaOAuthFlowKey,
    dryRun = false,
  ): Promise<MetaOAuthUrlResult> {
    const flowKey = normalizeMetaOAuthFlowKey(flow) ?? 'pages';
    const flowDef = getMetaOAuthFlowDefinition(flowKey);

    if (flowDef.usesMarketingApp && !this.fbConfig.isMarketingConfigured()) {
      return {
        success: false,
        message: META_MARKETING_APP_NOT_CONFIGURED_MESSAGE,
      };
    }

    try {
      const preview = await this.buildOAuthForFlow(adminUserId, flow, dryRun);
      if (!preview.scope?.trim()) {
        return {
          success: false,
          message: `OAuth URL pro ${flowKey} nebyla vytvořena.`,
          scopeWarnings: preview.scopeWarnings,
        };
      }
      return {
        success: true,
        url: preview.facebookOAuthUrl,
        preview,
      };
    } catch (err) {
      if (flowDef.usesMarketingApp) {
        if (!this.fbConfig.isMarketingConfigured()) {
          return {
            success: false,
            message: META_MARKETING_APP_NOT_CONFIGURED_MESSAGE,
          };
        }
        const validation = this.fbConfig.validateMarketingAppId();
        if (!validation.ok) {
          return { success: false, message: validation.error ?? META_MARKETING_APP_NOT_CONFIGURED_MESSAGE };
        }
      }
      const message =
        err instanceof BadRequestException || err instanceof ServiceUnavailableException
          ? String(err.message)
          : err instanceof Error
            ? err.message
            : `OAuth URL pro ${flowKey} nebyla vytvořena.`;
      return { success: false, message };
    }
  }

  private async buildOAuthForFlow(
    adminUserId: string,
    flow: MetaOAuthFlowKey,
    dryRun: boolean,
  ): Promise<MetaOAuthPreviewDto> {
    const flowKey = normalizeMetaOAuthFlowKey(flow) ?? 'pages';
    const flowDef = getMetaOAuthFlowDefinition(flowKey);

    if (flowDef.usesLoginApp) {
      if (!this.fbConfig.isLoginConfigured()) {
        throw new ServiceUnavailableException(this.fbConfig.configurationErrorMessage());
      }
      this.fbConfig.assertLoginAppIdValid();
    } else if (flowDef.usesMarketingApp) {
      if (!this.fbConfig.isMarketingConfigured()) {
        throw new ServiceUnavailableException(this.fbConfig.marketingConfigurationErrorMessage());
      }
      this.fbConfig.assertMarketingAppIdValid();
    } else {
      this.assertPagesConfigured();
      this.fbConfig.assertPagesAppIdValid();
    }

    const clientId = flowDef.usesLoginApp
      ? this.fbConfig.getLoginAppId()
      : flowDef.usesMarketingApp
        ? this.fbConfig.getMarketingAppId()
        : this.fbConfig.getPagesAppId();
    if (!clientId) {
      throw new ServiceUnavailableException(
        flowDef.usesLoginApp
          ? this.fbConfig.configurationErrorMessage()
          : flowDef.usesMarketingApp
            ? this.fbConfig.marketingConfigurationErrorMessage()
            : this.fbConfig.pagesConfigurationErrorMessage(),
      );
    }

    const resolvedScopes = this.resolveFlowScopes(flowKey);
    if (!dryRun && resolvedScopes.approvedScopes.length === 0) {
      throw new BadRequestException(
        resolvedScopes.warnings.join(' ') ||
          `OAuth flow „${flowDef.label}" nemá žádné schválené scopes.`,
      );
    }
    const redirectUri = this.resolveRedirectUri();
    const reauthorize = dryRun ? false : await this.isFlowConnected(flowKey);
    const state = dryRun
      ? `${META_CENTER_OAUTH_STATE_PREFIX}preview_${flowKey}_${randomBytes(12).toString('hex')}`
      : `${META_CENTER_OAUTH_STATE_PREFIX}${flowKey}_${randomBytes(20).toString('hex')}`;

    if (!dryRun) {
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      await this.cleanupSession(adminUserId);
      if (flowKey === 'marketing') {
        await this.clearMarketingToken('pre_oauth');
      }
      await this.prisma.socialFacebookOAuthSession.create({
        data: {
          id: state,
          userId: adminUserId,
          mode: flowDef.sessionMode,
          userAccessToken: this.crypto.encrypt('pending'),
          expiresAt,
        },
      });
    }

    const preview = this.composeOAuthPreview({
      clientId,
      redirectUri,
      state,
      flow: flowKey,
      reauthorize,
      dryRun,
      resolvedScopes,
    });

    this.logger.log(`META OAuth flow=${flowKey} URL: ${preview.facebookOAuthUrl}`);
    this.logger.log(`META OAuth redirect_uri: ${preview.redirect_uri}`);
    this.logger.log(`META OAuth state: ${preview.state}`);
    this.logger.log(`META OAuth scope: ${preview.scope}`);

    if (!dryRun) {
      void this.logOAuthPhase({
        phase: 'OAuth Request',
        request: {
          oauthFlow: flowKey,
          oauthFlowLabel: flowDef.label,
          client_id: preview.client_id,
          redirect_uri: preview.redirect_uri,
          scope: preview.scope,
          scopesList: preview.scopesList,
          requestedScopes: preview.requestedScopes,
          excludedScopes: preview.excludedScopes,
          scopeWarnings: preview.scopeWarnings,
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

  private sessionModeToFlow(mode: string): MetaOAuthFlowKey {
    const entry = Object.values(META_OAUTH_FLOWS).find((f) => f.sessionMode === mode);
    if (entry) return entry.key;
    if (mode === 'meta_center_connect') return 'pages';
    if (mode === 'meta_center_ads') return 'marketing';
    return META_CENTER_DEFAULT_FLOW;
  }

  private async isFlowConnected(flow: MetaOAuthFlowKey): Promise<boolean> {
    const flowKey = normalizeMetaOAuthFlowKey(flow) ?? 'pages';
    const grants = await this.getOAuthFlowGrants();
    const grant = grants[flowKey];
    if (grant?.connectedAt) return true;
    if (flowKey === 'pages') return this.isAlreadyConnected('meta-center');
    return false;
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

  private async isAlreadyConnected(_adminUserId: string): Promise<boolean> {
    const row = await this.prisma.metaCenterSetting.findUnique({ where: { id: SETTINGS_ID } });
    if (row?.metaConnectedAt && row.metaUserAccessTokenEncrypted) return true;

    const pagesAuth = await this.prisma.facebookPagesUserAuth.findUnique({
      where: { userId: _adminUserId },
    });
    if (pagesAuth?.accessTokenEncrypted) return true;

    await this.autopostSettings.reload();
    return Boolean(this.autopostSettings.resolveFacebookUserAccessToken());
  }

  async isConnectedForReauthorize(adminUserId: string): Promise<boolean> {
    return this.isAlreadyConnected(adminUserId);
  }

  private assertPagesConfigured() {
    if (!this.fbConfig.isPagesConfigured()) {
      throw new ServiceUnavailableException(this.fbConfig.pagesConfigurationErrorMessage());
    }
  }

  private async cleanupSession(userId: string) {
    await this.prisma.socialFacebookOAuthSession.deleteMany({
      where: { userId, mode: { in: [...META_CENTER_SESSION_MODES] } },
    });
  }

  async buildConnectUrl(
    adminUserId: string,
    flow: MetaOAuthFlowKey = META_CENTER_DEFAULT_FLOW,
  ): Promise<string> {
    const preview = await this.buildOAuthUrl(adminUserId, flow, false);
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
      originalUrl: `${new URL(this.resolveRedirectUri()).pathname}${this.buildQueryString(query) ? `?${this.buildQueryString(query)}` : ''}`,
      fullUrl: (() => {
        const redirect = this.resolveRedirectUri();
        const qs = this.buildQueryString(query);
        return qs ? `${redirect}?${qs}` : redirect;
      })(),
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
      !isMetaCenterSessionMode(session.mode) ||
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
    const oauthFlow = parseFlowFromOAuthState(state);
    const flowDef = getMetaOAuthFlowDefinition(oauthFlow);
    try {
      const marketingAppId = flowDef.usesMarketingApp ? this.fbConfig.getMarketingAppId() : null;
      const marketingAppSecretConfigured = flowDef.usesMarketingApp
        ? Boolean(this.fbConfig.getMarketingAppSecret())
        : null;

      await this.logOAuthPhase({
        phase: 'OAuth Exchange',
        request: {
          state,
          redirect_uri: redirectUri,
          codePresent: true,
          oauthFlow,
          sessionMode: session.mode,
          marketingAppId,
          marketingAppSecretConfigured,
          usesMarketingApp: flowDef.usesMarketingApp,
          usesPagesApp: flowDef.usesPagesApp,
          usesLoginApp: flowDef.usesLoginApp,
        },
        response: { status: 'started' },
      });

      await this.persistEnvAppCredentials();

      const grantedFromCallback = (facebookParams.granted_scopes ?? ctx.query.granted_scopes ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      let discovered: Awaited<ReturnType<MetaConnectDiscoveryService['discoverAndPersist']>> | null =
        null;
      let grantedScopes: string[] = [];

      if (oauthFlow === 'marketing') {
        const marketingResult = await this.handleMarketingOAuthCallback({
          code,
          state,
          redirectUri,
          flowDef,
          sessionUserId: session.userId,
          grantedFromCallback,
          exchangeStarted,
        });
        discovered = marketingResult.discovered;
        grantedScopes = marketingResult.grantedScopes;
        await this.marketingDiagnostics.runFullMarketingDiagnostics(session.userId);
      } else {
        const shortTokenResponse = await this.exchangeCodeForToken(code, oauthFlow);
        const shortToken = shortTokenResponse.access_token?.trim();
        if (!shortToken) {
          throw new BadRequestException('Facebook OAuth nevrátil access token.');
        }
        const longLived = await this.exchangeForLongLivedToken(shortToken, oauthFlow);
        const userToken = longLived.access_token?.trim() || shortToken;
        const refreshToken = longLived.refresh_token?.trim() || null;
        const expiresIn = longLived.expires_in ?? shortTokenResponse.expires_in;
        const tokenType = longLived.token_type ?? shortTokenResponse.token_type ?? 'bearer';
        const tokenExpiresAt =
          expiresIn != null && Number.isFinite(expiresIn)
            ? new Date(Date.now() + expiresIn * 1000)
            : null;

        await this.logOAuthPhase({
          phase: 'OAuth Exchange',
          request: { state, redirect_uri: redirectUri, oauthFlow, marketingAppId },
          response: {
            status: 'token_received',
            expiresIn: expiresIn ?? null,
            tokenType,
            hasRefreshToken: Boolean(refreshToken),
            tokenSource: 'oauth_callback',
          },
          durationMs: Date.now() - exchangeStarted,
        });

        const tokenDebug = await this.debugToken(userToken, oauthFlow);
        grantedScopes =
          tokenDebug.scopes.length > 0 ? tokenDebug.scopes : grantedFromCallback;

        if (oauthFlow === 'login') {
          await this.saveUserToken(userToken, tokenExpiresAt, session.userId);
        } else {
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
          discovered = await this.discovery.discoverAndPersist(userToken);
        }
      }

      await this.persistOAuthFlowGrant(
        oauthFlow,
        grantedScopes,
        new Date(),
        {
          businessId: discovered?.business?.id ?? null,
          adAccountId: discovered?.adAccount?.id ?? null,
          adsApiActive:
            oauthFlow === 'marketing' ? hasMarketingAdsScopes(grantedScopes) : undefined,
        },
      );
      await this.cleanupSession(session.userId);

      this.logger.log(
        `[meta-connect] completed flow=${oauthFlow} userId=${session.userId} business=${discovered?.business?.id ?? 'none'}`,
      );

      await this.logOAuthPhase({
        phase: 'OAuth Success',
        request: { state, userId: session.userId, oauthFlow, sessionMode: session.mode },
        response: {
          oauthFlowLabel: flowDef.label,
          scopesRequested: [...flowDef.scopes],
          grantedScopes,
          businessId: discovered?.business?.id ?? null,
          pageId: discovered?.page?.id ?? null,
          catalogId: discovered?.catalog?.id ?? null,
          pixelId: discovered?.pixel?.id ?? null,
          datasetId: discovered?.dataset?.id ?? null,
        },
      });
      await this.persistLastCallback(ctx, 'success', null);

      return {
        ok: true,
        redirectUrl: `${adminUrl}?meta=connected&flow=${oauthFlow}`,
        message: `${flowDef.label}: Meta oprávnění byla úspěšně připojena.`,
      };
    } catch (err) {
      await this.cleanupSession(session.userId);
      const reason = err instanceof Error ? err.message : 'oauth_failed';
      const scopeError =
        isFacebookPageScopeError(reason) ||
        reason.includes('ads_management') ||
        reason.includes('ads_read') ||
        reason.includes('povinná oprávnění');
      if (oauthFlow === 'marketing') {
        await this.apiLog.logMarketingOAuthStep({
          step: 'callback_failed',
          request: { state, userId: session.userId, oauthFlow },
          response: {
            error: reason,
            stack: err instanceof Error ? err.stack : null,
          },
          errorCode: scopeError ? 'scopes_unavailable' : 'oauth_failed',
          errorMessage: reason,
          durationMs: Date.now() - exchangeStarted,
        });
      }
      await this.logOAuthPhase({
        phase: 'OAuth Error',
        request: { state, userId: session.userId, oauthFlow },
        response: { phase: 'exchange_or_discovery_failed' },
        errorCode: scopeError ? 'scopes_unavailable' : 'oauth_failed',
        errorMessage: reason,
        durationMs: Date.now() - exchangeStarted,
      });
      await this.persistLastCallback(ctx, 'error', reason);

      if (scopeError) {
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
    const marketingAppId = this.fbConfig.getMarketingAppId();
    const marketingSecret = this.fbConfig.getMarketingAppSecret();
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
        facebookMarketingAppId: marketingAppId,
        facebookMarketingSecret: marketingSecret,
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
        facebookMarketingAppId: marketingAppId ?? undefined,
        facebookMarketingSecret: marketingSecret ?? undefined,
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

  async resolveMarketingAccessToken(): Promise<string> {
    const row = await this.prisma.metaCenterSetting.findUnique({ where: { id: SETTINGS_ID } });
    if (!row?.marketingAccessTokenEncrypted) {
      throw new BadRequestException(
        'Reklamní účet není připojen. Klikněte na „Připojit reklamní účet“ (Marketing OAuth).',
      );
    }
    if (row.marketingTokenExpiresAt && row.marketingTokenExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException(
        'Meta Marketing token expiroval — znovu připojte reklamní účet.',
      );
    }
    const granted = this.parseGrantedScopes(row.marketingGrantedScopes);
    if (!hasMarketingAdsScopes(granted)) {
      throw new BadRequestException(
        'Marketing token nemá ads_management / ads_read — znovu připojte reklamní účet.',
      );
    }
    return this.crypto.decrypt(row.marketingAccessTokenEncrypted);
  }

  async tryResolveMarketingAccessToken(): Promise<string | null> {
    try {
      return await this.resolveMarketingAccessToken();
    } catch {
      return null;
    }
  }

  /** Pouze Marketing App token — nikdy Pages / Login token. */
  async resolveAdsAccessToken(): Promise<string> {
    return this.resolveMarketingAccessToken();
  }

  private parseGrantedScopes(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
  }

  async clearMarketingToken(reason: string) {
    await this.prisma.metaCenterSetting.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID },
      update: {
        marketingAccessTokenEncrypted: null,
        marketingTokenExpiresAt: null,
        marketingTokenExpiresIn: null,
        marketingTokenType: null,
        marketingGrantedScopes: Prisma.JsonNull,
        marketingRefreshTokenEncrypted: null,
      },
    });
    this.logger.log(`[meta-marketing-oauth] cleared marketing token (reason=${reason})`);
  }

  private async fetchUserPermissions(accessToken: string, flow: MetaOAuthFlowKey) {
    const res = await this.graph.get<GraphPermissionsResponse>('/me/permissions', accessToken, {
      fields: 'permission,status',
    });
    const all = res.ok ? res.data.data ?? [] : [];
    const granted = all
      .filter((row) => row.status === 'granted' && row.permission?.trim())
      .map((row) => row.permission!.trim());

    this.logger.log(
      `[meta-marketing-oauth] GET /me/permissions granted=[${granted.join(', ')}] ` +
        `all=${JSON.stringify(all)}`,
    );
    await this.logOAuthPhase({
      phase: 'OAuth Exchange',
      request: { endpoint: '/me/permissions', oauthFlow: flow },
      response: {
        ok: res.ok,
        granted,
        permissions: all,
        graphError: res.ok ? null : res.data,
      },
      errorCode: res.ok ? null : res.errorCode,
      errorMessage: res.ok ? null : res.errorMessage,
      httpStatus: res.httpStatus,
    });

    return { granted, all, ok: res.ok, errorMessage: res.ok ? null : res.errorMessage };
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

  async debugToken(accessToken: string, flow: MetaOAuthFlowKey = 'pages') {
    const creds = this.resolveOAuthAppCredentials(flow);
    if (!creds) {
      return { is_valid: true, expires_at: 0, scopes: [] as string[] };
    }
    const appToken = `${creds.appId}|${creds.appSecret}`;
    const res = await this.facebookPage.fetchGraphJson<DebugTokenResponse>(
      `${this.graph.legacyGraphApi()}/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(appToken)}`,
    );
    return {
      is_valid: res.data?.is_valid !== false,
      expires_at: res.data?.expires_at ?? 0,
      scopes: res.data?.scopes ?? [],
    };
  }

  private resolveOAuthAppCredentials(
    flow: MetaOAuthFlowKey,
  ): { appId: string; appSecret: string } | null {
    const flowKey = normalizeMetaOAuthFlowKey(flow) ?? 'pages';
    const flowDef = getMetaOAuthFlowDefinition(flowKey);
    if (flowDef.usesLoginApp) {
      const appId = this.fbConfig.getLoginAppId();
      const appSecret = this.fbConfig.getLoginAppSecret();
      if (!appId || !appSecret) return null;
      return { appId, appSecret };
    }
    if (flowDef.usesMarketingApp) {
      const appId = this.fbConfig.getMarketingAppId();
      const appSecret = this.fbConfig.getMarketingAppSecret();
      if (!appId || !appSecret) return null;
      return { appId, appSecret };
    }
    const appId = this.fbConfig.getPagesAppId();
    const appSecret = this.fbConfig.getPagesAppSecret();
    if (!appId || !appSecret) return null;
    return { appId, appSecret };
  }

  private async exchangeCodeForToken(
    code: string,
    flow: MetaOAuthFlowKey = 'pages',
  ): Promise<GraphTokenResponse> {
    const creds = this.resolveOAuthAppCredentials(flow);
    if (!creds) {
      throw new BadRequestException('Facebook OAuth aplikace není nakonfigurována.');
    }
    const redirectUri = encodeURIComponent(this.resolveRedirectUri());
    const url =
      `${this.graph.legacyGraphApi()}/oauth/access_token?` +
      `client_id=${encodeURIComponent(creds.appId)}` +
      `&redirect_uri=${redirectUri}` +
      `&client_secret=${encodeURIComponent(creds.appSecret)}` +
      `&code=${encodeURIComponent(code)}`;
    const data = await this.facebookPage.fetchGraphJson<GraphTokenResponse>(url);
    if (!data.access_token?.trim()) {
      throw new BadRequestException('Facebook OAuth nevrátil access token.');
    }
    return data;
  }

  private async exchangeForLongLivedToken(
    shortToken: string,
    flow: MetaOAuthFlowKey = 'pages',
  ): Promise<GraphTokenResponse> {
    const creds = this.resolveOAuthAppCredentials(flow);
    if (!creds) {
      throw new BadRequestException('Facebook OAuth aplikace není nakonfigurována.');
    }
    const url =
      `${this.graph.legacyGraphApi()}/oauth/access_token?` +
      `grant_type=fb_exchange_token&client_id=${encodeURIComponent(creds.appId)}` +
      `&client_secret=${encodeURIComponent(creds.appSecret)}` +
      `&fb_exchange_token=${encodeURIComponent(shortToken)}`;
    return this.facebookPage.fetchGraphJson<GraphTokenResponse>(url);
  }

  private mergeGrantedScopes(...scopeLists: readonly (readonly string[])[]): string[] {
    const set = new Set<string>();
    for (const list of scopeLists) {
      for (const scope of list) {
        const trimmed = scope.trim();
        if (trimmed) set.add(trimmed);
      }
    }
    return [...set];
  }

  private async fetchMarketingOAuthJson<T extends Record<string, unknown>>(
    url: string,
    step: string,
    request: Record<string, unknown>,
    options?: { requireAccessToken?: boolean },
  ): Promise<{ data: T; httpStatus: number }> {
    const started = Date.now();
    const res = await fetch(url);
    const raw = (await res.json().catch(() => ({}))) as T & MetaGraphErrorBody;
    const hasGraphError = !res.ok || Boolean(raw.error);

    await this.apiLog.logMarketingOAuthStep({
      step,
      request,
      response: hasGraphError ? raw : redactOAuthTokenPayload(raw),
      httpStatus: res.status,
      durationMs: Date.now() - started,
    });

    if (hasGraphError) {
      throw new BadRequestException(formatMetaGraphErrorMessage(raw, res.status));
    }
    if (options?.requireAccessToken && !String(raw.access_token ?? '').trim()) {
      throw new BadRequestException('Facebook OAuth nevrátil access token.');
    }
    return { data: raw, httpStatus: res.status };
  }

  private async handleMarketingOAuthCallback(input: {
    code: string;
    state: string;
    redirectUri: string;
    flowDef: ReturnType<typeof getMetaOAuthFlowDefinition>;
    sessionUserId: string;
    grantedFromCallback: string[];
    exchangeStarted: number;
  }): Promise<{
    discovered: Awaited<ReturnType<MetaConnectDiscoveryService['discoverMarketingAndPersist']>>;
    grantedScopes: string[];
  }> {
    const appId = this.fbConfig.getMarketingAppId();
    const appSecret = this.fbConfig.getMarketingAppSecret();
    if (!appId || !appSecret) {
      throw new BadRequestException('Marketing App není nakonfigurována v ENV.');
    }

    await this.apiLog.logMarketingOAuthStep({
      step: '1_callback_params',
      request: {
        code: input.code,
        state: input.state,
        flow: 'marketing',
        app_id: appId,
        redirect_uri: input.redirectUri,
        granted_scopes_from_callback: input.grantedFromCallback,
      },
    });

    const redirectEnc = encodeURIComponent(input.redirectUri);
    const shortUrl =
      `${this.graph.legacyGraphApi()}/oauth/access_token?` +
      `client_id=${encodeURIComponent(appId)}` +
      `&redirect_uri=${redirectEnc}` +
      `&client_secret=${encodeURIComponent(appSecret)}` +
      `&code=${encodeURIComponent(input.code)}`;
    const shortTokenResponse = await this.fetchMarketingOAuthJson<GraphTokenResponse>(
      shortUrl,
      '2_exchange_code',
      {
        client_id: appId,
        redirect_uri: input.redirectUri,
        code: input.code,
      },
      { requireAccessToken: true },
    );
    const shortToken = shortTokenResponse.data.access_token!.trim();

    const longUrl =
      `${this.graph.legacyGraphApi()}/oauth/access_token?` +
      `grant_type=fb_exchange_token&client_id=${encodeURIComponent(appId)}` +
      `&client_secret=${encodeURIComponent(appSecret)}` +
      `&fb_exchange_token=${encodeURIComponent(shortToken)}`;
    const longLived = await this.fetchMarketingOAuthJson<GraphTokenResponse>(
      longUrl,
      '3_exchange_long_lived',
      { client_id: appId, grant_type: 'fb_exchange_token' },
    );

    const userToken = longLived.data.access_token?.trim() || shortToken;
    const refreshToken = longLived.data.refresh_token?.trim() || null;
    const expiresIn = longLived.data.expires_in ?? shortTokenResponse.data.expires_in;
    const tokenType = longLived.data.token_type ?? shortTokenResponse.data.token_type ?? 'bearer';
    const tokenExpiresAt =
      expiresIn != null && Number.isFinite(expiresIn)
        ? new Date(Date.now() + expiresIn * 1000)
        : null;

    await this.logOAuthPhase({
      phase: 'OAuth Exchange',
      request: {
        state: input.state,
        redirect_uri: input.redirectUri,
        oauthFlow: 'marketing',
        marketingAppId: appId,
      },
      response: {
        status: 'token_received',
        expiresIn: expiresIn ?? null,
        tokenType,
        hasRefreshToken: Boolean(refreshToken),
        tokenSource: 'marketing_oauth_callback',
        accessToken: maskAccessToken(userToken),
      },
      durationMs: Date.now() - input.exchangeStarted,
    });

    let tokenDebug = { is_valid: true, expires_at: 0, scopes: [] as string[] };
    try {
      tokenDebug = await this.debugTokenMarketing(userToken, appId, appSecret);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      await this.apiLog.logMarketingOAuthStep({
        step: 'debug_token_failed',
        response: { error: reason },
        errorMessage: reason,
      });
    }

    const permissions = await this.fetchUserPermissions(userToken, 'marketing');
    await this.apiLog.logMarketingOAuthStep({
      step: 'me_permissions',
      request: { endpoint: '/me/permissions' },
      response: {
        ok: permissions.ok,
        granted: permissions.granted,
        permissions: permissions.all,
      },
      errorMessage: permissions.ok ? null : permissions.errorMessage,
    });

    const adAccountsRes = await this.graph.get<
      { data?: Array<{ id?: string; name?: string; account_id?: string; business?: { id?: string } }> }
    >('/me/adaccounts', userToken, {
      fields: 'id,name,account_id,business',
      limit: '25',
    });
    await this.apiLog.logMarketingOAuthStep({
      step: '4_me_adaccounts',
      request: { endpoint: '/me/adaccounts', fields: 'id,name,account_id,business', limit: '25' },
      response: adAccountsRes.ok ? adAccountsRes.data : adAccountsRes.data,
      httpStatus: adAccountsRes.httpStatus,
      errorCode: adAccountsRes.ok ? null : adAccountsRes.errorCode,
      errorMessage: adAccountsRes.ok ? null : adAccountsRes.errorMessage,
    });

    let grantedScopes = this.mergeGrantedScopes(
      input.grantedFromCallback,
      tokenDebug.scopes,
      permissions.granted,
      input.flowDef.scopes,
    );

    const adAccountCount = adAccountsRes.ok ? adAccountsRes.data.data?.length ?? 0 : 0;
    if (!hasMarketingAdsScopes(grantedScopes)) {
      if (adAccountsRes.ok && adAccountCount > 0) {
        grantedScopes = this.mergeGrantedScopes(
          grantedScopes,
          REQUIRED_MARKETING_ADS_SCOPES,
          input.flowDef.scopes,
        );
        await this.apiLog.logMarketingOAuthStep({
          step: 'scopes_inferred_from_adaccounts',
          response: { grantedScopes, adAccountCount },
        });
      } else if (
        hasMarketingAdsScopes(
          this.mergeGrantedScopes(input.grantedFromCallback, input.flowDef.scopes),
        )
      ) {
        grantedScopes = this.mergeGrantedScopes(
          grantedScopes,
          input.grantedFromCallback,
          input.flowDef.scopes,
        );
      } else {
        const missingAdsScopes = REQUIRED_MARKETING_ADS_SCOPES.filter(
          (scope) => !grantedScopes.includes(scope),
        );
        await this.clearMarketingToken('missing_ads_scopes');
        const reason =
          `Token neobsahuje povinná oprávnění: ${missingAdsScopes.join(', ')}. ` +
          `Granted: ${grantedScopes.join(', ') || '—'}. ` +
          `/me/adaccounts: ${adAccountsRes.ok ? `${adAccountCount} účtů` : adAccountsRes.errorMessage}`;
        await this.apiLog.logMarketingOAuthStep({
          step: 'missing_ads_scopes',
          response: {
            grantedScopes,
            missingAdsScopes,
            adAccountsOk: adAccountsRes.ok,
            adAccountCount,
            adAccountsError: adAccountsRes.ok ? null : adAccountsRes.data,
          },
          errorCode: 'missing_ads_scopes',
          errorMessage: reason,
        });
        await this.logOAuthPhase({
          phase: 'OAuth Error',
          request: { oauthFlow: 'marketing', marketingAppId: appId },
          response: { phase: 'missing_ads_scopes', grantedScopes, missingAdsScopes },
          errorCode: 'missing_ads_scopes',
          errorMessage: reason,
        });
        throw new BadRequestException(reason);
      }
    }

    const discovered = await this.discovery.discoverMarketingAndPersist(userToken, {
      refreshToken,
      tokenExpiresAt,
      expiresIn: expiresIn ?? null,
      tokenType,
      grantedScopes,
      marketingAppId: appId,
      tokenSource: 'marketing_oauth_callback',
    });

    const adAccountId = discovered.adAccount?.id
      ? discovered.adAccount.id.startsWith('act_')
        ? discovered.adAccount.id
        : `act_${discovered.adAccount.id}`
      : null;

    await this.apiLog.logMarketingOAuthStep({
      step: '7_persisted',
      response: {
        adAccountId,
        businessId: discovered.business?.id ?? null,
        accessToken: maskAccessToken(userToken),
        refreshToken: refreshToken ? maskAccessToken(refreshToken) : null,
        grantedScopes,
        adsApiConnected: hasMarketingAdsScopes(grantedScopes),
        marketingOAuthConnected: true,
      },
    });

    this.logger.log(
      `[meta-marketing-oauth] connected Marketing App ID=${appId} ` +
        `Token Source=marketing_oauth_callback ` +
        `Granted Scopes=${grantedScopes.join(',')} ` +
        `Business ID=${discovered.business?.id ?? '—'} ` +
        `Ad Account ID=${adAccountId ?? '—'}`,
    );

    return { discovered, grantedScopes };
  }

  private async debugTokenMarketing(
    accessToken: string,
    appId: string,
    appSecret: string,
  ): Promise<{ is_valid: boolean; expires_at: number; scopes: string[] }> {
    const appToken = `${appId}|${appSecret}`;
    const url =
      `${this.graph.legacyGraphApi()}/debug_token?` +
      `input_token=${encodeURIComponent(accessToken)}` +
      `&access_token=${encodeURIComponent(appToken)}`;
    const started = Date.now();
    const res = await fetch(url);
    const data = (await res.json().catch(() => ({}))) as DebugTokenResponse & MetaGraphErrorBody;
    const hasGraphError = !res.ok || Boolean(data.error);

    await this.apiLog.logMarketingOAuthStep({
      step: 'debug_token',
      request: { endpoint: '/debug_token', app_id: appId },
      response: data,
      httpStatus: res.status,
      durationMs: Date.now() - started,
    });

    if (hasGraphError) {
      throw new BadRequestException(formatMetaGraphErrorMessage(data, res.status));
    }
    return {
      is_valid: data.data?.is_valid !== false,
      expires_at: data.data?.expires_at ?? 0,
      scopes: data.data?.scopes ?? [],
    };
  }

  toInputJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
