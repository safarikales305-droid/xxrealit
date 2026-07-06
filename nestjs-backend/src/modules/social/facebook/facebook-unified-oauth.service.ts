import { Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';
import { MetaConnectOAuthService } from '../../meta-center/meta-connect-oauth.service';
import { META_CENTER_OAUTH_STATE_PREFIX } from '../../meta-center/meta-connect.constants';
import { SocialAutopostFacebookOAuthService } from '../autopost/social-autopost-facebook-oauth.service';
import { FacebookAuthService } from './facebook-auth.service';
import { FacebookPageService, type FacebookOAuthCallbackResult } from './facebook-page.service';

export type UnifiedOAuthCallbackResult = FacebookOAuthCallbackResult & {
  message?: string;
  pageReviewRequired?: boolean;
  pageScopesNotAvailable?: boolean;
};

@Injectable()
export class FacebookUnifiedOAuthService {
  private readonly logger = new Logger(FacebookUnifiedOAuthService.name);

  constructor(
    private readonly facebookAuth: FacebookAuthService,
    private readonly facebookPage: FacebookPageService,
    private readonly metaConnectOAuth: MetaConnectOAuthService,
    private readonly autopostOAuth: SocialAutopostFacebookOAuthService,
  ) {}

  private extractQuery(req: Request): Record<string, string | undefined> {
    const raw = req.query as Record<string, string | string[] | undefined>;
    const out: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (Array.isArray(value)) out[key] = value[0];
      else if (typeof value === 'string') out[key] = value;
      else if (value != null) out[key] = String(value);
    }
    return out;
  }

  private wantsJsonResponse(req: Request): boolean {
    const acceptHeader = req.headers.accept ?? '';
    return req.query.format === 'json' || acceptHeader.includes('application/json');
  }

  /**
   * Jediný Meta OAuth callback — routuje podle `state` prefixu:
   * x* Meta Centrum (Business, Catalog, Pixel, Dataset)
   * l* Facebook Login
   * a*, c* Pages / account connect
   * p* Pages (legacy)
   * m* Admin autopost
   */
  async dispatch(req: Request): Promise<UnifiedOAuthCallbackResult> {
    const q = this.extractQuery(req);
    const state = q.state?.trim() ?? '';
    const code = q.code;
    const oauthError = q.error;
    const errorReason = q.error_reason;
    const errorDescription = q.error_description;

    this.logger.log(
      `UNIFIED_OAUTH_DISPATCH statePrefix=${state.slice(0, 1) || '?'} codePresent=${Boolean(code)} error=${oauthError ?? 'none'}`,
    );

    if (state.startsWith(META_CENTER_OAUTH_STATE_PREFIX)) {
      const result = await this.metaConnectOAuth.handleCallbackFromRequest(req);
      return result;
    }

    if (state.startsWith('m')) {
      const result = await this.autopostOAuth.handleCallback(
        code,
        state,
        oauthError,
        errorReason,
        errorDescription,
      );
      return result;
    }

    if (
      state.startsWith('a') ||
      state.startsWith('c') ||
      state.startsWith('p') ||
      oauthError ||
      errorReason ||
      errorDescription
    ) {
      return this.facebookPage.handlePageCallback(
        code,
        state,
        oauthError,
        errorReason,
        errorDescription,
      );
    }

    if (state.startsWith('l')) {
      return this.facebookAuth.handleLoginCallback(code, state, {
        returnTokenInBody: this.wantsJsonResponse(req),
      });
    }

    if (oauthError || errorReason || errorDescription) {
      return {
        ok: false,
        redirectUrl: this.facebookAuth.getErrorRedirectUrl(
          errorDescription ?? errorReason ?? oauthError ?? 'oauth_denied',
        ),
      };
    }

    if (!code) {
      return {
        ok: false,
        redirectUrl: this.facebookAuth.getErrorRedirectUrl('missing_code'),
        message: 'Chybí authorization code a OAuth state.',
      };
    }

    return {
      ok: false,
      redirectUrl: this.facebookAuth.getErrorRedirectUrl('missing_state'),
      message: 'Neznámý OAuth state — zkuste připojení znovu.',
    };
  }
}
