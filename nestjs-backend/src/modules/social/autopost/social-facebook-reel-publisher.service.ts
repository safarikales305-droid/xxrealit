import { Injectable, Logger } from '@nestjs/common';
import { FacebookPostType } from '@prisma/client';
import { FacebookConfigService } from '../facebook/facebook-config.service';
import { GRAPH_API } from '../facebook/facebook-page.constants';
import {
  parseFacebookGraphError,
  redactGraphBody,
  FacebookGraphPublishError,
  stripAccessTokenFromUrl,
} from './facebook-graph-autopost.util';
import { maskAccessToken } from './social-autopost.types';
import {
  facebookReelPermalink,
  validateRemoteVideoForFacebook,
} from './social-facebook-reel.util';
import type { FacebookPublishResult } from './social-autopost.types';

type ReelStartResponse = {
  video_id?: string;
  upload_url?: string;
};

type ReelFinishResponse = {
  success?: boolean;
  video_id?: string;
  post_id?: string;
  message?: string;
};

@Injectable()
export class SocialFacebookReelPublisherService {
  private readonly logger = new Logger(SocialFacebookReelPublisherService.name);

  constructor(private readonly fbConfig: FacebookConfigService) {}

  private graphApiBase(): string {
    const graphVersion = this.fbConfig.getGraphApiVersion();
    return GRAPH_API.replace(/v[\d.]+/, graphVersion);
  }

  async publishReel(input: {
    pageId: string;
    accessToken: string;
    videoUrl: string;
    description: string;
    title?: string;
  }): Promise<FacebookPublishResult> {
    const videoCheck = await validateRemoteVideoForFacebook(input.videoUrl);
    if (!videoCheck.ok) {
      throw new Error(videoCheck.error ?? 'Video není vhodné pro Reels.');
    }

    const graphApi = this.graphApiBase();
    const pageId = input.pageId;
    const accessToken = input.accessToken;

    const startUrl = `${graphApi}/${encodeURIComponent(pageId)}/video_reels`;
    const startPayload = {
      upload_phase: 'start',
      access_token: accessToken,
    };

    this.logger.log(
      `[facebook-reel] start pageId=${pageId} token=${maskAccessToken(accessToken)}`,
    );

    const startRes = await fetch(startUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(startPayload),
    });
    const startRaw = await startRes.json().catch(() => ({}));
    if (!startRes.ok) {
      throw new FacebookGraphPublishError(parseFacebookGraphError(startRes.status, startRaw));
    }

    const startData = startRaw as ReelStartResponse;
    const videoId = startData.video_id?.trim();
    const uploadUrl =
      startData.upload_url?.trim() ||
      (videoId ? `https://rupload.facebook.com/video-upload/${videoId}` : null);

    if (!videoId || !uploadUrl) {
      throw new Error('Facebook Reels API nevrátilo video_id ani upload_url.');
    }

    this.logger.log(
      `[facebook-reel] upload videoId=${videoId} file_url=${input.videoUrl.slice(0, 80)}`,
    );

    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `OAuth ${accessToken}`,
        file_url: input.videoUrl,
      },
    });
    const uploadRaw = await uploadRes.text();
    let uploadJson: unknown = {};
    try {
      uploadJson = JSON.parse(uploadRaw);
    } catch {
      uploadJson = { body: uploadRaw.slice(0, 500) };
    }

    if (!uploadRes.ok) {
      const parsed = parseFacebookGraphError(uploadRes.status, uploadJson);
      this.logger.error(
        `[facebook-reel] upload FAILED videoId=${videoId} ${stripAccessTokenFromUrl(uploadUrl)}`,
      );
      throw new FacebookGraphPublishError(parsed);
    }

    const finishUrl = `${graphApi}/${encodeURIComponent(pageId)}/video_reels`;
    const finishPayload: Record<string, string> = {
      upload_phase: 'finish',
      video_id: videoId,
      video_state: 'PUBLISHED',
      description: input.description,
      access_token: accessToken,
    };
    if (input.title?.trim()) {
      finishPayload.title = input.title.trim();
    }

    this.logger.log(
      `[facebook-reel] finish videoId=${videoId} payload=${JSON.stringify(redactGraphBody(finishPayload))}`,
    );

    const finishRes = await fetch(finishUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(finishPayload),
    });
    const finishRaw = await finishRes.json().catch(() => ({}));
    if (!finishRes.ok) {
      throw new FacebookGraphPublishError(parseFacebookGraphError(finishRes.status, finishRaw));
    }

    const finishData = finishRaw as ReelFinishResponse;
    const postId = finishData.post_id?.trim() || videoId;
    const publishedUrl = facebookReelPermalink(videoId);

    return {
      externalPostId: postId,
      externalReelId: videoId,
      publishedUrl,
      reelPublishedUrl: publishedUrl,
      usedVideo: true,
      facebookPostType: FacebookPostType.FACEBOOK_REEL,
      raw: finishRaw,
    };
  }
}
