import { Injectable, Logger } from '@nestjs/common';
import { TikTokConfigService } from './tiktok.config.service';
import { TikTokApiError } from './tiktok.errors';
import { TIKTOK_RATE_LIMIT_PER_MINUTE } from './tiktok.constants';

type TikTokApiResponse<T> = {
  data?: T;
  error?: {
    code?: string;
    message?: string;
    log_id?: string;
  };
};

@Injectable()
export class TikTokApiClient {
  private readonly logger = new Logger(TikTokApiClient.name);
  private readonly requestTimestamps: number[] = [];

  constructor(private readonly config: TikTokConfigService) {}

  private async throttle() {
    const now = Date.now();
    const windowStart = now - 60_000;
    while (this.requestTimestamps.length && this.requestTimestamps[0] < windowStart) {
      this.requestTimestamps.shift();
    }
    if (this.requestTimestamps.length >= TIKTOK_RATE_LIMIT_PER_MINUTE) {
      const waitMs = this.requestTimestamps[0] + 60_000 - now + 250;
      this.logger.warn(`TikTok rate limit — waiting ${waitMs}ms`);
      await new Promise((r) => setTimeout(r, Math.max(waitMs, 1000)));
    }
    this.requestTimestamps.push(Date.now());
  }

  private async parseJson<T>(res: Response): Promise<TikTokApiResponse<T>> {
    const text = await res.text();
    try {
      return JSON.parse(text) as TikTokApiResponse<T>;
    } catch {
      throw new TikTokApiError(`TikTok API neplatná odpověď (${res.status})`, res.status, text);
    }
  }

  private assertOk<T>(res: Response, body: TikTokApiResponse<T>): T {
    if (!res.ok || body.error?.code) {
      const msg = body.error?.message ?? `HTTP ${res.status}`;
      throw new TikTokApiError(msg, res.status, body, body.error?.code);
    }
    if (!body.data) {
      throw new TikTokApiError('TikTok API vrátilo prázdná data.', res.status, body);
    }
    return body.data;
  }

  async exchangeToken(params: Record<string, string>) {
    await this.throttle();
    const res = await fetch(`${this.config.getBaseUrl()}/v2/oauth/token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    });
    const body = await this.parseJson<{
      access_token: string;
      refresh_token: string;
      expires_in: number;
      refresh_expires_in?: number;
      open_id: string;
      scope: string;
    }>(res);
    return this.assertOk(res, body);
  }

  async refreshToken(refreshToken: string) {
    return this.exchangeToken({
      client_key: this.config.getClientKey(),
      client_secret: this.config.getClientSecret(),
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
  }

  async getUserInfo(accessToken: string) {
    await this.throttle();
    const url = `${this.config.getBaseUrl()}/v2/user/info/?fields=display_name,avatar_url,open_id`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const body = await this.parseJson<{ user: { display_name?: string; open_id?: string } }>(res);
    return this.assertOk(res, body);
  }

  async queryCreatorInfo(accessToken: string) {
    await this.throttle();
    const res = await fetch(`${this.config.getBaseUrl()}/v2/post/publish/creator_info/query/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({}),
    });
    const body = await this.parseJson<{
      creator_avatar_url?: string;
      creator_username?: string;
      privacy_level_options?: string[];
      max_video_post_duration_sec?: number;
    }>(res);
    return this.assertOk(res, body);
  }

  async initVideoPublish(
    accessToken: string,
    payload: {
      postInfo: Record<string, unknown>;
      sourceInfo: Record<string, unknown>;
      direct: boolean;
    },
  ) {
    await this.throttle();
    const endpoint = payload.direct
      ? '/v2/post/publish/video/init/'
      : '/v2/post/publish/inbox/video/init/';
    const res = await fetch(`${this.config.getBaseUrl()}${endpoint}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({
        post_info: payload.postInfo,
        source_info: payload.sourceInfo,
      }),
    });
    const body = await this.parseJson<{ publish_id: string }>(res);
    return this.assertOk(res, body);
  }

  async fetchPublishStatus(accessToken: string, publishId: string) {
    await this.throttle();
    const res = await fetch(`${this.config.getBaseUrl()}/v2/post/publish/status/fetch/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({ publish_id: publishId }),
    });
    const body = await this.parseJson<{
      status: string;
      fail_reason?: string;
      publicaly_available_post_id?: string[];
    }>(res);
    return this.assertOk(res, body);
  }
}
