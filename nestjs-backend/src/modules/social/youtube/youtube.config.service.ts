import { Injectable } from '@nestjs/common';

@Injectable()
export class YouTubeConfigService {
  getClientId(): string {
    const v =
      process.env.GOOGLE_YOUTUBE_CLIENT_ID?.trim() ||
      process.env.GOOGLE_CLIENT_ID?.trim() ||
      '';
    if (!v) throw new Error('GOOGLE_YOUTUBE_CLIENT_ID není nastaveno.');
    return v;
  }

  getClientSecret(): string {
    const v =
      process.env.GOOGLE_YOUTUBE_CLIENT_SECRET?.trim() ||
      process.env.GOOGLE_CLIENT_SECRET?.trim() ||
      '';
    if (!v) throw new Error('GOOGLE_YOUTUBE_CLIENT_SECRET není nastaveno.');
    return v;
  }

  getRedirectUri(): string {
    const explicit = process.env.GOOGLE_YOUTUBE_REDIRECT_URI?.trim();
    if (explicit) return explicit;
    const api = process.env.API_PUBLIC_URL?.trim() || process.env.NEXT_PUBLIC_API_URL?.trim();
    if (!api) throw new Error('GOOGLE_YOUTUBE_REDIRECT_URI nebo API_PUBLIC_URL není nastaveno.');
    const base = api.replace(/\/+$/, '').replace(/\/api$/, '');
    return `${base}/api/social/youtube/oauth/callback`;
  }

  getFrontendUrl(): string {
    return (
      process.env.FRONTEND_URL?.trim() ||
      process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
      'https://www.xxrealit.cz'
    ).replace(/\/+$/, '');
  }

  isConfigured(): boolean {
    try {
      this.getClientId();
      this.getClientSecret();
      this.getRedirectUri();
      return true;
    } catch {
      return false;
    }
  }
}
