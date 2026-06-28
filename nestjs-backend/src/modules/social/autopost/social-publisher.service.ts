import { Injectable, Logger } from '@nestjs/common';
import { FacebookConfigService } from '../facebook/facebook-config.service';
import { GRAPH_API, GRAPH_VIDEO_API } from '../facebook/facebook-page.constants';
import { SocialAutopostSettingsService } from './social-autopost-settings.service';
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

  async publishToFacebook(payload: FacebookPublishPayload): Promise<FacebookPublishResult> {
    const pageId = this.settings.resolveFacebookPageId();
    const accessToken = this.settings.resolveFacebookPageAccessToken();
    if (!pageId || !accessToken) {
      throw new Error('Facebook Page ID nebo access token chybí.');
    }

    const graphVersion = this.fbConfig.getGraphApiVersion();
    const videoApi = GRAPH_VIDEO_API.replace(/v[\d.]+/, graphVersion);
    const graphApi = GRAPH_API.replace(/v[\d.]+/, graphVersion);

    if (payload.videoUrl) {
      try {
        const result = await this.postVideo(
          `${videoApi}/${pageId}/videos`,
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
      accessToken,
      payload.message,
      payload.link,
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
    accessToken: string,
    videoUrl: string,
    description: string,
  ): Promise<FacebookPublishResult> {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: accessToken,
        file_url: videoUrl,
        description,
      }),
    });
    const raw = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(this.graphError(raw) ?? `HTTP ${res.status}`);
    }
    const id = typeof raw.id === 'string' ? raw.id : '';
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
    accessToken: string,
    imageUrl: string,
    caption: string,
  ): Promise<FacebookPublishResult> {
    const pageId = this.settings.resolveFacebookPageId()!;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: accessToken,
        url: imageUrl,
        caption,
      }),
    });
    const raw = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(this.graphError(raw) ?? `HTTP ${res.status}`);
    }
    const postId = typeof raw.post_id === 'string' ? raw.post_id : typeof raw.id === 'string' ? raw.id : '';
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
    accessToken: string,
    message: string,
    link?: string,
  ): Promise<FacebookPublishResult> {
    const pageId = this.settings.resolveFacebookPageId()!;
    const body: Record<string, string> = {
      access_token: accessToken,
      message,
    };
    if (link?.trim()) body.link = link.trim();

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const raw = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(this.graphError(raw) ?? `HTTP ${res.status}`);
    }
    const postId = typeof raw.id === 'string' ? raw.id : '';
    if (!postId) throw new Error('Facebook API nevrátilo ID příspěvku.');
    return {
      externalPostId: postId,
      publishedUrl: facebookPostPermalink(pageId, postId),
      usedVideo: false,
      raw,
    };
  }

  private graphError(raw: unknown): string | null {
    if (!raw || typeof raw !== 'object') return null;
    const o = raw as { error?: { message?: string } };
    return o.error?.message?.trim() || null;
  }

  async testFacebookConnection(): Promise<{ ok: boolean; pageName?: string; error?: string }> {
    const pageId = this.settings.resolveFacebookPageId();
    const accessToken = this.settings.resolveFacebookPageAccessToken();
    if (!pageId || !accessToken) {
      return { ok: false, error: 'Chybí Page ID nebo access token.' };
    }

    const graphVersion = this.fbConfig.getGraphApiVersion();
    const graphApi = GRAPH_API.replace(/v[\d.]+/, graphVersion);
    const res = await fetch(
      `${graphApi}/${encodeURIComponent(pageId)}?fields=name,id&access_token=${encodeURIComponent(accessToken)}`,
    );
    const raw = await res.json().catch(() => ({}));
    await this.settings.appendApiLog({
      action: 'test_connection',
      ok: res.ok,
      statusCode: res.status,
      body: raw,
    });
    if (!res.ok) {
      return { ok: false, error: this.graphError(raw) ?? `HTTP ${res.status}` };
    }
    const name = typeof (raw as { name?: string }).name === 'string' ? (raw as { name: string }).name : undefined;
    return { ok: true, pageName: name };
  }

  async testFacebookPublish(): Promise<FacebookPublishResult> {
    const publicUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://www.xxrealit.cz';
    return this.publishToFacebook({
      message: `🧪 Testovací příspěvek z administrace XXREALIT\n\n${new Date().toLocaleString('cs-CZ')}\n\n${publicUrl}\n\n#xxrealit`,
      link: publicUrl,
    });
  }
}
