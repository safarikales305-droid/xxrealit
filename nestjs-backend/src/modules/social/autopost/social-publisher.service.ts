import { Injectable, Logger } from '@nestjs/common';
import { resolveFrontendUrl } from '../../../common/resolve-frontend-url';
import { FacebookConfigService } from '../facebook/facebook-config.service';
import { GRAPH_API, GRAPH_VIDEO_API } from '../facebook/facebook-page.constants';
import {
  buildGraphUrl,
  fetchFacebookGraphJson,
  parseFacebookGraphError,
  redactGraphBody,
  stripAccessTokenFromUrl,
  type GraphAccountsPage,
  type ParsedFacebookGraphError,
} from './facebook-graph-autopost.util';
import { SocialAutopostSettingsService } from './social-autopost-settings.service';
import { maskAccessToken } from './social-autopost.types';
import { facebookPostPermalink } from './social-publish-format.util';

export type FacebookPublishPayload = {
  message: string;
  link?: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
};

export type FacebookPublishResult = {
  externalPostId: string;
  publishedUrl: string;
  usedVideo: boolean;
  raw: unknown;
};

export type FacebookTestConnectionResult = {
  ok: boolean;
  pageName?: string;
  pageId?: string;
  tokenSource?: 'stored_page_token' | 'me_accounts';
  maskedToken?: string | null;
  error?: string;
  hint?: string;
  graphError?: Omit<ParsedFacebookGraphError, 'raw'>;
};

export type FacebookTestPublishResult = {
  ok: boolean;
  externalPostId?: string;
  publishedUrl?: string;
  tokenSource?: 'stored_page_token' | 'me_accounts';
  error?: string;
  hint?: string;
  graphError?: Omit<ParsedFacebookGraphError, 'raw'>;
};

class FacebookGraphPublishError extends Error {
  readonly graphError?: Omit<ParsedFacebookGraphError, 'raw'>;
  readonly hint?: string;

  constructor(parsed: ParsedFacebookGraphError) {
    super(parsed.userMessage);
    this.name = 'FacebookGraphPublishError';
    this.graphError = {
      httpStatus: parsed.httpStatus,
      message: parsed.message,
      type: parsed.type,
      code: parsed.code,
      error_subcode: parsed.error_subcode,
      fbtrace_id: parsed.fbtrace_id,
      userMessage: parsed.userMessage,
      hint: parsed.hint,
    };
    this.hint = parsed.hint;
  }
}

@Injectable()
export class SocialPublisherService {
  private readonly logger = new Logger(SocialPublisherService.name);

  constructor(
    private readonly settings: SocialAutopostSettingsService,
    private readonly fbConfig: FacebookConfigService,
  ) {}

  async publishToInstagram(): Promise<never> {
    throw new Error('Instagram autopost zatím není implementován.');
  }

  async publishToYoutube(): Promise<never> {
    throw new Error('YouTube autopost zatím není implementován.');
  }

  async publishToTiktok(): Promise<never> {
    throw new Error('TikTok autopost zatím není implementován.');
  }

  private graphApiBase(): string {
    const graphVersion = this.fbConfig.getGraphApiVersion();
    return GRAPH_API.replace(/v[\d.]+/, graphVersion);
  }

  private graphVideoApiBase(): string {
    const graphVersion = this.fbConfig.getGraphApiVersion();
    return GRAPH_VIDEO_API.replace(/v[\d.]+/, graphVersion);
  }

  private publicSiteUrl(): string {
    return (
      process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
      resolveFrontendUrl() ||
      'https://www.xxrealit.cz'
    ).replace(/\/+$/, '');
  }

  private logGraphFailure(
    action: string,
    context: {
      pageId: string;
      endpoint: string;
      payload?: Record<string, unknown>;
      httpStatus: number;
      error: ParsedFacebookGraphError;
      maskedToken?: string | null;
    },
  ) {
    this.logger.error(
      [
        `[facebook-autopost] ${action} FAILED`,
        `pageId=${context.pageId}`,
        `endpoint=${stripAccessTokenFromUrl(context.endpoint)}`,
        context.payload ? `payload=${JSON.stringify(redactGraphBody(context.payload))}` : null,
        `httpStatus=${context.httpStatus}`,
        `error.message=${context.error.message}`,
        context.error.type ? `error.type=${context.error.type}` : null,
        context.error.code != null ? `error.code=${context.error.code}` : null,
        context.error.error_subcode != null ? `error.error_subcode=${context.error.error_subcode}` : null,
        context.error.fbtrace_id ? `error.fbtrace_id=${context.error.fbtrace_id}` : null,
        context.maskedToken ? `token=${context.maskedToken}` : null,
      ]
        .filter(Boolean)
        .join(' | '),
    );
  }

