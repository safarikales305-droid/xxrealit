import { Injectable, Logger } from '@nestjs/common';
import { SocialAutopostSettingsService } from './social-autopost-settings.service';
import { SocialAutopostFacebookOAuthService } from './social-autopost-facebook-oauth.service';

const REFRESH_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

export type EnsureTokenResult = {
  ok: boolean;
  token: string | null;
  warning?: string;
};

@Injectable()
export class SocialAutopostTokenService {
  private readonly logger = new Logger(SocialAutopostTokenService.name);

  constructor(
    private readonly settings: SocialAutopostSettingsService,
    private readonly oauth: SocialAutopostFacebookOAuthService,
  ) {}

  /** Před každým publikováním — kontrola platnosti a automatická obnova. */
  async ensureValidTokenBeforePublish(): Promise<EnsureTokenResult> {
    await this.settings.reload();
    const pageToken = this.settings.resolveFacebookPageAccessToken();
    if (!pageToken) {
      const warning = 'Facebook není propojen — připojte stránku přes OAuth.';
      await this.settings.setTokenWarning(warning);
      return { ok: false, token: null, warning };
    }

    void this.settings.touchTokenLastUsed().catch(() => undefined);

    try {
      const debug = await this.oauth.debugToken(pageToken);
      if (!debug.is_valid) {
        return this.refreshOrFail('Page Access Token není platný.');
      }

      const expiresAtSec = debug.expires_at;
      if (expiresAtSec > 0) {
        const msLeft = expiresAtSec * 1000 - Date.now();
        if (msLeft <= 0) {
          return this.refreshOrFail('Page Access Token vypršel.');
        }
        if (msLeft < REFRESH_THRESHOLD_MS) {
          this.logger.log(
            `[admin-autopost-token] token expires in ${Math.ceil(msLeft / 86400000)} days — refreshing`,
          );
          const refreshed = await this.oauth.refreshPageAccessToken();
          if (refreshed.ok) {
            await this.settings.reload();
            await this.settings.setTokenWarning(null);
            return {
              ok: true,
              token: this.settings.resolveFacebookPageAccessToken(),
            };
          }
          const daysLeft = Math.ceil(msLeft / 86400000);
          const warning = `Token vyprší za ${daysLeft} dní. Automatická obnova selhala: ${refreshed.error ?? 'neznámá chyba'}. Klikněte na „Obnovit token“.`;
          await this.settings.setTokenWarning(warning);
          return { ok: true, token: pageToken, warning };
        }
      } else {
        const userToken = this.settings.resolveFacebookUserAccessToken();
        if (userToken) {
          const userDebug = await this.oauth.debugToken(userToken);
          if (userDebug.expires_at > 0) {
            const msLeft = userDebug.expires_at * 1000 - Date.now();
            if (msLeft > 0 && msLeft < REFRESH_THRESHOLD_MS) {
              const refreshed = await this.oauth.refreshPageAccessToken();
              if (refreshed.ok) {
                await this.settings.reload();
                return {
                  ok: true,
                  token: this.settings.resolveFacebookPageAccessToken(),
                };
              }
              const warning = `User token vyprší za ${Math.ceil(msLeft / 86400000)} dní. Obnovte přes OAuth.`;
              await this.settings.setTokenWarning(warning);
            }
          }
        }
      }

      await this.settings.setTokenWarning(null);
      return { ok: true, token: pageToken };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Kontrola tokenu selhala.';
      return this.refreshOrFail(message);
    }
  }

  private async refreshOrFail(reason: string): Promise<EnsureTokenResult> {
    this.logger.warn(`[admin-autopost-token] ${reason} — attempting refresh`);
    const refreshed = await this.oauth.refreshPageAccessToken();
    if (refreshed.ok) {
      await this.settings.reload();
      return {
        ok: true,
        token: this.settings.resolveFacebookPageAccessToken(),
      };
    }
    const warning = `${reason} Obnovte token přes OAuth (${refreshed.error ?? 'obnova selhala'}).`;
    await this.settings.setTokenWarning(warning);
    return { ok: false, token: null, warning };
  }
}
