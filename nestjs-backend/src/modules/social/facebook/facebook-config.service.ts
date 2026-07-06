import { Injectable, Logger, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import { resolveFrontendUrl } from '../../../common/resolve-frontend-url';
import {
  findLocalhostInJson,
  isLocalhostLikeUrl,
  isProductionEnvironment,
  META_OAUTH_CALLBACK_API_PATH,
  resolveMetaOAuthRedirectUri,
  type MetaRedirectUriSource,
} from '../../meta-center/meta-oauth-redirect-uri.util';
import {
  FACEBOOK_KNOWN_LOGIN_APP_ID,
  FACEBOOK_KNOWN_PAGES_APP_ID,
  FACEBOOK_LOGIN_APP_NAME,
  FACEBOOK_PAGES_APP_NAME,
} from './facebook-app.constants';

const LOGIN_ENV_KEYS = ['FACEBOOK_LOGIN_APP_ID', 'FACEBOOK_LOGIN_APP_SECRET'] as const;
const LOGIN_LEGACY_KEYS = ['FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET'] as const;

const PAGES_ENV_KEYS = ['FACEBOOK_PAGES_APP_ID', 'FACEBOOK_PAGES_APP_SECRET'] as const;

const RECOMMENDED_ENV_KEYS = [
  'FACEBOOK_WEBHOOK_VERIFY_TOKEN',
  'SOCIAL_TOKEN_ENCRYPTION_KEY',
  'FACEBOOK_GRAPH_API_VERSION',
  'FRONTEND_URL',
  'BACKEND_URL',
] as const;

export type FacebookAppIdValidation = {
  ok: boolean;
  error: string | null;
};

export type FacebookEnvCheck = {
  key: string;
  present: boolean;
  required: boolean;
};

export type FacebookAppsConfigDto = {
  login: {
    appName: string;
    appId: string | null;
    appSecretConfigured: boolean;
    appSecretMasked: string | null;
    oauthRedirectUri: string | null;
    configured: boolean;
    missing: string[];
    idValidation: FacebookAppIdValidation;
  };
  pages: {
    appName: string;
    appId: string | null;
    appSecretConfigured: boolean;
    appSecretMasked: string | null;
    pageConnectRedirectUri: string | null;
    metaConnectRedirectUri: string | null;
    configured: boolean;
    missing: string[];
    idValidation: FacebookAppIdValidation;
  };
  graphApiVersion: string;
  frontendUrl: string | null;
  backendUrl: string | null;
  webhookUri: string | null;
};

export type MetaOAuthRedirectDiagnosticsDto = {
  oauthRedirectUsedByApp: string | null;
  recommendedRedirectUri: string | null;
  allowedRedirectUri: string | null;
  allowedRedirectUris: string[];
  currentRedirectUri: string | null;
  canonicalRedirectUri: string | null;
  explicitRedirectUri: string | null;
  backendBaseUrl: string | null;
  apiPublicBase: string | null;
  frontendUrl: string | null;
  pagesAppId: string | null;
  facebookLoginSettingsUrl: string | null;
  matchesAllowed: boolean;
  redirectUriInAllowedConfig: boolean;
  isRailwayRedirectUri: boolean;
  railwayWarning: string | null;
  mismatchMessage: string | null;
  metaDevelopersInstruction: string | null;
  redirectUriSource: MetaRedirectUriSource;
  localhostDetected: boolean;
  localhostHits: string[];
  productionMode: boolean;
};

export type MetaOAuthPreviewDto = {
  facebookOAuthUrl: string;
  client_id: string;
  redirect_uri: string;
  scope: string;
  scopesList: string[];
  requestedScopes?: string[];
  excludedScopes?: string[];
  scopeWarnings?: string[];
  oauthFlow: string;
  oauthFlowLabel: string;
  response_type: string;
  state: string;
  prompt: string;
  auth_type: string | null;
  redirectUriInAllowedConfig: boolean;
  allowedRedirectUris: string[];
  facebookLoginSettingsUrl: string | null;
  dryRun: boolean;
};

export type FacebookConfigStatusDto = {
  configured: boolean;
  missing: string[];
  pagesConfigured: boolean;
  pagesMissing: string[];
  loginAppId: string | null;
  pagesAppId: string | null;
  oauthRedirectUri: string | null;
  metaConnectRedirectUri: string | null;
  pageConnectRedirectUri: string | null;
  pageConnectRequiresReview: boolean;
  pageConnectScopesAvailable: boolean;
  webhookUri: string | null;
  recommendedMissing: string[];
  envChecks: FacebookEnvCheck[];
};

@Injectable()
export class FacebookConfigService implements OnModuleInit {
  private readonly logger = new Logger(FacebookConfigService.name);

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.logEnvStatusAtStartup();

    const loginMissing = this.getLoginMissingRequired();
    if (loginMissing.length > 0) {
      this.logger.warn(
        `[Facebook Login] Integrace není kompletní. Chybí: ${loginMissing.join(', ')}.`,
      );
    } else {
      const loginValidation = this.validateLoginAppId();
      this.logger.log(
        `[Facebook Login] Připraveno (${FACEBOOK_LOGIN_APP_NAME}). App ID: ${this.getLoginAppId()}. Redirect: ${this.resolveLoginOAuthRedirectUriOptional()}`,
      );
      if (!loginValidation.ok) {
        this.logger.error(`[Facebook Login] ${loginValidation.error}`);
      }
    }

    const pagesMissing = this.getPagesMissingRequired();
    if (pagesMissing.length > 0) {
      this.logger.warn(
        `[Facebook Pages] Marketing integrace není kompletní. Chybí: ${pagesMissing.join(', ')}.`,
      );
    } else {
      const pagesValidation = this.validatePagesAppId();
      this.logger.log(
        `[Facebook Pages] Připraveno (${FACEBOOK_PAGES_APP_NAME}). App ID: ${this.getPagesAppId()}. Meta Connect: ${this.tryGetMetaRedirectUri()}`,
      );
      if (!pagesValidation.ok) {
        this.logger.error(`[Facebook Pages] ${pagesValidation.error}`);
      }
    }

    const recommended = this.getRecommendedMissing();
    if (recommended.length > 0) {
      this.logger.warn(
        `[Facebook] Doporučené proměnné nejsou nastavené: ${recommended.join(', ')}`,
      );
    }
  }

  private readEnv(name: string): string | null {
    const fromProcess = process.env[name];
    const fromConfig = this.config.get<string>(name);
    const raw = fromProcess ?? fromConfig;
    if (raw == null) return null;

    let value = String(raw).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1).trim();
    }
    return value.length > 0 ? value : null;
  }

  private isEnvPresent(name: string): boolean {
    return this.readEnv(name) != null;
  }

  private maskSecret(value: string | null): string | null {
    if (!value?.trim()) return null;
    const v = value.trim();
    if (v.length <= 4) return '••••';
    return `••••${v.slice(-4)}`;
  }

  private logEnvStatusAtStartup() {
    const allKeys = [
      'FRONTEND_URL',
      'BACKEND_URL',
      ...LOGIN_ENV_KEYS,
      ...LOGIN_LEGACY_KEYS,
      ...PAGES_ENV_KEYS,
      ...RECOMMENDED_ENV_KEYS,
    ];
    for (const key of allKeys) {
      const ok = this.isEnvPresent(key);
      this.logger.log(`[Facebook] ${key}: ${ok ? 'OK' : 'chybí'}`);
    }
    const canonical = this.resolveCanonicalOAuthRedirectUriOptional();
    this.logger.log(
      `[Facebook] Canonical OAuth redirect: ${canonical ?? 'nelze odvodit'} (doporučeno: ${this.getRecommendedMetaRedirectUri() ?? '—'})`,
    );
  }

  getLoginAppId(): string | null {
    return this.readEnv('FACEBOOK_LOGIN_APP_ID') ?? this.readEnv('FACEBOOK_APP_ID');
  }

  getLoginAppSecret(): string | null {
    return this.readEnv('FACEBOOK_LOGIN_APP_SECRET') ?? this.readEnv('FACEBOOK_APP_SECRET');
  }

  /** @deprecated Použijte getLoginAppId */
  getAppId(): string | null {
    return this.getLoginAppId();
  }

  /** @deprecated Použijte getLoginAppSecret */
  getAppSecret(): string | null {
    return this.getLoginAppSecret();
  }

  getPagesAppId(): string | null {
    return this.readEnv('FACEBOOK_PAGES_APP_ID');
  }

  getPagesAppSecret(): string | null {
    return this.readEnv('FACEBOOK_PAGES_APP_SECRET');
  }

  getGraphApiVersion(): string {
    const raw = this.readEnv('FACEBOOK_GRAPH_API_VERSION') ?? 'v25.0';
    return raw.startsWith('v') ? raw : `v${raw}`;
  }

  resolveFrontendUrl(): string {
    return resolveFrontendUrl(this.config, this.logger);
  }

  resolveBackendUrl(): string | null {
    return (
      this.readEnv('BACKEND_URL')?.replace(/\/+$/, '') ||
      this.readEnv('API_URL')?.replace(/\/+$/, '') ||
      this.readEnv('NEXT_PUBLIC_API_URL')?.replace(/\/+$/, '') ||
      null
    );
  }

  resolveFrontendApiBase(): string {
    return `${this.resolveFrontendUrl()}/api`;
  }

  getLoginMissingRequired(): string[] {
    const missing: string[] = [];
    if (!this.getLoginAppId()) {
      missing.push('FACEBOOK_LOGIN_APP_ID (nebo FACEBOOK_APP_ID)');
    }
    if (!this.getLoginAppSecret()) {
      missing.push('FACEBOOK_LOGIN_APP_SECRET (nebo FACEBOOK_APP_SECRET)');
    }
    return missing;
  }

  getPagesMissingRequired(): string[] {
    const missing: string[] = [];
    for (const key of PAGES_ENV_KEYS) {
      if (!this.isEnvPresent(key)) missing.push(key);
    }
    return missing;
  }

  getRecommendedMissing(): string[] {
    const missing: string[] = [];
    for (const key of RECOMMENDED_ENV_KEYS) {
      if (!this.isEnvPresent(key)) missing.push(key);
    }
    return missing;
  }

  buildEnvChecks(): FacebookEnvCheck[] {
    return [
      { key: 'FRONTEND_URL', present: this.isEnvPresent('FRONTEND_URL'), required: true },
      { key: 'BACKEND_URL', present: this.isEnvPresent('BACKEND_URL'), required: false },
      { key: 'META_REDIRECT_URI', present: this.isEnvPresent('META_REDIRECT_URI'), required: false },
      { key: 'PUBLIC_APP_URL', present: this.isEnvPresent('PUBLIC_APP_URL'), required: false },
      { key: 'FACEBOOK_LOGIN_APP_ID', present: Boolean(this.getLoginAppId()), required: true },
      {
        key: 'FACEBOOK_LOGIN_APP_SECRET',
        present: Boolean(this.getLoginAppSecret()),
        required: true,
      },
      { key: 'FACEBOOK_PAGES_APP_ID', present: Boolean(this.getPagesAppId()), required: true },
      { key: 'FACEBOOK_PAGES_APP_SECRET', present: Boolean(this.getPagesAppSecret()), required: true },
      ...RECOMMENDED_ENV_KEYS.filter(
        (k) => !['FRONTEND_URL', 'BACKEND_URL'].includes(k),
      ).map((key) => ({
        key,
        present: this.isEnvPresent(key),
        required: false,
      })),
    ];
  }

  validateLoginAppId(): FacebookAppIdValidation {
    const id = this.getLoginAppId();
    if (!id) return { ok: false, error: 'Login App ID chybí v ENV.' };
    const pagesId = this.getPagesAppId();
    if (pagesId && id === pagesId) {
      return {
        ok: false,
        error: 'Používáte Pages App ID pro Facebook Login.',
      };
    }
    if (id === FACEBOOK_KNOWN_PAGES_APP_ID) {
      return {
        ok: false,
        error: 'Používáte Pages App ID pro Facebook Login.',
      };
    }
    return { ok: true, error: null };
  }

  validatePagesAppId(): FacebookAppIdValidation {
    const id = this.getPagesAppId();
    if (!id) return { ok: false, error: 'Pages App ID chybí v ENV.' };
    const loginId = this.getLoginAppId();
    if (loginId && id === loginId) {
      return {
        ok: false,
        error: 'Používáte Login App ID pro Meta Marketing připojení.',
      };
    }
    if (id === FACEBOOK_KNOWN_LOGIN_APP_ID) {
      return {
        ok: false,
        error: 'Používáte Login App ID pro Meta Marketing připojení.',
      };
    }
    return { ok: true, error: null };
  }

  assertLoginAppIdValid() {
    const v = this.validateLoginAppId();
    if (!v.ok) throw new ServiceUnavailableException(v.error);
  }

  assertPagesAppIdValid() {
    const v = this.validatePagesAppId();
    if (!v.ok) throw new ServiceUnavailableException(v.error);
  }

  isLoginConfigured(): boolean {
    return this.getLoginMissingRequired().length === 0 && this.validateLoginAppId().ok;
  }

  isPagesConfigured(): boolean {
    return this.getPagesMissingRequired().length === 0 && this.validatePagesAppId().ok;
  }

  isConfigured(): boolean {
    return this.isLoginConfigured();
  }

  configurationErrorMessage(): string {
    const missing = this.getLoginMissingRequired();
    if (missing.length) {
      return `Facebook Login není nakonfigurován (chybí ${missing.join(', ')}).`;
    }
    const v = this.validateLoginAppId();
    return v.error ?? 'Facebook propojení není nakonfigurováno administrátorem.';
  }

  pagesConfigurationErrorMessage(): string {
    const missing = this.getPagesMissingRequired();
    if (missing.length) {
      return `Meta Marketing není nakonfigurován (chybí ${missing.join(', ')}).`;
    }
    const v = this.validatePagesAppId();
    return v.error ?? 'Propojení Facebook Pages / Marketing není nakonfigurováno.';
  }

  resolveApiPublicBase(): string | null {
    const backend = this.resolveBackendUrl();
    if (backend) return backend.endsWith('/api') ? backend : `${backend}/api`;
    const raw =
      this.readEnv('API_PUBLIC_URL')?.replace(/\/+$/, '') ||
      this.readEnv('NEXT_PUBLIC_API_URL')?.replace(/\/+$/, '') ||
      null;
    if (!raw) return null;
    return raw.endsWith('/api') ? raw : `${raw}/api`;
  }

  buildWebhookUri(): string | null {
    const base = this.resolveApiPublicBase();
    return base ? `${base}/social/facebook/webhook` : null;
  }

  /** Kanonická Meta / Facebook OAuth callback URL (všechny Meta toky). */
  private resolveCanonicalOAuthRedirectUriOptional(): string | null {
    return this.tryGetMetaRedirectUri();
  }

  /** Facebook Login — jednotný meta-connect-callback */
  resolveLoginOAuthRedirectUriOptional(): string | null {
    return this.resolveCanonicalOAuthRedirectUriOptional();
  }

  resolveLoginOAuthRedirectUri(): string {
    const uri = this.resolveLoginOAuthRedirectUriOptional();
    if (!uri) {
      throw new ServiceUnavailableException(this.configurationErrorMessage());
    }
    return uri;
  }

  /** @deprecated Použijte resolveLoginOAuthRedirectUri */
  resolveOAuthRedirectUriOptional(): string | null {
    return this.resolveLoginOAuthRedirectUriOptional();
  }

  /** @deprecated Použijte resolveLoginOAuthRedirectUri */
  resolveOAuthRedirectUri(): string {
    return this.resolveLoginOAuthRedirectUri();
  }

  /** Sdílený OAuth callback portálu — jednotný meta-connect-callback */
  resolveSharedOAuthCallbackUriOptional(): string | null {
    return this.resolveCanonicalOAuthRedirectUriOptional();
  }

  resolveSharedOAuthCallbackUri(): string {
    const uri = this.resolveSharedOAuthCallbackUriOptional();
    if (!uri) {
      throw new ServiceUnavailableException(this.pagesConfigurationErrorMessage());
    }
    return uri;
  }

  /** Kanonická Meta Connect callback cesta (jediná povolená pro Meta Centrum). */
  metaConnectRedirectPath(): string {
    return META_OAUTH_CALLBACK_API_PATH;
  }

  private isRailwayHost(origin: string): boolean {
    try {
      const normalized = origin.startsWith('http') ? origin : `https://${origin}`;
      const host = new URL(normalized).hostname.toLowerCase();
      return host.endsWith('.railway.app') || host.includes('railway.app');
    } catch {
      return origin.toLowerCase().includes('railway.app');
    }
  }

  private normalizeApiBase(origin: string): string {
    const base = origin.replace(/\/+$/, '');
    return base.endsWith('/api') ? base : `${base}/api`;
  }

  /**
   * Veřejná API báze pro Meta OAuth — preferuje FRONTEND_URL / PUBLIC_APP_URL před Railway BACKEND_URL.
   */
  resolveMetaOAuthApiBase(): string | null {
    const frontend = this.readEnv('FRONTEND_URL')?.replace(/\/+$/, '');
    if (frontend && !this.isRailwayHost(frontend)) {
      return this.normalizeApiBase(frontend);
    }

    const publicApp =
      this.readEnv('PUBLIC_APP_URL')?.replace(/\/+$/, '') ||
      this.readEnv('NEXT_PUBLIC_APP_URL')?.replace(/\/+$/, '');
    if (publicApp && !this.isRailwayHost(publicApp)) {
      return this.normalizeApiBase(publicApp);
    }

    try {
      const resolved = this.resolveFrontendUrl()?.replace(/\/+$/, '');
      if (resolved && !this.isRailwayHost(resolved)) {
        return this.normalizeApiBase(resolved);
      }
    } catch {
      /* resolveFrontendUrl může selhat bez FRONTEND_URL */
    }

    const backend = this.resolveBackendUrl();
    if (backend && !this.isRailwayHost(backend)) {
      return this.normalizeApiBase(backend);
    }

    if (backend) {
      return this.normalizeApiBase(backend);
    }

    return null;
  }

  /** Doporučená redirect URI z veřejné domény (bez META_REDIRECT_URI override). */
  getRecommendedMetaRedirectUri(): string | null {
    const apiBase = this.resolveMetaOAuthApiBase();
    if (!apiBase) return null;
    return `${apiBase}${this.metaConnectRedirectPath()}`;
  }

  /**
   * Jediná centrální Meta OAuth redirect URI.
   * 1) META_REDIRECT_URI (pokud existuje)
   * 2) BACKEND_URL / API_URL
   * Nikdy localhost v produkci.
   */
  tryGetMetaRedirectUri(): string | null {
    return resolveMetaOAuthRedirectUri((key) => this.readEnv(key)).uri;
  }

  getMetaRedirectUriResolution() {
    return resolveMetaOAuthRedirectUri((key) => this.readEnv(key));
  }

  getMetaRedirectUri(): string {
    const uri = this.tryGetMetaRedirectUri();
    if (!uri) {
      const resolution = this.getMetaRedirectUriResolution();
      throw new ServiceUnavailableException(
        resolution.warnings[0] ??
          'Meta OAuth redirect nelze odvodit — nastavte META_REDIRECT_URI nebo BACKEND_URL.',
      );
    }
    return uri;
  }

  /**
   * URI whitelistnuté v Meta Developers (META_ALLOWED_REDIRECT_URIS, čárkou oddělené).
   * Pokud není nastaveno, použije se getMetaRedirectUri().
   */
  getMetaAllowedRedirectUris(): string[] {
    const raw = this.readEnv('META_ALLOWED_REDIRECT_URIS');
    if (raw?.trim()) {
      return raw
        .split(',')
        .map((s) => s.trim().replace(/\/+$/, ''))
        .filter(Boolean);
    }
    const uri = this.tryGetMetaRedirectUri();
    return uri ? [uri] : [];
  }

  isMetaRedirectUriInAllowedConfig(uri: string): boolean {
    const normalized = uri.trim().replace(/\/+$/, '');
    return this.getMetaAllowedRedirectUris().some((allowed) => allowed === normalized);
  }

  getMetaFacebookLoginSettingsUrl(): string | null {
    const appId = this.getPagesAppId();
    return appId ? `https://developers.facebook.com/apps/${appId}/fb-login/settings/` : null;
  }

  /** @deprecated Použijte getMetaRedirectUri() */
  resolveMetaConnectRedirectUriFromBackendBaseOptional(): string | null {
    return this.tryGetMetaRedirectUri();
  }

  /** @deprecated Použijte getMetaRedirectUri() */
  resolveMetaConnectRedirectUriOptional(): string | null {
    return this.tryGetMetaRedirectUri();
  }

  /** @deprecated Použijte getMetaRedirectUri() */
  resolveMetaConnectRedirectUri(): string {
    return this.getMetaRedirectUri();
  }

  getMetaOAuthRedirectDiagnostics(): MetaOAuthRedirectDiagnosticsDto {
    const resolution = this.getMetaRedirectUriResolution();
    const used = resolution.uri;
    const recommended = this.getRecommendedMetaRedirectUri();
    const allowedRedirectUris = this.getMetaAllowedRedirectUris();
    const explicit =
      this.readEnv('META_REDIRECT_URI') ?? this.readEnv('META_CENTER_OAUTH_REDIRECT_URI');
    const pagesAppId = this.getPagesAppId();
    const redirectUriInAllowedConfig = used ? this.isMetaRedirectUriInAllowedConfig(used) : false;
    const isRailwayRedirectUri = used ? this.isRailwayHost(used) : false;
    const productionMode = isProductionEnvironment();
    const localhostHits = findLocalhostInJson({
      oauthRedirectUsedByApp: used,
      recommendedRedirectUri: recommended,
      explicitRedirectUri: explicit,
      backendBaseUrl: this.resolveBackendUrl(),
      resolutionWarnings: resolution.warnings,
    });
    const localhostDetected =
      localhostHits.length > 0 ||
      isLocalhostLikeUrl(used) ||
      isLocalhostLikeUrl(explicit) ||
      isLocalhostLikeUrl(this.resolveBackendUrl());
    const railwayWarning = isRailwayRedirectUri
      ? 'Nepoužívejte Railway URL pro Meta OAuth. Použijte veřejnou doménu www.xxrealit.cz.'
      : null;

    let mismatchMessage: string | null = railwayWarning;
    if (productionMode && localhostDetected) {
      mismatchMessage =
        'V produkci byl detekován localhost v OAuth URL — nastavte META_REDIRECT_URI nebo BACKEND_URL bez localhost.';
    } else if (!used) {
      mismatchMessage =
        resolution.warnings[0] ??
        'Redirect URI nelze odvodit — nastavte META_REDIRECT_URI nebo BACKEND_URL.';
    } else if (!redirectUriInAllowedConfig && !explicit) {
      mismatchMessage =
        mismatchMessage ??
        'Tato Redirect URI není povolena v Meta Developers (chybí v META_ALLOWED_REDIRECT_URIS).';
    }

    const matchesAllowed =
      Boolean(used) && redirectUriInAllowedConfig && !isRailwayRedirectUri;
    const allowedRedirectUri = allowedRedirectUris[0] ?? recommended ?? used;
    const instructionUri = recommended ?? used;
    const metaDevelopersInstruction =
      instructionUri && pagesAppId
        ? `Meta Developers → aplikace ${pagesAppId} (${FACEBOOK_PAGES_APP_NAME}) → Facebook Login → Settings → Valid OAuth Redirect URIs — přidejte přesně tuto URL (bez lomítka na konci):\n${instructionUri}`
        : instructionUri
          ? `Meta Developers → Facebook Login → Valid OAuth Redirect URIs — přidejte:\n${instructionUri}`
          : null;

    return {
      oauthRedirectUsedByApp: used,
      recommendedRedirectUri: recommended,
      allowedRedirectUri,
      allowedRedirectUris,
      currentRedirectUri: used,
      canonicalRedirectUri: recommended ?? used,
      explicitRedirectUri: explicit,
      backendBaseUrl: this.resolveBackendUrl(),
      apiPublicBase: this.resolveMetaOAuthApiBase(),
      frontendUrl: this.readEnv('FRONTEND_URL'),
      pagesAppId,
      facebookLoginSettingsUrl: this.getMetaFacebookLoginSettingsUrl(),
      matchesAllowed,
      redirectUriInAllowedConfig,
      isRailwayRedirectUri,
      railwayWarning,
      mismatchMessage,
      metaDevelopersInstruction,
      redirectUriSource: resolution.source,
      localhostDetected,
      localhostHits,
      productionMode,
    };
  }

  /** Propojení Facebook stránky / Pages API — jednotný meta-connect-callback */
  resolvePageConnectRedirectUriOptional(): string | null {
    return this.resolveCanonicalOAuthRedirectUriOptional();
  }

  resolvePageConnectRedirectUri(): string {
    const uri = this.resolvePageConnectRedirectUriOptional();
    if (!uri) {
      throw new ServiceUnavailableException(this.pagesConfigurationErrorMessage());
    }
    return uri;
  }

  isPageConnectReviewPending(): boolean {
    const raw = this.readEnv('FACEBOOK_PAGE_CONNECT_REQUIRES_REVIEW');
    if (raw === 'false' || raw === '0') return false;
    return true;
  }

  arePageConnectScopesAvailable(
    _role?: UserRole | null,
    _facebookUserId?: string | null,
  ): boolean {
    return true;
  }

  getAppTesterFacebookUserIds(): string[] {
    const raw = this.readEnv('FACEBOOK_APP_TESTER_FACEBOOK_IDS');
    if (!raw?.trim()) return [];
    return raw
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
  }

  getAppsConfig(): FacebookAppsConfigDto {
    const loginSecret = this.getLoginAppSecret();
    const pagesSecret = this.getPagesAppSecret();
    return {
      login: {
        appName: FACEBOOK_LOGIN_APP_NAME,
        appId: this.getLoginAppId(),
        appSecretConfigured: Boolean(loginSecret),
        appSecretMasked: this.maskSecret(loginSecret),
        oauthRedirectUri: this.resolveLoginOAuthRedirectUriOptional(),
        configured: this.isLoginConfigured(),
        missing: this.getLoginMissingRequired(),
        idValidation: this.validateLoginAppId(),
      },
      pages: {
        appName: FACEBOOK_PAGES_APP_NAME,
        appId: this.getPagesAppId(),
        appSecretConfigured: Boolean(pagesSecret),
        appSecretMasked: this.maskSecret(pagesSecret),
        pageConnectRedirectUri: this.resolvePageConnectRedirectUriOptional(),
        metaConnectRedirectUri: this.tryGetMetaRedirectUri(),
        configured: this.isPagesConfigured(),
        missing: this.getPagesMissingRequired(),
        idValidation: this.validatePagesAppId(),
      },
      graphApiVersion: this.getGraphApiVersion(),
      frontendUrl: this.readEnv('FRONTEND_URL'),
      backendUrl: this.resolveBackendUrl(),
      webhookUri: this.buildWebhookUri(),
    };
  }

  getConfigStatus(): FacebookConfigStatusDto {
    const missing = this.getLoginMissingRequired();
    const pagesMissing = this.getPagesMissingRequired();

    return {
      configured: this.isLoginConfigured(),
      missing,
      pagesConfigured: this.isPagesConfigured(),
      pagesMissing,
      loginAppId: this.getLoginAppId(),
      pagesAppId: this.getPagesAppId(),
      oauthRedirectUri: this.resolveLoginOAuthRedirectUriOptional(),
      metaConnectRedirectUri: this.resolveMetaConnectRedirectUriOptional(),
      pageConnectRedirectUri: this.resolvePageConnectRedirectUriOptional(),
      pageConnectRequiresReview: this.isPageConnectReviewPending(),
      pageConnectScopesAvailable: this.arePageConnectScopesAvailable(),
      webhookUri: this.buildWebhookUri(),
      recommendedMissing: this.getRecommendedMissing(),
      envChecks: this.buildEnvChecks(),
    };
  }
}