  private toPublicGraphError(error: ParsedFacebookGraphError): Omit<ParsedFacebookGraphError, 'raw'> {
    const { raw: _raw, ...rest } = error;
    return rest;
  }

  /**
   * Page Access Token: preferuje access_token z GET /me/accounts, jinak uložený token pokud GET /{pageId} projde.
   */
  private async resolvePageAccessToken(
    pageId: string,
    storedToken: string,
  ): Promise<
    | { ok: true; token: string; source: 'stored_page_token' | 'me_accounts' }
    | { ok: false; error: ParsedFacebookGraphError }
  > {
    const graphApi = this.graphApiBase();
    const masked = maskAccessToken(storedToken);

    const accountsUrl = buildGraphUrl(
      graphApi,
      '/me/accounts',
      { fields: 'id,name,access_token', limit: '100' },
      storedToken,
    );
    this.logger.log(
      `[facebook-autopost] resolve token: GET /me/accounts pageId=${pageId} token=${masked} url=${stripAccessTokenFromUrl(accountsUrl)}`,
    );

    const accountsRes = await fetchFacebookGraphJson<{ data?: GraphAccountsPage[] }>(accountsUrl);
    if (accountsRes.ok) {
      const match = (accountsRes.data.data ?? []).find((p) => p.id === pageId);
      const pageToken = match?.access_token?.trim();
      if (pageToken) {
        this.logger.log(
          `[facebook-autopost] Page Access Token from /me/accounts pageId=${pageId} pageName=${match?.name ?? '?'}`,
        );
        return { ok: true, token: pageToken, source: 'me_accounts' };
      }
    } else {
      this.logGraphFailure('me_accounts', {
        pageId,
        endpoint: accountsUrl,
        httpStatus: accountsRes.status,
        error: accountsRes.error,
        maskedToken: masked,
      });
    }

    const pageUrl = buildGraphUrl(
      graphApi,
      `/${encodeURIComponent(pageId)}`,
      { fields: 'id,name' },
      storedToken,
    );
    this.logger.log(
      `[facebook-autopost] resolve token: GET page pageId=${pageId} token=${masked} url=${stripAccessTokenFromUrl(pageUrl)}`,
    );

    const pageRes = await fetchFacebookGraphJson<{ id?: string; name?: string }>(pageUrl);
    if (pageRes.ok) {
      return { ok: true, token: storedToken, source: 'stored_page_token' };
    }

    this.logGraphFailure('resolve_page_token', {
      pageId,
      endpoint: pageUrl,
      httpStatus: pageRes.status,
      error: pageRes.error,
      maskedToken: masked,
    });

    if (!accountsRes.ok) {
      return { ok: false, error: accountsRes.error };
    }

    const ids = (accountsRes.data.data ?? []).map((p) => p.id).filter(Boolean).join(', ') || 'žádné';
    const error = parseFacebookGraphError(400, {
      error: {
        message: `Page ID ${pageId} není mezi stránkami z /me/accounts (${ids}).`,
        type: 'OAuthException',
        code: 100,
      },
    });
    error.userMessage =
      'Page ID neodpovídá žádné stránce dostupné tokenem. Zkontrolujte Page ID nebo použijte Page Access Token z /me/accounts.';
    error.hint =
      'Token vypadá jako User Access Token bez přístupu k této stránce, nebo je Page ID špatně. Pro publikování použijte Page Access Token s oprávněním pages_manage_posts.';
    return { ok: false, error };
  }

