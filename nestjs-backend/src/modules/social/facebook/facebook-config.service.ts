import { Injectable, Logger, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const REQUIRED_ENV_KEYS = [
  'FACEBOOK_APP_ID',
  'FACEBOOK_APP_SECRET',
  'FACEBOOK_OAUTH_REDIRECT_URI',
] as const;

const RECOMMENDED_ENV_KEYS = [
  'FACEBOOK_WEBHOOK_VERIFY_TOKEN',
  'SOCIAL_TOKEN_ENCRYPTION_KEY',
  'FACEBOOK_PAGE_CONNECT_REDIRECT_URI',
] as const;

export type FacebookEnvCheck = {
  key: string;
  present: boolean;
  required: boolean;
};

export type FacebookConfigStatusDto = {
  configured: boolean;
  missing: string[];
  oauthRedirectUri: string | null;
  pageConnectRedirectUri: string | null;
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

    const missing = this.getMissingRequired();
    if (missing.length > 0) {
      this.logger.error(
        `[Facebook] Integrace NENÍ připravena. Chybí: ${missing.join(', ')}. ` +
          'Uživatelům se zobrazí: „Facebook propojení není nakonfigurováno administrátorem.“ ' +
          'Viz ADMIN_SETUP_FACEBOOK.md.',
      );
      return;
    }
    this.logger.log(
      `[Facebook] Integrace připravena. OAuth redirect: ${this.resolveOAuthRedirectUri()}`,
    );
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
    const allKeys = [...REQUIRED_ENV_KEYS, ...RECOMMENDED_ENV_KEYS];
    for (const key of allKeys) {
      const ok = this.isEnvPresent(key);
      this.logger.log(`[Facebook] ${key}: ${ok ? 'OK' : 'chybí'}`);
    }
  }

  getAppId(): string | null {
    return this.readEnv('FACEBOOK_APP_ID');
  }

  getAppSecret(): string | null {
    return this.readEnv('FACEBOOK_APP_SECRET');
  }

  getOAuthRedirectUriRaw(): string | null {
    return this.readEnv('FACEBOOK_OAUTH_REDIRECT_URI');
  }

  getMissingRequired(): string[] {
    const missing: string[] = [];
    for (const key of REQUIRED_ENV_KEYS) {
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
      ...REQUIRED_ENV_KEYS.map((key) => ({
        key,
        present: this.isEnvPresent(key),
        required: true,
      })),
      ...RECOMMENDED_ENV_KEYS.map((key) => ({
        key,
        present: this.isEnvPresent(key),
        required: false,
      })),
    ];
  }

  isConfigured(): boolean {
    return this.getMissingRequired().length === 0;
  }

  configurationErrorMessage(): string {
    return 'Facebook propojení není nakonfigurováno administrátorem.';
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

  resolvePageConnectRedirectUri(): string {
    const explicit = this.readEnv('FACEBOOK_PAGE_CONNECT_REDIRECT_URI');
    if (explicit) return explicit.replace(/\/+$/, '');
    const base = this.resolveApiPublicBase();
    if (base) return `${base}/social/facebook/page-callback`;
    throw new ServiceUnavailableException(this.configurationErrorMessage());
  }

  getConfigStatus(): FacebookConfigStatusDto {
    const missing = this.getMissingRequired();
    const oauthRedirectUri =
      this.getOAuthRedirectUriRaw()?.replace(/\/+$/, '') ??
      (this.resolveApiPublicBase()
        ? `${this.resolveApiPublicBase()}/social/facebook/callback`
        : null);
    const pageConnectRedirectUri =
      this.readEnv('FACEBOOK_PAGE_CONNECT_REDIRECT_URI')?.replace(/\/+$/, '') ??
      (this.resolveApiPublicBase()
        ? `${this.resolveApiPublicBase()}/social/facebook/page-callback`
        : null);

    return {
      configured: missing.length === 0,
      missing,
      oauthRedirectUri,
      pageConnectRedirectUri,
      webhookUri: this.buildWebhookUri(),
      recommendedMissing: this.getRecommendedMissing(),
      envChecks: this.buildEnvChecks(),
    };
  }
}
