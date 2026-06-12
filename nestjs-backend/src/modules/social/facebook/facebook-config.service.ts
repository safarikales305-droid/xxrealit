import { Injectable, Logger, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type FacebookConfigStatusDto = {
  configured: boolean;
  missing: string[];
  oauthRedirectUri: string | null;
  webhookUri: string | null;
  recommendedMissing: string[];
};

@Injectable()
export class FacebookConfigService implements OnModuleInit {
  private readonly logger = new Logger(FacebookConfigService.name);

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
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

  getAppId(): string | null {
    return this.config.get<string>('FACEBOOK_APP_ID')?.trim() || null;
  }

  getAppSecret(): string | null {
    return this.config.get<string>('FACEBOOK_APP_SECRET')?.trim() || null;
  }

  getOAuthRedirectUriRaw(): string | null {
    return this.config.get<string>('FACEBOOK_OAUTH_REDIRECT_URI')?.trim() || null;
  }

  getMissingRequired(): string[] {
    const missing: string[] = [];
    if (!this.getAppId()) missing.push('FACEBOOK_APP_ID');
    if (!this.getAppSecret()) missing.push('FACEBOOK_APP_SECRET');
    if (!this.getOAuthRedirectUriRaw()) missing.push('FACEBOOK_OAUTH_REDIRECT_URI');
    return missing;
  }

  getRecommendedMissing(): string[] {
    const missing: string[] = [];
    if (!this.config.get<string>('SOCIAL_TOKEN_ENCRYPTION_KEY')?.trim()) {
      missing.push('SOCIAL_TOKEN_ENCRYPTION_KEY');
    }
    if (!this.config.get<string>('FACEBOOK_WEBHOOK_VERIFY_TOKEN')?.trim()) {
      missing.push('FACEBOOK_WEBHOOK_VERIFY_TOKEN');
    }
    return missing;
  }

  isConfigured(): boolean {
    return this.getMissingRequired().length === 0;
  }

  configurationErrorMessage(): string {
    return 'Facebook propojení není nakonfigurováno administrátorem.';
  }

  resolveApiPublicBase(): string | null {
    const raw =
      this.config.get<string>('API_PUBLIC_URL')?.trim().replace(/\/+$/, '') ||
      this.config.get<string>('NEXT_PUBLIC_API_URL')?.trim().replace(/\/+$/, '') ||
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

  getConfigStatus(): FacebookConfigStatusDto {
    const missing = this.getMissingRequired();
    const oauthRedirectUri =
      this.getOAuthRedirectUriRaw()?.replace(/\/+$/, '') ??
      (this.resolveApiPublicBase()
        ? `${this.resolveApiPublicBase()}/social/facebook/callback`
        : null);

    return {
      configured: missing.length === 0,
      missing,
      oauthRedirectUri,
      webhookUri: this.buildWebhookUri(),
      recommendedMissing: this.getRecommendedMissing(),
    };
  }
}