  async publishToFacebook(payload: FacebookPublishPayload): Promise<FacebookPublishResult> {
    const pageId = this.settings.resolveFacebookPageId();
    const storedToken = this.settings.resolveFacebookPageAccessToken();
    if (!pageId || !storedToken) {
      throw new Error('Facebook Page ID nebo access token chybí.');
    }

    const resolved = await this.resolvePageAccessToken(pageId, storedToken);
    if (!resolved.ok) {
      throw new Error(resolved.error.userMessage);
    }
    const accessToken = resolved.token;

    const graphApi = this.graphApiBase();
    const videoApi = this.graphVideoApiBase();

    if (payload.videoUrl) {
      try {
        const result = await this.postVideo(
          `${videoApi}/${pageId}/videos`,
          pageId,
          accessToken,
          payload.videoUrl,
          payload.message,
        );
        await this.settings.appendApiLog({
          action: 'publish_video',
          ok: true,
          body: result.raw,
        });
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Facebook video publish failed, fallback to image: ${message}`);
        await this.settings.appendApiLog({
          action: 'publish_video',
          ok: false,
          body: { error: message },
        });
      }
    }

    if (payload.imageUrl) {
      try {
        const result = await this.postPhoto(
          `${graphApi}/${pageId}/photos`,
          pageId,
          accessToken,
          payload.imageUrl,
          payload.message,
        );
        await this.settings.appendApiLog({
          action: 'publish_photo',
          ok: true,
          body: result.raw,
        });
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Facebook photo publish failed, fallback to feed: ${message}`);
        await this.settings.appendApiLog({
          action: 'publish_photo',
          ok: false,
          body: { error: message },
        });
      }
    }

