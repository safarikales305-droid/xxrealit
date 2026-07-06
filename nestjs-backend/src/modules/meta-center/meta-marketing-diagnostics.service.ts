import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { FacebookConfigService } from '../social/facebook/facebook-config.service';
import { MetaConnectOAuthService } from './meta-connect-oauth.service';
import { MetaGraphClientService, type MetaGraphResult } from './meta-graph-client.service';
import { resolveMetaCenterIds } from './meta-center-env.util';
import {
  extractMetaGraphErrorFields,
  formatMetaGraphErrorMessage,
  maskAccessToken,
} from './meta-graph-error.util';
import { resolveScopesForOAuthFlow } from './meta-oauth-scope-resolver';
import {
  isMarketingAdsTokenActive,
  parseMarketingGrantedScopes,
} from './meta-marketing-token.util';
import { REQUIRED_MARKETING_ADS_SCOPES } from './meta-connect.constants';

const SETTINGS_ID = 'default';
const LOG_ENDPOINT = 'MARKETING APP';

export type MarketingAppSnapshot = {
  section: 'MARKETING APP';
  appId: string | null;
  loginAppId: string | null;
  pagesAppId: string | null;
  usesMarketingAppNotLogin: boolean;
  redirectUri: string | null;
  redirectUriInAllowedConfig: boolean;
  scopesRequested: string[];
  scopesApproved: string[];
  scopesEnvVar: string;
  oauthUrl: string | null;
  environmentVariables: Record<string, string | boolean | null>;
  accessTokenMasked: string;
  businessId: string | null;
  adAccountId: string | null;
  marketingTokenActive: boolean;
  grantedScopes: string[];
  checks: Array<{ ok: boolean; label: string; detail: string }>;
};

@Injectable()
export class MetaMarketingDiagnosticsService {
  private readonly logger = new Logger(MetaMarketingDiagnosticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fbConfig: FacebookConfigService,
    @Inject(forwardRef(() => MetaConnectOAuthService))
    private readonly oauth: MetaConnectOAuthService,
    private readonly graph: MetaGraphClientService,
  ) {}

