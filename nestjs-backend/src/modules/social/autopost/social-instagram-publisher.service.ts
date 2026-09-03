import { Injectable, Logger } from '@nestjs/common';
import { FacebookConfigService } from '../facebook/facebook-config.service';
import { GRAPH_API } from '../facebook/facebook-page.constants';
import { SocialAutopostSettingsService } from './social-autopost-settings.service';
import { SocialInstagramConnectionService } from './social-instagram-connection.service';
import { assertPublicInstagramMediaUrl } from './social-instagram-media.util';
import type {
  InstagramContainerStatus,
  InstagramMediaType,
  InstagramPublishResult,
} from './social-instagram.types';

type GraphError = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
};

type ContainerStatusResponse = {
  status_code?: string;
  status?: string;
  id?: string;
};

const MAX_POLL_ATTEMPTS = 45;
const TRANSIENT_PATTERN = /rate limit|429|timeout|temporarily|5\d{2}|ECONNRESET/i;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class InstagramGraphPublishError extends Error {
  constructor(
    message: string,
    readonly code?: number | null,
    readonly subcode?: number | null,
    readonly raw?: unknown,
  ) {
    super(message);
    this.name = 'InstagramGraphPublishError';
  }
}

@Injectable()
export class SocialInstagramPublisherService {
  private readonly logger = new Logger(SocialInstagramPublisherService.name);

  constructor(
    private readonly settings: SocialAutopostSettingsService,
    private readonly fbConfig: FacebookConfigService,
    private readonly connection: SocialInstagramConnectionService,
  ) {}

  private graphBase(): string {
    const v = this.fbConfig.getGraphApiVersion();
    return GRAPH_API.replace(/v[\d.]+/, v.startsWith('v') ? v : `v${v}`);
  }

  private async resolvePublishContext(): Promise<{ igUserId: string; accessToken: string }> {
    await this.settings.reload();
    const token = this.settings.resolveFacebookPageAccessToken();
    if (!token) {
      throw new InstagramGraphPublishError('Chybí Page Access Token — připojte Facebook stránku.');
    }
    const status = await this.connection.getConnectionStatus();
    if (!status.instagramBusinessId) {
      throw new InstagramGraphPublishError(
        status.message ?? 'Instagram Business účet není propojen.',
      );
    }
    if (!status.scopesOk) {
      throw new InstagramGraphPublishError(
        `Chybí oprávnění: ${status.missingScopes.join(', ')}. Obnovte Meta propojení.`,
      );
    }
    return { igUserId: status.instagramBusinessId, accessToken: token };
  }

  private parseGraphError(raw: unknown, httpStatus: number): InstagramGraphPublishError {
    const body = raw as GraphError;
    const msg =
      body.error?.message ??
      (typeof raw === 'object' && raw && 'message' in raw
        ? String((raw as { message: unknown }).message)
        : `Graph API HTTP ${httpStatus}`);
    return new InstagramGraphPublishError(
      msg,
      body.error?.code ?? httpStatus,
      body.error?.error_subcode ?? null,
      raw,
    );
  }

  private isTransient(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return TRANSIENT_PATTERN.test(msg);
  }

  private mapContainerStatus(code?: string): InstagramContainerStatus {
    const c = (code ?? '').toUpperCase();
    if (c === 'FINISHED') return 'READY';
    if (c === 'IN_PROGRESS') return 'PROCESSING';
    if (c === 'ERROR' || c === 'EXPIRED') return 'FAILED';
    return 'UPLOADING';
  }