    const result = await this.postFeed(
      `${graphApi}/${pageId}/feed`,
      pageId,
      accessToken,
      payload.message,
      payload.link,
      'publish_feed',
    );
    await this.settings.appendApiLog({
      action: 'publish_feed',
      ok: true,
      body: result.raw,
    });
    return result;
  }

  private async postVideo(
    url: string,
    pageId: string,
    accessToken: string,
    videoUrl: string,
    description: string,
  ): Promise<FacebookPublishResult> {
    const payload = {
      access_token: accessToken,
      file_url: videoUrl,
      description,
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const raw = await res.json().catch(() => ({}));
    if (!res.ok) {
      const parsed = parseFacebookGraphError(res.status, raw);
      this.logGraphFailure('publish_video', {
        pageId,
        endpoint: url,
        payload,
        httpStatus: res.status,
        error: parsed,
        maskedToken: maskAccessToken(accessToken),
      });
      throw new FacebookGraphPublishError(parsed);
    }
    const id = typeof (raw as { id?: string }).id === 'string' ? (raw as { id: string }).id : '';
    if (!id) throw new Error('Facebook API nevrátilo ID videa.');
    return {
      externalPostId: id,
      publishedUrl: `https://www.facebook.com/${id}`,
      usedVideo: true,
      raw,
    };
  }

  private async postPhoto(
    url: string,
    pageId: string,
    accessToken: string,
    imageUrl: string,
    caption: string,
  ): Promise<FacebookPublishResult> {
    const payload = {
      access_token: accessToken,
      url: imageUrl,
      caption,
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const raw = await res.json().catch(() => ({}));
    if (!res.ok) {
      const parsed = parseFacebookGraphError(res.status, raw);
      this.logGraphFailure('publish_photo', {
        pageId,
        endpoint: url,
        payload,
        httpStatus: res.status,
        error: parsed,
        maskedToken: maskAccessToken(accessToken),
      });
      throw new FacebookGraphPublishError(parsed);
    }
    const o = raw as { post_id?: string; id?: string };
    const postId = typeof o.post_id === 'string' ? o.post_id : typeof o.id === 'string' ? o.id : '';
    if (!postId) throw new Error('Facebook API nevrátilo ID příspěvku.');
    return {
      externalPostId: postId,
      publishedUrl: facebookPostPermalink(pageId, postId),
      usedVideo: false,
      raw,
    };
  }

  private async postFeed(
    url: string,
    pageId: string,
    accessToken: string,
    message: string,
    link: string | undefined,
    logAction: string,
  ): Promise<FacebookPublishResult> {
    const payload: Record<string, string> = {
      access_token: accessToken,
      message,
    };
    if (link?.trim()) payload.link = link.trim();

    this.logger.log(
      `[facebook-autopost] ${logAction}: POST ${url} pageId=${pageId} token=${maskAccessToken(accessToken)} payload=${JSON.stringify(redactGraphBody(payload))}`,
    );

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const raw = await res.json().catch(() => ({}));

    await this.settings.appendApiLog({
      action: logAction,
      ok: res.ok,
      statusCode: res.status,
      body: raw,
    });

    if (!res.ok) {
      const parsed = parseFacebookGraphError(res.status, raw);
      this.logGraphFailure(logAction, {
        pageId,
        endpoint: url,
        payload,
        httpStatus: res.status,
        error: parsed,
        maskedToken: maskAccessToken(accessToken),
      });
      throw new FacebookGraphPublishError(parsed);
    }

    const postId = typeof (raw as { id?: string }).id === 'string' ? (raw as { id: string }).id : '';
    if (!postId) throw new Error('Facebook API nevrátilo ID příspěvku.');
    return {
      externalPostId: postId,
      publishedUrl: facebookPostPermalink(pageId, postId),
      usedVideo: false,
      raw,
    };
  }

  async testFacebookConnection(): Promise<FacebookTestConnectionResult> {
    const pageId = this.settings.resolveFacebookPageId();
    const storedToken = this.settings.resolveFacebookPageAccessToken();
    if (!pageId || !storedToken) {
      return { ok: false, error: 'Chybí Page ID nebo access token.' };
    }

    const resolved = await this.resolvePageAccessToken(pageId, storedToken);
    if (!resolved.ok) {
      return {
        ok: false,
        error: resolved.error.userMessage,
        hint: resolved.error.hint,
        graphError: this.toPublicGraphError(resolved.error),
      };
    }

    const graphApi = this.graphApiBase();
    const url = buildGraphUrl(
      graphApi,
      `/${encodeURIComponent(pageId)}`,
      { fields: 'id,name' },
      resolved.token,
    );

    this.logger.log(
      `[facebook-autopost] test_connection: GET ${stripAccessTokenFromUrl(url)} token=${maskAccessToken(resolved.token)}`,
    );

    const res = await fetchFacebookGraphJson<{ id?: string; name?: string }>(url);
    await this.settings.appendApiLog({
      action: 'test_connection',
      ok: res.ok,
      statusCode: res.status,
      body: res.ok ? res.data : res.error,
    });

    if (!res.ok) {
      this.logGraphFailure('test_connection', {
        pageId,
        endpoint: url,
        httpStatus: res.status,
        error: res.error,
        maskedToken: maskAccessToken(resolved.token),
      });
      return {
        ok: false,
        pageId,
        error: res.error.userMessage,
        hint: res.error.hint,
        graphError: this.toPublicGraphError(res.error),
      };
    }

    const name = typeof res.data.name === 'string' ? res.data.name : undefined;
    return {
      ok: true,
      pageId,
      pageName: name,
      tokenSource: resolved.source,
      maskedToken: maskAccessToken(resolved.token),
    };
  }

  async testFacebookPublish(): Promise<FacebookTestPublishResult> {
    const pageId = this.settings.resolveFacebookPageId();
    const storedToken = this.settings.resolveFacebookPageAccessToken();
    if (!pageId || !storedToken) {
      return {
        ok: false,
        error: 'Chybí Page ID nebo access token. Uložte nastavení Facebook autopostu.',
      };
    }

    const resolved = await this.resolvePageAccessToken(pageId, storedToken);
    if (!resolved.ok) {
      return {
        ok: false,
        error: resolved.error.userMessage,
        hint: resolved.error.hint,
        graphError: this.toPublicGraphError(resolved.error),
      };
    }

    const publicUrl = this.publicSiteUrl();
    const message = 'Testovací příspěvek z portálu XXREALIT';
    const graphApi = this.graphApiBase();
    const feedUrl = `${graphApi}/${encodeURIComponent(pageId)}/feed`;

    try {
      const result = await this.postFeed(
        feedUrl,
        pageId,
        resolved.token,
        message,
        publicUrl,
        'test_publish',
      );

      if (resolved.source === 'me_accounts') {
        this.logger.warn(
          `[facebook-autopost] test_publish used token from /me/accounts — uložte Page Access Token do administrace pro trvalé použití.`,
        );
      }

      return {
        ok: true,
        externalPostId: result.externalPostId,
        publishedUrl: result.publishedUrl,
        tokenSource: resolved.source,
      };
    } catch (err) {
      if (err instanceof FacebookGraphPublishError) {
        return {
          ok: false,
          error: err.message,
          hint: err.hint,
          graphError: err.graphError,
        };
      }
      const messageText = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        error: messageText,
      };
    }
  }
}
