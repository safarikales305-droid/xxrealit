import { Injectable } from '@nestjs/common';

export type YouTubeConfigDiagnostic = {
  name: string;
  present: boolean;
  purpose: string;
};

export type YouTubeConfigurationDiagnostics = {
  configured: boolean;
  missing: string[];
  redirectUri: string | null;
  clientIdEnv: 'GOOGLE_YOUTUBE_CLIENT_ID' | 'GOOGLE_CLIENT_ID' | null;
  clientSecretEnv: 'GOOGLE_YOUTUBE_CLIENT_SECRET' | 'GOOGLE_CLIENT_SECRET' | null;
  diagnostics: YouTubeConfigDiagnostic[];
};

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
    return this.getConfigurationDiagnostics().configured;
  }

  getConfigurationDiagnostics(): YouTubeConfigurationDiagnostics {
    const ytClientId = process.env.GOOGLE_YOUTUBE_CLIENT_ID?.trim();
    const genericClientId = process.env.GOOGLE_CLIENT_ID?.trim();
    const clientId = ytClientId || genericClientId || '';
    const clientIdEnv = ytClientId
      ? 'GOOGLE_YOUTUBE_CLIENT_ID'
      : genericClientId
        ? 'GOOGLE_CLIENT_ID'
        : null;

    const ytSecret = process.env.GOOGLE_YOUTUBE_CLIENT_SECRET?.trim();
    const genericSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
    const clientSecret = ytSecret || genericSecret || '';
    const clientSecretEnv = ytSecret
      ? 'GOOGLE_YOUTUBE_CLIENT_SECRET'
      : genericSecret
        ? 'GOOGLE_CLIENT_SECRET'
        : null;

    const explicitRedirect = process.env.GOOGLE_YOUTUBE_REDIRECT_URI?.trim();
    const api = process.env.API_PUBLIC_URL?.trim() || process.env.NEXT_PUBLIC_API_URL?.trim();
    let redirectUri: string | null = null;
    if (explicitRedirect) {
      redirectUri = explicitRedirect;
    } else if (api) {
      const base = api.replace(/\/+$/, '').replace(/\/api$/, '');
      redirectUri = `${base}/api/social/youtube/oauth/callback`;
    }

    const diagnostics: YouTubeConfigDiagnostic[] = [
      {
        name: 'GOOGLE_YOUTUBE_CLIENT_ID',
        present: Boolean(ytClientId || genericClientId),
        purpose: 'Google OAuth Client ID pro YouTube upload',
      },
      {
        name: 'GOOGLE_YOUTUBE_CLIENT_SECRET',
        present: Boolean(ytSecret || genericSecret),
        purpose: 'Google OAuth Client Secret pro YouTube upload',
      },
      {
        name: 'GOOGLE_YOUTUBE_REDIRECT_URI',
        present: Boolean(explicitRedirect || api),
        purpose: 'OAuth callback URL (nebo API_PUBLIC_URL pro odvození)',
      },
    ];

    const missing: string[] = [];
    if (!clientId) missing.push('GOOGLE_YOUTUBE_CLIENT_ID nebo GOOGLE_CLIENT_ID');
    if (!clientSecret) missing.push('GOOGLE_YOUTUBE_CLIENT_SECRET nebo GOOGLE_CLIENT_SECRET');
    if (!redirectUri) {
      missing.push('GOOGLE_YOUTUBE_REDIRECT_URI nebo API_PUBLIC_URL / NEXT_PUBLIC_API_URL');
    }

    return {
      configured: missing.length === 0,
      missing,
      redirectUri,
      clientIdEnv,
      clientSecretEnv,
      diagnostics,
    };
  }
}