  async buildAppSnapshot(adminUserId?: string): Promise<MarketingAppSnapshot> {
    const row = await this.prisma.metaCenterSetting.findUnique({ where: { id: SETTINGS_ID } });
    const ids = resolveMetaCenterIds(row ?? ({} as never));
    const marketingAppId = this.fbConfig.getMarketingAppId();
    const loginAppId = this.fbConfig.getLoginAppId();
    const pagesAppId = this.fbConfig.getPagesAppId();
    const redirectUri = this.oauth.resolveRedirectUri();
    const redirectDiag = this.fbConfig.getMetaOAuthRedirectDiagnostics();
    const scopeResolved = resolveScopesForOAuthFlow('marketing');

    let oauthUrl: string | null = null;
    if (adminUserId) {
      const preview = await this.oauth.buildOAuthUrlSafe(adminUserId, 'marketing', true);
      oauthUrl = preview.success ? preview.url : null;
    }

    const token = await this.oauth.tryResolveMarketingAccessToken().catch(() => null);
    const grantedScopes = parseMarketingGrantedScopes(row?.marketingGrantedScopes);

    const envSnapshot: Record<string, string | boolean | null> = {
      FACEBOOK_MARKETING_APP_ID: this.envPresent('FACEBOOK_MARKETING_APP_ID'),
      FACEBOOK_MARKETING_APP_SECRET: this.envPresent('FACEBOOK_MARKETING_APP_SECRET'),
      META_MARKETING_APP_ID: this.envPresent('META_MARKETING_APP_ID'),
      META_MARKETING_APP_SECRET: this.envPresent('META_MARKETING_APP_SECRET'),
      resolvedMarketingAppId: marketingAppId,
      FACEBOOK_LOGIN_APP_ID: loginAppId,
      FACEBOOK_PAGES_APP_ID: pagesAppId,
      META_APPROVED_OAUTH_SCOPES_MARKETING: process.env.META_APPROVED_OAUTH_SCOPES_MARKETING ?? null,
      META_REDIRECT_URI: process.env.META_REDIRECT_URI ?? null,
      BACKEND_URL: process.env.BACKEND_URL ?? null,
      marketingConfigured: this.fbConfig.isMarketingConfigured(),
    };

    const requiredScopes = ['ads_management', 'ads_read', 'business_management'];
    const checks: MarketingAppSnapshot['checks'] = [
      {
        ok: Boolean(marketingAppId),
        label: 'Marketing App ID v ENV',
        detail: marketingAppId ?? 'chybí FACEBOOK_MARKETING_APP_ID / META_MARKETING_APP_ID',
      },
      {
        ok: Boolean(this.fbConfig.getMarketingAppSecret()),
        label: 'Marketing App Secret v ENV',
        detail: this.fbConfig.getMarketingAppSecret() ? 'nastaven' : 'chybí',
      },
      {
        ok: Boolean(marketingAppId && loginAppId && marketingAppId !== loginAppId),
        label: 'Marketing App ≠ Login App',
        detail: `marketing=${marketingAppId ?? '—'} login=${loginAppId ?? '—'}`,
      },
      {
        ok: Boolean(oauthUrl?.includes(String(marketingAppId))),
        label: 'OAuth URL používá Marketing App ID',
        detail: oauthUrl ?? 'OAuth URL nebyla vytvořena',
      },
      {
        ok: redirectDiag.redirectUriInAllowedConfig !== false,
        label: 'redirect_uri v povolených URI',
        detail: redirectUri ?? '—',
      },
      {
        ok: requiredScopes.every((s) => scopeResolved.approvedScopes.includes(s)),
        label: 'Scopes ads_management, ads_read, business_management',
        detail: scopeResolved.approvedScopes.join(',') || '(prázdné)',
      },
      {
        ok: isMarketingAdsTokenActive(row ?? {}),
        label: 'Marketing token aktivní',
        detail: token ? maskAccessToken(token) : 'token chybí',
      },
      {
        ok: REQUIRED_MARKETING_ADS_SCOPES.every((s) => grantedScopes.includes(s)),
        label: 'Token má ads_management + ads_read',
        detail: grantedScopes.join(',') || '—',
      },
    ];

    return {
      section: 'MARKETING APP',
      appId: marketingAppId,
      loginAppId,
      pagesAppId,
      usesMarketingAppNotLogin: Boolean(
        marketingAppId && loginAppId && marketingAppId !== loginAppId,
      ),
      redirectUri,
      redirectUriInAllowedConfig: redirectDiag.redirectUriInAllowedConfig !== false,
      scopesRequested: scopeResolved.requestedScopes,
      scopesApproved: scopeResolved.approvedScopes,
      scopesEnvVar: scopeResolved.envVarKey,
      oauthUrl,
      environmentVariables: envSnapshot,
      accessTokenMasked: maskAccessToken(token),
      businessId: ids.businessId ?? row?.businessManagerId ?? null,
      adAccountId: ids.adAccountId ?? row?.adAccountId ?? null,
      marketingTokenActive: isMarketingAdsTokenActive(row ?? {}),
      grantedScopes,
      checks,
    };
  }

  async logMarketingAppSnapshot(
    adminUserId: string | undefined,
    trigger: string,
  ): Promise<MarketingAppSnapshot> {
    const snapshot = await this.buildAppSnapshot(adminUserId);
    await this.writeLog({
      endpoint: LOG_ENDPOINT,
      method: 'DIAGNOSTICS',
      request: { trigger, section: 'MARKETING APP' },
      response: snapshot,
      httpStatus: snapshot.checks.every((c) => c.ok) ? 200 : 424,
      errorCode: snapshot.checks.every((c) => c.ok) ? null : 'marketing_checks_failed',
      errorMessage: snapshot.checks
        .filter((c) => !c.ok)
        .map((c) => `${c.label}: ${c.detail}`)
        .join(' | ') || null,
    });
    this.logger.log(
      `[marketing-diagnostics] ${trigger} appId=${snapshot.appId ?? '—'} checks=${snapshot.checks.filter((c) => c.ok).length}/${snapshot.checks.length}`,
    );
    return snapshot;
  }

