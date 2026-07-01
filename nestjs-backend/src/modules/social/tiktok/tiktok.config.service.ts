import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TikTokConfigService {
  constructor(private readonly config: ConfigService) {}

  getClientKey(): string {
    return this.config.get<string>('TIKTOK_CLIENT_KEY')?.trim() ?? '';
  }

  getClientSecret(): string {
    return this.config.get<string>('TIKTOK_CLIENT_SECRET')?.trim() ?? '';
  }

  getBaseUrl(): string {
    return (
      this.config.get<string>('TIKTOK_BASE_URL')?.trim().replace(/\/+$/, '') ||
      'https://open.tiktokapis.com'
    );
  }

  getRedirectUri(): string {
    const explicit = this.config.get<string>('TIKTOK_REDIRECT_URI')?.trim();
    if (explicit) return explicit;
    const frontend =
      this.config.get<string>('FRONTEND_URL')?.trim().replace(/\/+$/, '') ||
      'https://www.xxrealit.cz';
    return `${frontend}/api/tiktok/callback`;
  }

  getFrontendUrl(): string {
    return (
      this.config.get<string>('FRONTEND_URL')?.trim().replace(/\/+$/, '') ||
      'https://www.xxrealit.cz'
    );
  }

  isConfigured(): boolean {
    return Boolean(this.getClientKey() && this.getClientSecret());
  }

  maskClientKey(): string | null {
    const key = this.getClientKey();
    if (!key) return null;
    if (key.length <= 6) return '••••••';
    return `${key.slice(0, 4)}••••${key.slice(-4)}`;
  }

  maskSecret(): string | null {
    const secret = this.getClientSecret();
    if (!secret) return null;
    return '••••••••••••';
  }
}
