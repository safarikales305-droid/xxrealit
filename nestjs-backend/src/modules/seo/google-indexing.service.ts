import { Injectable, Logger } from '@nestjs/common';
import { SeoIndexStatus } from '@prisma/client';
import { SeoService } from './seo.service';

type ServiceAccount = {
  client_email?: string;
  private_key?: string;
};

@Injectable()
export class GoogleIndexingService {
  private readonly log = new Logger(GoogleIndexingService.name);

  constructor(private readonly seo: SeoService) {}

  async submitUrl(url: string): Promise<{ ok: boolean; error?: string }> {
    const settings = await this.seo.getSettings();
    if (!settings.googleIndexingApiEnabled) {
      return { ok: false, error: 'Google Indexing API není zapnuto v administraci.' };
    }
    const raw = settings.googleIndexingServiceAccountJson?.trim();
    if (!raw) {
      return { ok: false, error: 'Chybí service account JSON pro Google Indexing API.' };
    }

    let account: ServiceAccount;
    try {
      account = JSON.parse(raw) as ServiceAccount;
    } catch {
      return { ok: false, error: 'Neplatný JSON service accountu.' };
    }

    if (!account.client_email?.trim() || !account.private_key?.trim()) {
      return { ok: false, error: 'Service account musí obsahovat client_email a private_key.' };
    }

    try {
      const accessToken = await this.fetchAccessToken(account);
      const res = await fetch('https://indexing.googleapis.com/v3/urlNotifications:publish', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url, type: 'URL_UPDATED' }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          typeof body === 'object' && body && 'error' in body
            ? JSON.stringify((body as { error: unknown }).error)
            : `HTTP ${res.status}`;
        return { ok: false, error: msg };
      }
      this.log.log(`Google Indexing API: odesláno ${url}`);
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.log.warn(`Google Indexing API selhalo: ${message}`);
      return { ok: false, error: message };
    }
  }

  private async fetchAccessToken(account: ServiceAccount): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const claim = Buffer.from(
      JSON.stringify({
        iss: account.client_email,
        scope: 'https://www.googleapis.com/auth/indexing',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
      }),
    ).toString('base64url');
    const crypto = await import('node:crypto');
    const signInput = `${header}.${claim}`;
    const signature = crypto
      .createSign('RSA-SHA256')
      .update(signInput)
      .sign(account.private_key!.replace(/\\n/g, '\n'), 'base64url');
    const jwt = `${signInput}.${signature}`;
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });
    const data = (await res.json()) as { access_token?: string; error?: string };
    if (!res.ok || !data.access_token) {
      throw new Error(data.error ?? `OAuth token HTTP ${res.status}`);
    }
    return data.access_token;
  }
}