  async graphGetWithMarketingLog<T>(
    adminUserId: string | undefined,
    trigger: string,
    path: string,
    token: string,
    query?: Record<string, string>,
  ): Promise<MetaGraphResult<T>> {
    const snapshot = await this.buildAppSnapshot(adminUserId);
    const base = this.graph.graphBase();
    const qs = new URLSearchParams({ ...(query ?? {}), access_token: '[REDACTED]' });
    const httpRequest = `GET ${base}${path.startsWith('/') ? path : `/${path}`}?${qs.toString()}`;

    const started = Date.now();
    const result = await this.graph.get<T>(path, token, query);
    const durationMs = Date.now() - started;
    const errorFields = result.ok ? null : extractMetaGraphErrorFields(result.data);

    await this.writeLog({
      endpoint: `MARKETING Graph: ${path.split('?')[0]}`,
      method: 'GET',
      request: {
        trigger,
        marketingApp: snapshot,
        httpRequest,
        graphPath: path,
        query,
        accessTokenMasked: maskAccessToken(token),
        businessId: snapshot.businessId,
        adAccountId: snapshot.adAccountId,
      },
      response: {
        ok: result.ok,
        httpStatus: result.httpStatus,
        body: result.ok ? result.data : result.data,
        metaError: errorFields,
      },
      httpStatus: result.httpStatus,
      errorCode: errorFields?.code ?? (result.ok ? null : 'graph_error'),
      errorMessage: result.ok
        ? null
        : formatMetaGraphErrorMessage(result.data, result.httpStatus),
      durationMs,
    });

    return result;
  }

  async runFullMarketingDiagnostics(adminUserId: string) {
    const snapshot = await this.logMarketingAppSnapshot(adminUserId, 'runFullMarketingDiagnostics');
    const probes: Array<Record<string, unknown>> = [];

    const token = await this.oauth.tryResolveMarketingAccessToken();
    if (!token) {
      await this.writeLog({
        endpoint: 'MARKETING APP',
        method: 'DIAGNOSTICS',
        request: { phase: 'graph_probes_skipped' },
        response: {
          reason: 'Marketing access token není k dispozici — dokončete Marketing OAuth.',
          snapshot,
        },
        httpStatus: 424,
        errorCode: 'no_marketing_token',
        errorMessage: 'Marketing access token není k dispozici.',
      });
      return { ok: false, snapshot, probes, message: 'Token chybí — Graph API sondy přeskočeny.' };
    }

    const paths: Array<{ path: string; query?: Record<string, string>; label: string }> = [
      { path: '/me', query: { fields: 'id,name' }, label: 'me' },
      { path: '/me/permissions', label: 'permissions' },
      { path: '/me/businesses', query: { fields: 'id,name', limit: '10' }, label: 'businesses' },
      { path: '/me/adaccounts', query: { fields: 'id,name,account_id', limit: '25' }, label: 'adaccounts' },
    ];

    const businessId = snapshot.businessId;
    if (businessId) {
      paths.push({
        path: `/${businessId}/owned_ad_accounts`,
        query: { fields: 'id,name,account_id,currency', limit: '25' },
        label: 'owned_ad_accounts',
      });
    }

    const adAccountId = snapshot.adAccountId?.replace(/^act_/, '');
    if (adAccountId) {
      paths.push({
        path: `/act_${adAccountId}`,
        query: { fields: 'id,name,currency,timezone_name,account_status' },
        label: 'ad_account',
      });
    }

    let allOk = true;
    for (const probe of paths) {
      const res = await this.graphGetWithMarketingLog(
        adminUserId,
        `runFullMarketingDiagnostics:${probe.label}`,
        probe.path,
        token,
        probe.query,
      );
      probes.push({
        label: probe.label,
        path: probe.path,
        ok: res.ok,
        httpStatus: res.httpStatus,
        errorMessage: res.ok ? null : formatMetaGraphErrorMessage(res.data, res.httpStatus),
        response: res.ok ? res.data : res.data,
      });
      if (!res.ok) allOk = false;
    }

    return {
      ok: allOk && snapshot.checks.every((c) => c.ok),
      snapshot,
      probes,
      message: allOk
        ? 'Marketing diagnostika dokončena — viz Meta API logy.'
        : 'Marketing diagnostika našla problémy — viz Meta API logy (plný JSON).',
    };
  }

  private envPresent(key: string): string {
    const value = process.env[key]?.trim();
    return value ? 'set' : 'missing';
  }

  private async writeLog(input: {
    endpoint: string;
    method: string;
    request?: unknown;
    response?: unknown;
    httpStatus?: number | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    durationMs?: number | null;
  }) {
    try {
      await this.prisma.metaCenterApiLog.create({
        data: {
          endpoint: input.endpoint,
          method: input.method,
          request: this.toJson(input.request),
          response: this.toJson(input.response),
          httpStatus: input.httpStatus ?? null,
          errorCode: input.errorCode ?? null,
          errorMessage: input.errorMessage ?? null,
          durationMs: input.durationMs ?? null,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Marketing diagnostics log write failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  private toJson(value: unknown): Prisma.InputJsonValue | undefined {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
