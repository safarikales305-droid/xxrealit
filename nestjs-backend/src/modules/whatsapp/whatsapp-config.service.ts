import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WhatsAppSettingsService } from './whatsapp-settings.service';

export type WhatsAppConfigStatusDto = {
  configured: boolean;
  enabled: boolean;
  missing: string[];
  webhookUri: string | null;
  apiVersion: string;
};

@Injectable()
export class WhatsAppConfigService {
  private readonly logger = new Logger(WhatsAppConfigService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly settings: WhatsAppSettingsService,
  ) {}

  getAccessToken(): string | null {
    return this.settings.getEffectiveConfig().accessToken;
  }

  getPhoneNumberId(): string | null {
    return this.settings.getEffectiveConfig().phoneNumberId;
  }

  getBusinessAccountId(): string | null {
    return this.settings.getEffectiveConfig().businessAccountId;
  }

  getWebhookVerifyToken(): string | null {
    return this.settings.getEffectiveConfig().webhookVerifyToken;
  }

  isEnabled(): boolean {
    return this.settings.getEffectiveConfig().enabled;
  }

  getBatchSize(): number {
    return this.settings.getEffectiveConfig().batchSize;
  }

  getBatchDelayMs(): number {
    return this.settings.getEffectiveConfig().batchDelayMs;
  }

  getTestPhone(): string | null {
    return this.settings.getEffectiveConfig().testPhone;
  }

  getApiVersion(): string {
    return this.config.get<string>('WHATSAPP_API_VERSION')?.trim() || 'v23.0';
  }

  /** Meta App ID (Pages / Marketing aplikace) — pouze pro zobrazení. */
  getMetaAppId(): string | null {
    return (
      this.config.get<string>('FACEBOOK_PAGES_APP_ID')?.trim() ||
      this.config.get<string>('FACEBOOK_LOGIN_APP_ID')?.trim() ||
      this.config.get<string>('FACEBOOK_APP_ID')?.trim() ||
      null
    );
  }

  /** Meta Business ID — pouze pro zobrazení, není WABA ID. */
  getMetaBusinessId(): string | null {
    return (
      this.config.get<string>('META_BUSINESS_ID')?.trim() ||
      this.config.get<string>('FACEBOOK_BUSINESS_ID')?.trim() ||
      null
    );
  }

  getMissingRequired(): string[] {
    const missing: string[] = [];
    if (!this.getAccessToken()) missing.push('WHATSAPP_ACCESS_TOKEN');
    if (!this.getPhoneNumberId()) missing.push('WHATSAPP_PHONE_NUMBER_ID');
    if (!this.getBusinessAccountId()) missing.push('WHATSAPP_BUSINESS_ACCOUNT_ID');
    if (!this.getWebhookVerifyToken()) missing.push('WHATSAPP_WEBHOOK_VERIFY_TOKEN');
    return missing;
  }

  isCloudApiConfigured(): boolean {
    return this.isEnabled() && this.getMissingRequired().length === 0;
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
    return base ? `${base}/whatsapp/webhook` : null;
  }

  getConfigStatus(): WhatsAppConfigStatusDto {
    const missing = this.getMissingRequired();
    return {
      configured: missing.length === 0,
      enabled: this.isEnabled(),
      missing,
      webhookUri: this.buildWebhookUri(),
      apiVersion: this.getApiVersion(),
    };
  }

  logStartupStatus() {
    const missing = this.getMissingRequired();
    if (!this.isEnabled()) {
      this.logger.warn(
        '[WhatsApp Cloud API] Integrace je v administraci vypnutá — wa.me tlačítka fungují bez API.',
      );
      return;
    }
    if (missing.length > 0) {
      this.logger.warn(
        `[WhatsApp Cloud API] Není plně nakonfigurováno (chybí: ${missing.join(', ')}).`,
      );
      return;
    }
    this.logger.log('[WhatsApp Cloud API] Integrace připravena.');
  }
}
