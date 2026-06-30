import { Injectable, Logger } from '@nestjs/common';
import { FacebookPostType, SocialPublishKind } from '@prisma/client';
import { FacebookConfigService } from '../facebook/facebook-config.service';
import { GRAPH_API, GRAPH_VIDEO_API } from '../facebook/facebook-page.constants';
import {
  buildGraphUrl,
  fetchFacebookGraphJson,
  FacebookGraphPublishError,
  parseFacebookGraphError,
  redactGraphBody,
  stripAccessTokenFromUrl,
  type GraphAccountsPage,
  type ParsedFacebookGraphError,
} from './facebook-graph-autopost.util';
import { SocialAutopostSettingsService } from './social-autopost-settings.service';
import { SocialAutopostTokenService } from './social-autopost-token.service';
import { SocialFacebookReelPublisherService } from './social-facebook-reel-publisher.service';
import { FacebookVideoTeaserService } from './facebook-video-teaser.service';
import { propertyHasPublishableVideo, validateRemoteVideoForFacebook } from './social-facebook-reel.util';
import { maskAccessToken, type FacebookPublishResult } from './social-autopost.types';
import {
  buildPostFacebookMessage,
  buildVideoReelFacebookMessage,
  facebookPostPermalink,
  getPublicPortalUrl,
} from './social-publish-format.util';

export type FacebookPublishPayload = {
  message: string;
  link?: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
};

export type { FacebookPublishResult };

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

export { FacebookGraphPublishError };

@Injectable()
export class SocialPublisherService {
  private readonly logger = new Logger(SocialPublisherService.name);

  constructor(
    private readonly settings: SocialAutopostSettingsService,
    private readonly fbConfig: FacebookConfigService,
    private readonly tokenService: SocialAutopostTokenService,
    private readonly reelPublisher: SocialFacebookReelPublisherService,
    private readonly teaserService: FacebookVideoTeaserService,
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
    return getPublicPortalUrl();
  }

  /** Publikuje uživatelský příspěvek — foto / Reel (teaser) / odkaz. */
  async publishUserPostToFacebook(input: {
    description: string;
    publicUrl: string;
    imageUrl: string | null;
    videoUrl: string | null;
    title?: string;
  }): Promise<FacebookPublishResult> {
    await this.settings.reload();
    const { facebook: fb, global } = this.settings.getSettings();
    const publicUrl = input.publicUrl.replace(/\/+$/, '');
    const contentTitle = input.title?.trim() || null;

    if (input.videoUrl?.trim() && global.publishVideosAsReels !== false && fb.publishShortsAsReels !== false) {
      const reelMessage = buildVideoReelFacebookMessage(publicUrl);
      try {
        const teaser = await this.teaserService.createTeaserFromVideoUrl(input.videoUrl.trim());
        const reel = await this.publishPropertyAsFacebookReel({
          videoUrl: teaser.teaserUrl,
          message: reelMessage,
          title: contentTitle ?? undefined,
        });
        return {
          ...reel,
          publishKind: SocialPublishKind.VIDEO_REEL,
          contentTitle,
          externalReelId: reel.externalReelId ?? reel.externalPostId,
          reelPublishedUrl: reel.publishedUrl,
          teaserDurationSec: teaser.teaserDurationSec,
          originalVideoDurationSec: teaser.originalDurationSec,
        };
      } catch (err) {
        const teaserError = err instanceof Error ? err.message : String(err);
        this.logger.warn(`User post reel/teaser failed: ${teaserError}`);
        if (fb.reelsFallbackToVideoPost !== false) {
          try {
            const teaser = await this.teaserService.createTeaserFromVideoUrl(input.videoUrl.trim());
            const video = await this.publishVideoPost(reelMessage, teaser.teaserUrl);
            return {
              ...video,
              publishKind: SocialPublishKind.VIDEO_REEL,
              contentTitle,
              teaserDurationSec: teaser.teaserDurationSec,
              originalVideoDurationSec: teaser.originalDurationSec,
              teaserError,
            };
          } catch (videoErr) {
            this.logger.warn(
              `User post video fallback failed: ${videoErr instanceof Error ? videoErr.message : videoErr}`,
            );
          }
        }
        if (global.fallbackToLinkOnMediaFailure !== false) {
          const linkMessage = buildPostFacebookMessage(input.description, publicUrl);
          const fallback = await this.publishLinkOnly(linkMessage, publicUrl);
          return {
            ...fallback,
            publishKind: SocialPublishKind.USER_POST,
            contentTitle,
            teaserError,
          };
        }
        throw err;
      }
    }

    if (
      input.imageUrl?.trim() &&
      global.publishImagesAsPhotoPost !== false &&
      global.publishClassicAsPhotoPost !== false
    ) {
      const message = buildPostFacebookMessage(input.description, publicUrl);
      try {
        const photo = await this.publishPhotoPost(message, input.imageUrl.trim());
        return {
          ...photo,
          publishKind: SocialPublishKind.PHOTO_POST,
          contentTitle,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`User post photo failed, fallback to link: ${msg}`);
        if (global.fallbackToLinkOnMediaFailure === false) throw err;
      }
    }

    const message = buildPostFacebookMessage(input.description, publicUrl);
    const link = await this.publishLinkOnly(message, publicUrl);
    return {
      ...link,
      publishKind: SocialPublishKind.USER_POST,
      contentTitle,
    };
  }