  private async postForm(
    path: string,
    accessToken: string,
    fields: Record<string, string>,
    attempt = 1,
  ): Promise<unknown> {
    const body = new URLSearchParams({ ...fields, access_token: accessToken });
    const url = `${this.graphBase()}/${path}`;
    try {
      const res = await fetch(url, { method: 'POST', body });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = this.parseGraphError(json, res.status);
        if (this.isTransient(err) && attempt < 4) {
          const delay = [10_000, 30_000, 90_000][attempt - 1] ?? 90_000;
          this.logger.warn(`IG transient error, retry ${attempt} in ${delay}ms: ${err.message}`);
          await sleep(delay);
          return this.postForm(path, accessToken, fields, attempt + 1);
        }
        throw err;
      }
      return json;
    } catch (err) {
      if (err instanceof InstagramGraphPublishError) throw err;
      if (this.isTransient(err) && attempt < 4) {
        const delay = [10_000, 30_000, 90_000][attempt - 1] ?? 90_000;
        await sleep(delay);
        return this.postForm(path, accessToken, fields, attempt + 1);
      }
      throw err;
    }
  }

  private async getJson(path: string, accessToken: string, query = ''): Promise<unknown> {
    const q = query ? `?${query}&` : '?';
    const url = `${this.graphBase()}/${path}${q}access_token=${encodeURIComponent(accessToken)}`;
    const res = await fetch(url);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw this.parseGraphError(json, res.status);
    return json;
  }

  private async waitForContainerReady(
    containerId: string,
    accessToken: string,
  ): Promise<InstagramContainerStatus> {
    for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
      const raw = (await this.getJson(
        containerId,
        accessToken,
        'fields=status_code,status',
      )) as ContainerStatusResponse;
      const mapped = this.mapContainerStatus(raw.status_code);
      this.logger.log(
        `IG container ${containerId} poll ${i + 1}: ${raw.status_code ?? raw.status ?? 'unknown'}`,
      );
      if (mapped === 'READY') return 'READY';
      if (mapped === 'FAILED') {
        throw new InstagramGraphPublishError(
          `Instagram zpracování média selhalo (${raw.status_code ?? 'ERROR'})`,
        );
      }
      const delay = Math.min(30_000, 2_000 + i * 1_500);
      await sleep(delay);
    }
    throw new InstagramGraphPublishError('Timeout čekání na zpracování Instagram média.');
  }

  async publishPhoto(input: {
    imageUrl: string;
    caption: string;
  }): Promise<InstagramPublishResult> {
    const imageUrl = assertPublicInstagramMediaUrl(input.imageUrl, 'Foto');
    const { igUserId, accessToken } = await this.resolvePublishContext();

    const created = (await this.postForm(`${igUserId}/media`, accessToken, {
      image_url: imageUrl,
      caption: input.caption.slice(0, 2200),
    })) as { id?: string };

    const containerId = created.id?.trim();
    if (!containerId) throw new InstagramGraphPublishError('Chybí creation_id z Instagram API.');

    await this.waitForContainerReady(containerId, accessToken);

    const published = (await this.postForm(`${igUserId}/media_publish`, accessToken, {
      creation_id: containerId,
    })) as { id?: string };

    const mediaId = published.id?.trim();
    if (!mediaId) throw new InstagramGraphPublishError('Chybí media ID po publikaci.');

    const permalink = await this.resolvePermalink(mediaId, accessToken);

    await this.settings.appendApiLog({
      action: 'instagram_publish_photo',
      ok: true,
      body: { containerId, mediaId, permalink },
    });

    return {
      externalPostId: mediaId,
      publishedUrl: permalink,
      containerId,
      mediaType: 'PHOTO',
      raw: published,
    };
  }

  async publishReel(input: {
    videoUrl: string;
    caption: string;
  }): Promise<InstagramPublishResult> {
    const videoUrl = assertPublicInstagramMediaUrl(input.videoUrl, 'Reel video');
    const { igUserId, accessToken } = await this.resolvePublishContext();

    const created = (await this.postForm(`${igUserId}/media`, accessToken, {
      media_type: 'REELS',
      video_url: videoUrl,
      caption: input.caption.slice(0, 2200),
    })) as { id?: string };

    const containerId = created.id?.trim();
    if (!containerId) throw new InstagramGraphPublishError('Chybí creation_id pro Reel.');

    await this.waitForContainerReady(containerId, accessToken);

    const published = (await this.postForm(`${igUserId}/media_publish`, accessToken, {
      creation_id: containerId,
    })) as { id?: string };

    const mediaId = published.id?.trim();
    if (!mediaId) throw new InstagramGraphPublishError('Chybí media ID po publikaci Reelu.');

    const permalink = await this.resolvePermalink(mediaId, accessToken);

    await this.settings.appendApiLog({
      action: 'instagram_publish_reel',
      ok: true,
      body: { containerId, mediaId, permalink },
    });

    return {
      externalPostId: mediaId,
      publishedUrl: permalink,
      containerId,
      mediaType: 'REEL',
      raw: published,
    };
  }

  private async resolvePermalink(mediaId: string, accessToken: string): Promise<string> {
    try {
      const raw = (await this.getJson(mediaId, accessToken, 'fields=permalink')) as {
        permalink?: string;
      };
      if (raw.permalink?.trim()) return raw.permalink.trim();
    } catch {
      /* fallback */
    }
    return `https://www.instagram.com/`;
  }

  async publishTestPhoto(caption?: string): Promise<InstagramPublishResult> {
    const portal = 'https://www.xxrealit.cz';
    const imageUrl =
      'https://res.cloudinary.com/demo/image/upload/sample.jpg';
    return this.publishPhoto({
      imageUrl,
      caption:
        caption?.trim() ||
        `Test XXREALIT integrace Instagram\n\n${new Date().toISOString()}\n\nVíce na XXREALIT.cz\n\n#xxrealit #test`,
    });
  }
}
