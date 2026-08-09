import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type HotelbedsEnvironment = 'evaluation' | 'production';

const DEFAULT_BOOKING_BASE: Record<HotelbedsEnvironment, string> = {
  evaluation: 'https://api.test.hotelbeds.com/hotel-api/1.0',
  production: 'https://api.hotelbeds.com/hotel-api/1.0',
};

const DEFAULT_CONTENT_BASE: Record<HotelbedsEnvironment, string> = {
  evaluation: 'https://api.test.hotelbeds.com/hotel-content-api/1.0',
  production: 'https://api.hotelbeds.com/hotel-content-api/1.0',
};

@Injectable()
export class HotelbedsConfigService {
  constructor(private readonly config: ConfigService) {}

  get apiKey(): string | undefined {
    return this.config.get<string>('HOTELBEDS_API_KEY')?.trim() || undefined;
  }

  get apiSecret(): string | undefined {
    return this.config.get<string>('HOTELBEDS_API_SECRET')?.trim() || undefined;
  }

  get environment(): HotelbedsEnvironment {
    const raw = (this.config.get<string>('HOTELBEDS_ENV') ?? 'evaluation').trim().toLowerCase();
    return raw === 'production' ? 'production' : 'evaluation';
  }

  get bookingBaseUrl(): string {
    const override = this.config.get<string>('HOTELBEDS_BOOKING_BASE_URL')?.trim();
    if (override) return override.replace(/\/+$/, '');
    return DEFAULT_BOOKING_BASE[this.environment];
  }

  get contentBaseUrl(): string {
    const override = this.config.get<string>('HOTELBEDS_CONTENT_BASE_URL')?.trim();
    if (override) return override.replace(/\/+$/, '');
    return DEFAULT_CONTENT_BASE[this.environment];
  }

  /** Ostré rezervace jsou ve výchozím stavu zakázané. */
  get bookingEnabled(): boolean {
    return this.config.get<string>('HOTELBEDS_BOOKING_ENABLED')?.trim() === 'true';
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiSecret);
  }

  maskedApiKey(): string | null {
    const key = this.apiKey;
    if (!key) return null;
    if (key.length <= 8) return '********';
    return `${key.slice(0, 4)}${'*'.repeat(Math.max(4, key.length - 8))}${key.slice(-4)}`;
  }

  maskedSecret(): string {
    const secret = this.apiSecret;
    if (!secret) return '—';
    return '*'.repeat(Math.min(16, Math.max(8, secret.length)));
  }

  publicStatus() {
    return {
      provider: 'Hotelbeds',
      environment: this.environment,
      configured: this.isConfigured(),
      apiKeyMasked: this.maskedApiKey(),
      apiSecretMasked: this.maskedSecret(),
      bookingBaseUrl: this.bookingBaseUrl,
      contentBaseUrl: this.contentBaseUrl,
      bookingEnabled: this.bookingEnabled,
    };
  }
}