  private async publishVideoPost(
    message: string,
    videoUrl: string,
  ): Promise<FacebookPublishResult> {
    const { pageId, accessToken } = await this.resolveAccessTokenForPublish();
    const videoApi = this.graphVideoApiBase();
    const result = await this.postVideo(
      `${videoApi}/${pageId}/videos`,
      pageId,
      accessToken,
      videoUrl,
      message,
    );
    await this.settings.appendApiLog({ action: 'publish_video', ok: true, body: result.raw });
    return { ...result, facebookPostType: FacebookPostType.FACEBOOK_VIDEO };
  }

  private async publishPhotoPost(
    message: string,
    imageUrl: string,
  ): Promise<FacebookPublishResult> {
    const { pageId, accessToken } = await this.resolveAccessTokenForPublish();
    const graphApi = this.graphApiBase();
    const result = await this.postPhoto(
      `${graphApi}/${pageId}/photos`,
      pageId,
      accessToken,
      imageUrl,
      message,
    );
    await this.settings.appendApiLog({ action: 'publish_photo', ok: true, body: result.raw });
    return result;
  }

  private async publishLinkOnly(message: string, link: string): Promise<FacebookPublishResult> {
    const { pageId, accessToken } = await this.resolveAccessTokenForPublish();
    const graphApi = this.graphApiBase();
    const result = await this.postFeed(
      `${graphApi}/${pageId}/feed`,
      pageId,
      accessToken,
      message,
      link,
      'publish_feed',
    );
    return result;
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

  private async getValidatedStoredToken(): Promise<string | null> {
    const ensured = await this.tokenService.ensureValidTokenBeforePublish();
    if (!ensured.ok || !ensured.token) {
      throw new Error(ensured.warning ?? 'Facebook token není platný.');
    }
    return ensured.token;
  }

  async publishToFacebook(payload: FacebookPublishPayload): Promise<FacebookPublishResult> {
    const pageId = this.settings.resolveFacebookPageId();
    const storedToken = await this.getValidatedStoredToken();
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
      facebookPostType: FacebookPostType.FACEBOOK_VIDEO,
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
      facebookPostType: FacebookPostType.FACEBOOK_POST,
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
      facebookPostType: FacebookPostType.FACEBOOK_POST,
      raw,
    };
  }

