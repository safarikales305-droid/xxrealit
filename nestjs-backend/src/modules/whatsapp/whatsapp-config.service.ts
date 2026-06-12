import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type WhatsAppConfigStatusDto = {
  configured: boolean;
  missing: string[];
  webhookUri: string | null;
  apiVersion: string;
};

@Injectable()
export class WhatsAppConfigService implements OnModuleInit {
  private readonly logger = new Logger(WhatsAppConfigService.name);

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const missing = this.getMissingRequired();
    if (missing.length > 0) {
      this.logger.warn(
        `[WhatsApp Cloud API] Není plně nakonfigurováno (chybí: ${missing.join(', ')}). ` +
          'wa.me tlačítka fungují bez API — Cloud API je volitelné.',
      );
      return;
    }
    this.logger.log('[WhatsApp Cloud API] Integrace připravena.');
  }

  getAccessToken(): string | null {
    return this.config.get<string>('WHATSAPP_ACCESS_TOKEN')?.trim() || null;
  }

  getPhoneNumberId(): string | null {
    return this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID')?.trim() || null;
  }

  getBusinessAccountId(): string | null {
    return this.config.get<string>('WHATSAPP_BUSINESS_ACCOUNT_ID')?.trim() || null;
  }

  getWebhookVerifyToken(): string | null {
    return this.config.get<string>('WHATSAPP_WEBHOOK_VERIFY_TOKEN')?.trim() || null;
  }

  getApiVersion(): string {
    return this.config.get<string>('WHATSAPP_API_VERSION')?.trim() || 'v20.0';
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
    return this.getMissingRequired().length === 0;
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
      missing,
      webhookUri: this.buildWebhookUri(),
      apiVersion: this.getApiVersion(),
    };
  }
}
