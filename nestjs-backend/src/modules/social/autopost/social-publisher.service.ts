import { Injectable, Logger } from '@nestjs/common';
import {
  FacebookPostType,
  PostSocialPublishStatus,
  PostSocialPublishType,
  SocialPlatform,
  SocialPublishKind,
} from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { FacebookConfigService } from '../facebook/facebook-config.service';
import { SocialPlatformStubService } from '../social-platform.stub';
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
import { ListingReelFinalVideoService } from './listing-reel-final-video.service';
import { PostSocialPublishService } from './post-social-publish.service';
import { propertyHasPublishableVideo, validateRemoteVideoForFacebook } from './social-facebook-reel.util';
import { maskAccessToken, type FacebookPublishResult } from './social-autopost.types';
import {
  buildPostFacebookMessage,
  buildVideoReelFacebookMessage,
  facebookPostPermalink,
  getPublicPortalUrl,
  resolvePostShareImage,
  resolvePostShareVideo,
  resolvePostSocialText,
} from './social-publish-format.util';
import {
  buildFacebookPostMessage,
  getFacebookDestinationUrl,
  isValidFacebookDestinationUrl,
  type FacebookDestinationPost,
} from './facebook-post-destination.util';
import { verifyPublicPostResolvable } from '../../posts/public-post-resolve.util';
import { NewsEditorialSettingsService } from '../../news-editorial/news-editorial-settings.service';
import { SocialInstagramPublisherService, InstagramGraphPublishError } from './social-instagram-publisher.service';
import { SocialInstagramConnectionService } from './social-instagram-connection.service';
import { SocialInstagramCaptionService } from './social-instagram-caption.service';
import type { InstagramPublishResult } from './social-instagram.types';

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
    private readonly prisma: PrismaService,
    private readonly settings: SocialAutopostSettingsService,
    private readonly fbConfig: FacebookConfigService,
    private readonly tokenService: SocialAutopostTokenService,
    private readonly reelPublisher: SocialFacebookReelPublisherService,
    private readonly teaserService: FacebookVideoTeaserService,
    private readonly listingReelFinalVideo: ListingReelFinalVideoService,
    private readonly postSocialPublish: PostSocialPublishService,
    private readonly platformStub: SocialPlatformStubService,
    private readonly newsSettings: NewsEditorialSettingsService,
    private readonly instagramPublisher: SocialInstagramPublisherService,
    private readonly instagramConnection: SocialInstagramConnectionService,
    private readonly instagramCaption: SocialInstagramCaptionService,
  ) {}

  async getInstagramStatus() {
    return this.instagramConnection.getConnectionStatus();
  }

  async testInstagramConnection() {
    const status = await this.instagramConnection.getConnectionStatus();
    return { ok: status.connected && status.scopesOk, ...status };
  }

  async refreshInstagramConnection() {
    await this.instagramConnection.syncFromFacebookPage();
    return this.getInstagramStatus();
  }

  async testInstagramPublish(caption?: string): Promise<InstagramPublishResult> {
    return this.instagramPublisher.publishTestPhoto(caption);
  }

  async publishToInstagram(): Promise<never> {
    throw new Error('Použijte publishPropertyToInstagram nebo publishPostToPlatform(INSTAGRAM).');
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
  async publishUserPostToFacebook(
    input: {
      description: string;
      publicUrl: string;
      imageUrl: string | null;
      videoUrl: string | null;
      title?: string;
    },
    opts: { forceFormat?: FacebookPostType } = {},
  ): Promise<FacebookPublishResult> {
    await this.settings.reload();
    const { facebook: fb, global } = this.settings.getSettings();
    const publicUrl = input.publicUrl.replace(/\/+$/, '');
    const contentTitle = input.title?.trim() || null;
    const videoUrl = input.videoUrl?.trim() || null;

    const wantsReel =
      opts.forceFormat === FacebookPostType.FACEBOOK_REEL ||
      (Boolean(videoUrl) &&
        opts.forceFormat !== FacebookPostType.FACEBOOK_POST &&
        global.publishVideosAsReels !== false &&
        fb.publishPostVideosAsReels !== false);

    if (wantsReel && videoUrl) {
      const reelMessage = buildVideoReelFacebookMessage(publicUrl, input.description);
      try {
        this.logger.log(`Příprava video teaseru pro Facebook Reel (uživatelský příspěvek)`);
        const shareVideo = await this.teaserService.prepareVideoForSocialShare(videoUrl);
        this.logger.log(
          `Teaser pro Reel: délka=${shareVideo.teaserDurationSec}s, drawtext=${shareVideo.drawtextUsed === true}, soubor=${shareVideo.teaserLocalPath ?? '—'}, url=${shareVideo.teaserUrl}`,
        );
        if (shareVideo.drawtextSkippedReason) {
          this.logger.log(`drawtext přeskočen: ${shareVideo.drawtextSkippedReason}`);
        }
        const reel = await this.publishPropertyAsFacebookReel({
          videoUrl: shareVideo.teaserUrl,
          message: reelMessage,
          title: contentTitle ?? undefined,
        });
        this.logger.log(
          `Facebook Reel publikován: reelId=${reel.externalReelId ?? reel.externalPostId}, url=${reel.publishedUrl}`,
        );
        return {
          ...reel,
          publishKind: SocialPublishKind.VIDEO_REEL,
          facebookPostType: FacebookPostType.FACEBOOK_REEL,
          contentTitle,
          externalReelId: reel.externalReelId ?? reel.externalPostId,
          reelPublishedUrl: reel.publishedUrl,
          teaserDurationSec: shareVideo.teaserDurationSec || null,
          originalVideoDurationSec: shareVideo.originalDurationSec,
          teaserUrl: shareVideo.teaserUrl,
          teaserLocalPath: shareVideo.teaserLocalPath ?? null,
          teaserDrawtextUsed: shareVideo.drawtextUsed ?? false,
          teaserDrawtextSkippedReason: shareVideo.drawtextSkippedReason ?? null,
        };
      } catch (err) {
        const teaserError = err instanceof Error ? err.message : String(err);
        this.logger.error(`Facebook Reel (video příspěvek) selhal: ${teaserError}`);
        throw new Error(`Facebook Reel se nepodařilo publikovat: ${teaserError}`);
      }
    }

    if (
      input.imageUrl?.trim() &&
      !videoUrl &&
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
      listingContext?: {
        propertyTypeKey?: string | null;
        propertyType?: string | null;
        offerType?: string | null;
        title?: string | null;
        description?: string | null;
      };
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
        const shareVideo = await this.teaserService.prepareVideoForSocialShare(input.videoUrl.trim());
        const video = await this.publishVideoPost(input.message, shareVideo.teaserUrl);
        return {
          ...video,
          publishKind: SocialPublishKind.LISTING,
          contentTitle,
          teaserDurationSec: shareVideo.teaserDurationSec,
          originalVideoDurationSec: shareVideo.originalDurationSec,
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
        const finalVideo = await this.listingReelFinalVideo.buildFinalVideo({
          sourceVideoUrl: input.videoUrl.trim(),
          listingContext: input.listingContext,
        });
        const shareVideo = {
          teaserUrl: finalVideo.finalVideoUrl,
          teaserDurationSec: finalVideo.teaserDurationSec,
          originalDurationSec: finalVideo.originalDurationSec,
          teaserLocalPath: finalVideo.teaserLocalPath ?? null,
          drawtextUsed: finalVideo.drawtextUsed ?? false,
          drawtextSkippedReason: finalVideo.drawtextSkippedReason ?? null,
          introVideoUsed: finalVideo.introVideoUsed,
          introVideoPropertyType: finalVideo.introVideoPropertyType,
          introVideoDurationSec: finalVideo.introVideoDurationSec,
          totalReelDurationSec: finalVideo.totalReelDurationSec,
          introVideoError: finalVideo.introVideoError,
          introVideoId: finalVideo.introVideoIdUsed,
          introVideoTitle: finalVideo.introVideoTitle,
          sourceListingVideoUrl: finalVideo.sourceListingVideoUrl,
          finalVideoUrl: finalVideo.finalVideoUrl,
          finalVideoGeneratedAt: finalVideo.finalVideoGeneratedAt,
          finalVideoSizeBytes: finalVideo.finalVideoSizeBytes,
          composeLog: finalVideo.composeLog,
        };
        this.logger.log(
          `Reel inzerátu: ukázka=${shareVideo.teaserDurationSec}s, úvod=${shareVideo.introVideoUsed ? `${shareVideo.introVideoTitle ?? shareVideo.introVideoId} (${shareVideo.introVideoPropertyType})` : 'ne'}, celkem=${shareVideo.totalReelDurationSec ?? shareVideo.teaserDurationSec}s, final=${shareVideo.finalVideoUrl}`,
        );
        const reel = await this.publishPropertyAsFacebookReel({
          videoUrl: shareVideo.teaserUrl,
          message: reelMessage,
          title: contentTitle ?? undefined,
        });
        return {
          ...reel,
          publishKind: SocialPublishKind.VIDEO_REEL,
          contentTitle,
          externalReelId: reel.externalReelId ?? reel.externalPostId,
          reelPublishedUrl: reel.publishedUrl,
          teaserDurationSec: shareVideo.teaserDurationSec,
          originalVideoDurationSec: shareVideo.originalDurationSec,
          teaserUrl: shareVideo.teaserUrl,
          teaserLocalPath: shareVideo.teaserLocalPath ?? null,
          teaserDrawtextUsed: shareVideo.drawtextUsed ?? false,
          teaserDrawtextSkippedReason: shareVideo.drawtextSkippedReason ?? null,
          introVideoUsed: shareVideo.introVideoUsed ?? false,
          introVideoPropertyType: shareVideo.introVideoPropertyType ?? null,
          introVideoDurationSec: shareVideo.introVideoDurationSec ?? null,
          totalReelDurationSec: shareVideo.totalReelDurationSec ?? null,
          introVideoError: shareVideo.introVideoError ?? null,
          introVideoId: shareVideo.introVideoId ?? null,
          introVideoTitle: shareVideo.introVideoTitle ?? null,
          introVideoIdUsed: shareVideo.introVideoId ?? null,
          sourceListingVideoUrl: shareVideo.sourceListingVideoUrl ?? null,
          finalVideoUrl: shareVideo.finalVideoUrl ?? null,
          finalVideoGeneratedAt: shareVideo.finalVideoGeneratedAt ?? null,
          finalVideoSizeBytes: shareVideo.finalVideoSizeBytes ?? null,
          composeLog: shareVideo.composeLog ?? null,
        };
      } catch (err) {
        const teaserError = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Property reel/teaser failed: ${teaserError}`);
        if (fb.reelsFallbackToVideoPost !== false && input.videoUrl?.trim()) {
          try {
            const shareVideo = await this.teaserService.prepareVideoForSocialShare(input.videoUrl.trim());
            const video = await this.publishVideoPost(reelMessage, shareVideo.teaserUrl);
            return {
              ...video,
              publishKind: SocialPublishKind.LISTING,
              contentTitle,
              teaserDurationSec: shareVideo.teaserDurationSec,
              originalVideoDurationSec: shareVideo.originalDurationSec,
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

  async publishPostToPlatform(
    postId: string,
    platform: SocialPlatform,
    opts: { forceReel?: boolean } = {},
  ): Promise<FacebookPublishResult | { skipped: true; reason: string }> {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: {
        media: { orderBy: { order: 'asc' } },
        user: {
          select: {
            role: true,
            name: true,
            publicProfile: true,
            canPublishPosts: true,
            accountLimited: true,
            portalWorkerStatus: true,
          },
        },
      },
    });
    if (!post) throw new Error('Příspěvek nenalezen.');

    const newsCfg = this.newsSettings.getCached();
    const portalCheck = await verifyPublicPostResolvable(this.prisma, post);
    const portalUrl = portalCheck.ok ? portalCheck.generatedUrl : '';
    const fbPost = post as FacebookDestinationPost;
    const destinationUrl = getFacebookDestinationUrl(fbPost, newsCfg, portalUrl);

    if (!isValidFacebookDestinationUrl(destinationUrl)) {
      this.logger.warn(
        `INVALID_DESTINATION_URL postId=${postId} slug=${post.slug ?? 'null'} generatedUrl=${destinationUrl}`,
      );
      return { skipped: true, reason: 'INVALID_DESTINATION_URL' };
    }

    if (destinationUrl === portalUrl && !portalCheck.ok) {
      this.logger.warn(
        `INVALID_DESTINATION_URL postId=${postId} slug=${post.slug ?? 'null'} generatedUrl=${destinationUrl} reason=portal_not_resolvable`,
      );
      return { skipped: true, reason: 'INVALID_DESTINATION_URL' };
    }

    const message = buildFacebookPostMessage({
      post: fbPost,
      destinationUrl,
      settings: newsCfg,
    });

    const videoUrl = resolvePostShareVideo(post);
    const imageUrl = resolvePostShareImage(post);
    const publicUrl = destinationUrl;
    const publishType = videoUrl ? PostSocialPublishType.REEL : PostSocialPublishType.POST;

    await this.postSocialPublish.markStatus(postId, platform, {
      status: PostSocialPublishStatus.UPLOADING,
      publishType,
      errorMessage: null,
    });

    try {
      if (platform === SocialPlatform.FACEBOOK) {
        const result = await this.publishUserPostToFacebook(
          {
            description: message,
            publicUrl,
            imageUrl,
            videoUrl,
            title: post.title?.trim() || message.slice(0, 80) || undefined,
          },
          {
            forceFormat: videoUrl
              ? FacebookPostType.FACEBOOK_REEL
              : FacebookPostType.FACEBOOK_POST,
          },
        );

        await this.postSocialPublish.markStatus(postId, platform, {
          status: PostSocialPublishStatus.PUBLISHED,
          publishType:
            result.facebookPostType === FacebookPostType.FACEBOOK_REEL
              ? PostSocialPublishType.REEL
              : PostSocialPublishType.POST,
          externalId: result.externalReelId ?? result.externalPostId,
          externalUrl: result.reelPublishedUrl ?? result.publishedUrl,
          videoPreviewSeconds:
            result.teaserDurationSec != null ? Math.round(result.teaserDurationSec) : null,
          publishedAt: new Date(),
          errorMessage: result.teaserError ?? null,
        });

        await this.postSocialPublish.syncPostFacebookFields(postId, {
          externalPostId: result.externalPostId,
          publishedUrl: result.reelPublishedUrl ?? result.publishedUrl,
          externalReelId: result.externalReelId,
          facebookPostType: result.facebookPostType,
        });

        return result;
      }

      if (platform === SocialPlatform.INSTAGRAM) {
        await this.settings.reload();
        const cfg = this.settings.getSettings().instagram;
        if (!cfg?.enabled) {
          await this.postSocialPublish.markStatus(postId, platform, {
            status: PostSocialPublishStatus.FAILED,
            publishType,
            errorMessage: 'Instagram není zapnuto v administraci.',
          });
          return { skipped: true, reason: 'Instagram není zapnuto' };
        }

        const caption = await this.instagramCaption.buildCaption({
          title: post.title?.trim() || message.slice(0, 120),
          description: resolvePostSocialText(post).slice(0, 1500),
          author: post.user?.name ?? undefined,
          portal_url: portalCheck.ok ? portalCheck.generatedUrl : undefined,
          hashtags: '#xxrealit #reality #bydleni',
        });

        let igResult: InstagramPublishResult;
        if (videoUrl) {
          const shareVideo = await this.teaserService.prepareVideoForSocialShare(videoUrl);
          igResult = await this.instagramPublisher.publishReel({
            videoUrl: shareVideo.teaserUrl,
            caption,
          });
        } else if (imageUrl) {
          igResult = await this.instagramPublisher.publishPhoto({ imageUrl, caption });
        } else {
          throw new Error('Instagram vyžaduje foto nebo video — textový příspěvek bez média nelze publikovat.');
        }

        await this.postSocialPublish.markStatus(postId, platform, {
          status: PostSocialPublishStatus.PUBLISHED,
          publishType,
          externalId: igResult.externalPostId,
          externalUrl: igResult.publishedUrl,
          publishedAt: new Date(),
        });

        return {
          externalPostId: igResult.externalPostId,
          publishedUrl: igResult.publishedUrl,
          usedVideo: Boolean(videoUrl),
          raw: igResult.raw,
        };
      }

      if (
        platform === SocialPlatform.TIKTOK ||
        platform === SocialPlatform.YOUTUBE
      ) {
        await this.settings.reload();
        const cfg =
          this.settings.getSettings()[platform.toLowerCase() as 'instagram' | 'youtube' | 'tiktok'];
        if (!cfg?.enabled) {
          await this.postSocialPublish.markStatus(postId, platform, {
            status: PostSocialPublishStatus.FAILED,
            publishType,
            errorMessage: `${platform} není zapnuto v administraci.`,
          });
          return { skipped: true, reason: `${platform} není zapnuto` };
        }
        this.platformStub.uploadVideo(platform);
      }

      throw new Error(`Nepodporovaná platforma: ${platform}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const code =
        err instanceof InstagramGraphPublishError ? err.code : undefined;
      await this.postSocialPublish.markStatus(postId, platform, {
        status: PostSocialPublishStatus.FAILED,
        publishType,
        errorMessage: code ? `[${code}] ${message}` : message,
      });
      throw err;
    }
  }

  async publishPropertyToInstagram(
    input: {
      message: string;
      link: string;
      imageUrl: string | null;
      videoUrl: string | null;
      title?: string;
      category?: string;
      location?: string;
      author?: string;
      isShortsVideo?: boolean;
      listingContext?: {
        propertyTypeKey?: string | null;
        propertyType?: string | null;
        offerType?: string | null;
        title?: string | null;
        description?: string | null;
      };
    },
    opts: { forceReel?: boolean } = {},
  ): Promise<InstagramPublishResult> {
    const caption = await this.instagramCaption.buildCaption({
      title: input.title?.trim() || input.message.slice(0, 120),
      description: input.message.slice(0, 1500),
      category: input.category,
      location: input.location,
      author: input.author,
      portal_url: input.link,
      hashtags: '#xxrealit #reality #nemovitosti #bydleni',
    });

    const wantsReel =
      opts.forceReel !== false &&
      Boolean(input.videoUrl?.trim()) &&
      (input.isShortsVideo || propertyHasPublishableVideo({ videoUrl: input.videoUrl }));

    if (wantsReel && input.videoUrl?.trim()) {
      const finalVideo = await this.listingReelFinalVideo.buildFinalVideo({
        sourceVideoUrl: input.videoUrl.trim(),
        listingContext: input.listingContext,
      });
      return this.instagramPublisher.publishReel({
        videoUrl: finalVideo.finalVideoUrl,
        caption,
      });
    }

    if (input.imageUrl?.trim()) {
      return this.instagramPublisher.publishPhoto({
        imageUrl: input.imageUrl.trim(),
        caption,
      });
    }

    throw new Error('Instagram vyžaduje veřejné foto nebo video.');
  }
}
