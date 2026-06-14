import { Injectable, Logger, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';

const LOGIN_REQUIRED_ENV_KEYS = ['FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET'] as const;

const PAGES_REQUIRED_ENV_KEYS = [
  'FACEBOOK_PAGES_APP_ID',
  'FACEBOOK_PAGES_APP_SECRET',
] as const;

const RECOMMENDED_ENV_KEYS = [
  'FACEBOOK_WEBHOOK_VERIFY_TOKEN',
  'SOCIAL_TOKEN_ENCRYPTION_KEY',
  'FACEBOOK_PAGE_CONNECT_REDIRECT_URI',
  'FACEBOOK_GRAPH_API_VERSION',
] as const;

export type FacebookEnvCheck = {
  key: string;
  present: boolean;
  required: boolean;
};

export type FacebookConfigStatusDto = {
  /** Facebook Login (registrace / přihlášení). */
  configured: boolean;
  missing: string[];
  /** Facebook Pages API (propojení stránky). */
  pagesConfigured: boolean;
  pagesMissing: string[];
  pagesAppId: string | null;
  oauthRedirectUri: string | null;
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
      this.logger.log(
        `[Facebook Login] Připraveno. OAuth redirect: ${this.resolveOAuthRedirectUri()}`,
      );
    }

    const pagesMissing = this.getPagesMissingRequired();
    if (pagesMissing.length > 0) {
      this.logger.warn(
        `[Facebook Pages] Propojení stránek není kompletní. Chybí: ${pagesMissing.join(', ')}.`,
      );
    } else {
      this.logger.log(
        `[Facebook Pages] Připraveno. App ID: ${this.getPagesAppId()}. Redirect: ${this.resolvePageConnectRedirectUri()}`,
      );
    }

    const recommended = this.getRecommendedMissing();
    if (recommended.length > 0) {
      this.logger.warn(
        `[Facebook] Doporučené proměnné nejsou nastavené: ${recommended.join(', ')}`,
      );
    }
  }

  /** Railway / runtime env má prioritu před ConfigService (kvůli .env souborům v deployi). */
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

  private logEnvStatusAtStartup() {
    const allKeys = [
      ...LOGIN_REQUIRED_ENV_KEYS,
      ...PAGES_REQUIRED_ENV_KEYS,
      ...RECOMMENDED_ENV_KEYS,
    ];
    for (const key of allKeys) {
      const ok = this.isEnvPresent(key);
      this.logger.log(`[Facebook] ${key}: ${ok ? 'OK' : 'chybí'}`);
    }
    const callbackOk = this.getOAuthRedirectUriRaw() != null;
    this.logger.log(`[Facebook] FACEBOOK_CALLBACK_URL: ${callbackOk ? 'OK' : 'chybí'}`);
  }

  getAppId(): string | null {
    return this.readEnv('FACEBOOK_APP_ID');
  }

  getAppSecret(): string | null {
    return this.readEnv('FACEBOOK_APP_SECRET');
  }

  getPagesAppId(): string | null {
    return this.readEnv('FACEBOOK_PAGES_APP_ID');
  }

  getPagesAppSecret(): string | null {
    return this.readEnv('FACEBOOK_PAGES_APP_SECRET');
  }

  getOAuthRedirectUriRaw(): string | null {
    return (
      this.readEnv('FACEBOOK_OAUTH_REDIRECT_URI') ?? this.readEnv('FACEBOOK_CALLBACK_URL')
    );
  }

  getGraphApiVersion(): string {
    const raw = this.readEnv('FACEBOOK_GRAPH_API_VERSION') ?? 'v25.0';
    return raw.startsWith('v') ? raw : `v${raw}`;
  }

  getLoginMissingRequired(): string[] {
    const missing: string[] = [];
    for (const key of LOGIN_REQUIRED_ENV_KEYS) {
      if (!this.isEnvPresent(key)) missing.push(key);
    }
    if (!this.getOAuthRedirectUriRaw()) {
      missing.push('FACEBOOK_CALLBACK_URL');
    }
    return missing;
  }

  getPagesMissingRequired(): string[] {
    const missing: string[] = [];
    for (const key of PAGES_REQUIRED_ENV_KEYS) {
      if (!this.isEnvPresent(key)) missing.push(key);
    }
    if (!this.resolvePageConnectRedirectUriOptional()) {
      missing.push('FACEBOOK_PAGE_CONNECT_REDIRECT_URI');
    }
    return missing;
  }

  /** @deprecated Použijte getLoginMissingRequired */
  getMissingRequired(): string[] {
    return this.getLoginMissingRequired();
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
      ...LOGIN_REQUIRED_ENV_KEYS.map((key) => ({
        key,
        present: this.isEnvPresent(key),
        required: true,
      })),
      {
        key: 'FACEBOOK_CALLBACK_URL',
        present: this.getOAuthRedirectUriRaw() != null,
        required: true,
      },
      ...PAGES_REQUIRED_ENV_KEYS.map((key) => ({
        key,
        present: this.isEnvPresent(key),
        required: true,
      })),
      {
        key: 'FACEBOOK_PAGE_CONNECT_REDIRECT_URI',
        present: this.resolvePageConnectRedirectUriOptional() != null,
        required: true,
      },
      ...RECOMMENDED_ENV_KEYS.map((key) => ({
        key,
        present: this.isEnvPresent(key),
        required: false,
      })),
    ];
  }

  isLoginConfigured(): boolean {
    return this.getLoginMissingRequired().length === 0;
  }

  isPagesConfigured(): boolean {
    return this.getPagesMissingRequired().length === 0;
  }

  /** Facebook Login — registrace a přihlášení. */
  isConfigured(): boolean {
    return this.isLoginConfigured();
  }

  configurationErrorMessage(): string {
    return 'Facebook propojení není nakonfigurováno administrátorem.';
  }

  pagesConfigurationErrorMessage(): string {
    return 'Propojení Facebook stránky není nakonfigurováno administrátorem (chybí FACEBOOK_PAGES_APP_ID).';
  }

  resolveApiPublicBase(): string | null {
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

  resolveOAuthRedirectUri(): string {
    const explicit = this.getOAuthRedirectUriRaw();
    if (!explicit) {
      throw new ServiceUnavailableException(this.configurationErrorMessage());
    }
    return explicit.replace(/\/+$/, '');
  }

  private resolvePageConnectRedirectUriOptional(): string | null {
    const explicit = this.readEnv('FACEBOOK_PAGE_CONNECT_REDIRECT_URI');
    if (explicit) return explicit.replace(/\/+$/, '');
    const base = this.resolveApiPublicBase();
    if (base) return `${base}/social/facebook/page-callback`;
    return null;
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

  getConfigStatus(): FacebookConfigStatusDto {
    const missing = this.getLoginMissingRequired();
    const pagesMissing = this.getPagesMissingRequired();
    const oauthRedirectUri =
      this.getOAuthRedirectUriRaw()?.replace(/\/+$/, '') ??
      (this.resolveApiPublicBase()
        ? `${this.resolveApiPublicBase()}/social/facebook/callback`
        : null);
    const pageConnectRedirectUri = this.resolvePageConnectRedirectUriOptional();

    return {
      configured: missing.length === 0,
      missing,
      pagesConfigured: pagesMissing.length === 0,
      pagesMissing,
      pagesAppId: this.getPagesAppId(),
      oauthRedirectUri,
      pageConnectRedirectUri,
      pageConnectRequiresReview: this.isPageConnectReviewPending(),
      pageConnectScopesAvailable: this.arePageConnectScopesAvailable(),
      webhookUri: this.buildWebhookUri(),
      recommendedMissing: this.getRecommendedMissing(),
      envChecks: this.buildEnvChecks(),
    };
  }
}