  async testFacebookConnection(): Promise<FacebookTestConnectionResult> {
    const pageId = this.settings.resolveFacebookPageId();
    let storedToken: string | null;
    try {
      storedToken = await this.getValidatedStoredToken();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Token není platný.';
      return { ok: false, error: message };
    }
    if (!pageId || !storedToken) {
      return { ok: false, error: 'Chybí Page ID nebo access token. Připojte Facebook přes OAuth.' };
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
    let storedToken: string | null;
    try {
      storedToken = await this.getValidatedStoredToken();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Token není platný.';
      return { ok: false, error: message };
    }
    if (!pageId || !storedToken) {
      return {
        ok: false,
        error: 'Chybí Page ID nebo access token. Připojte Facebook přes OAuth.',
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

  private async resolveAccessTokenForPublish(): Promise<{ pageId: string; accessToken: string }> {
    const pageId = this.settings.resolveFacebookPageId();
    const storedToken = await this.getValidatedStoredToken();
    if (!pageId || !storedToken) {
      throw new Error('Facebook Page ID nebo access token chybí.');
    }
    const resolved = await this.resolvePageAccessToken(pageId, storedToken);
    if (!resolved.ok) {
      throw new FacebookGraphPublishError(resolved.error);
    }
    return { pageId, accessToken: resolved.token };
  }

  /** Publikuje shorts/video inzerát jako Facebook Reel. */
  async publishPropertyAsFacebookReel(input: {
    videoUrl: string;
    message: string;
    title?: string;
  }): Promise<FacebookPublishResult> {
    const { pageId, accessToken } = await this.resolveAccessTokenForPublish();
    const videoUrl = input.videoUrl.trim();
    const check = await validateRemoteVideoForFacebook(videoUrl);
    if (!check.ok) {
      throw new Error(check.error ?? 'Video není dostupné pro Reels.');
    }
    const result = await this.reelPublisher.publishReel({
      pageId,
      accessToken,
      videoUrl,
      description: input.message,
      title: input.title,
    });
    await this.settings.appendApiLog({
      action: 'publish_reel',
      ok: true,
      body: result.raw,
    });
    return result;
  }

  /**
   * Publikuje inzerát — foto příspěvek, Reel (teaser) nebo odkaz jako fallback.
   */
  async publishPropertyToFacebook(
    input: {
      message: string;
      link: string;
      imageUrl: string | null;
      videoUrl: string | null;
      title?: string;
      isShortsVideo?: boolean;
    },
    opts: { forceFormat?: FacebookPostType } = {},
  ): Promise<FacebookPublishResult> {
    await this.settings.reload();
    const { facebook: fb, global } = this.settings.getSettings();
    const publicUrl = input.link.replace(/\/+$/, '');
    const contentTitle = input.title?.trim() || null;

    const wantsVideoPost =
      opts.forceFormat === FacebookPostType.FACEBOOK_VIDEO && Boolean(input.videoUrl?.trim());

    const wantsReel =
      !wantsVideoPost &&
      (opts.forceFormat === FacebookPostType.FACEBOOK_REEL ||
        (propertyHasPublishableVideo({ videoUrl: input.videoUrl }) &&
          opts.forceFormat !== FacebookPostType.FACEBOOK_POST &&
          fb.publishShortsAsReels !== false &&
          global.publishShortsAsReels !== false &&
          global.publishVideosAsReels !== false));

    if (wantsVideoPost && input.videoUrl?.trim()) {
      try {
        const teaser = await this.teaserService.createTeaserFromVideoUrl(input.videoUrl.trim());
        const video = await this.publishVideoPost(input.message, teaser.teaserUrl);
        return {
          ...video,
          publishKind: SocialPublishKind.LISTING,
          contentTitle,
          teaserDurationSec: teaser.teaserDurationSec,
          originalVideoDurationSec: teaser.originalDurationSec,
        };
      } catch (err) {
        const teaserError = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Property video post failed: ${teaserError}`);
        if (global.fallbackToLinkOnMediaFailure === false) throw err;
      }
    }

    if (wantsReel && input.videoUrl?.trim()) {
      const reelMessage = buildVideoReelFacebookMessage(publicUrl);
      try {
        const teaser = await this.teaserService.createTeaserFromVideoUrl(input.videoUrl.trim());
        const reel = await this.publishPropertyAsFacebookReel({
          videoUrl: teaser.teaserUrl,
          message: reelMessage,
          title: contentTitle ?? undefined,
        });
        return {
          ...reel,
          publishKind: SocialPublishKind.VIDEO_REEL,
          contentTitle,
          externalReelId: reel.externalReelId ?? reel.externalPostId,
          reelPublishedUrl: reel.publishedUrl,
          teaserDurationSec: teaser.teaserDurationSec,
          originalVideoDurationSec: teaser.originalDurationSec,
        };
      } catch (err) {
        const teaserError = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Property reel/teaser failed: ${teaserError}`);
        if (fb.reelsFallbackToVideoPost !== false && input.videoUrl?.trim()) {
          try {
            const teaser = await this.teaserService.createTeaserFromVideoUrl(input.videoUrl.trim());
            const video = await this.publishVideoPost(reelMessage, teaser.teaserUrl);
            return {
              ...video,
              publishKind: SocialPublishKind.LISTING,
              contentTitle,
              teaserDurationSec: teaser.teaserDurationSec,
              originalVideoDurationSec: teaser.originalDurationSec,
              teaserError,
            };
          } catch (videoErr) {
            this.logger.warn(
              `Property video fallback failed: ${videoErr instanceof Error ? videoErr.message : videoErr}`,
            );
          }
        }
        if (
          fb.reelsFallbackToPhotoPost !== false &&
          input.imageUrl?.trim() &&
          global.publishImagesAsPhotoPost !== false &&
          global.publishClassicAsPhotoPost !== false
        ) {
          try {
            const photo = await this.publishPhotoPost(input.message, input.imageUrl.trim());
            return {
              ...photo,
              publishKind: SocialPublishKind.LISTING,
              contentTitle,
              teaserError,
            };
          } catch (photoErr) {
            this.logger.warn(
              `Property photo fallback failed: ${photoErr instanceof Error ? photoErr.message : photoErr}`,
            );
          }
        }
        if (global.fallbackToLinkOnMediaFailure !== false) {
          const fallback = await this.publishLinkOnly(input.message, publicUrl);
          return {
            ...fallback,
            publishKind: SocialPublishKind.LISTING,
            contentTitle,
            teaserError,
          };
        }
        throw err;
      }
    }

    if (
      input.imageUrl?.trim() &&
      global.publishImagesAsPhotoPost !== false &&
      global.publishClassicAsPhotoPost !== false
    ) {
      try {
        const photo = await this.publishPhotoPost(input.message, input.imageUrl.trim());
        return {
          ...photo,
          publishKind: SocialPublishKind.LISTING,
          contentTitle,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Property photo failed, fallback to link: ${msg}`);
        if (global.fallbackToLinkOnMediaFailure === false) throw err;
      }
    }

    const fallback = await this.publishLinkOnly(input.message, publicUrl);
    return {
      ...fallback,
      publishKind: SocialPublishKind.LISTING,
      contentTitle,
    };
  }
}
