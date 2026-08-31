import { Injectable, Logger } from '@nestjs/common';
import { YOUTUBE_DEFAULT_CATEGORY_ID, YOUTUBE_UPLOAD_BASE, type YoutubePrivacyStatus } from './youtube.constants';
import { YouTubeOAuthService } from './youtube-oauth.service';

export type YouTubeUploadInput = {
  videoUrl: string;
  title: string;
  description: string;
  tags: string[];
  privacyStatus: YoutubePrivacyStatus;
  thumbnailUrl?: string | null;
};

export type YouTubeUploadResult = {
  videoId: string;
  url: string;
  thumbnailUploaded: boolean;
};

@Injectable()
export class YouTubePublishService {
  private readonly log = new Logger(YouTubePublishService.name);

  constructor(private readonly oauth: YouTubeOAuthService) {}

  async uploadVideo(input: YouTubeUploadInput): Promise<YouTubeUploadResult> {
    const accessToken = await this.oauth.getValidAccessToken();
    const videoBytes = await this.downloadVideo(input.videoUrl);

    const metadata = {
      snippet: {
        title: input.title.slice(0, 100),
        description: input.description.slice(0, 4900),
        tags: input.tags.map((t) => t.slice(0, 30)).slice(0, 12),
        categoryId: YOUTUBE_DEFAULT_CATEGORY_ID,
      },
      status: {
        privacyStatus: input.privacyStatus,
        selfDeclaredMadeForKids: false,
      },
    };

    const initUrl = `${YOUTUBE_UPLOAD_BASE}/videos?uploadType=resumable&part=snippet,status`;
    const initRes = await fetch(initUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': 'video/mp4',
        'X-Upload-Content-Length': String(videoBytes.byteLength),
      },
      body: JSON.stringify(metadata),
    });

    if (!initRes.ok) {
      const err = await this.parseApiError(initRes);
      throw new Error(err);
    }

    const uploadUrl = initRes.headers.get('location');
    if (!uploadUrl) throw new Error('YouTube nevrátil upload URL.');

    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': String(videoBytes.byteLength),
      },
      body: Buffer.from(videoBytes),
    });

    if (!uploadRes.ok) {
      const err = await this.parseApiError(uploadRes);
      throw new Error(err);
    }

    const data = (await uploadRes.json()) as { id?: string };
    const videoId = data.id?.trim();
    if (!videoId) throw new Error('YouTube upload bez video ID.');

    let thumbnailUploaded = false;
    if (input.thumbnailUrl?.trim()) {
      try {
        await this.uploadThumbnail(accessToken, videoId, input.thumbnailUrl.trim());
        thumbnailUploaded = true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.log.warn(`YouTube thumbnail upload failed (video kept): ${msg}`);
      }
    }

    return {
      videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      thumbnailUploaded,
    };
  }

  private async uploadThumbnail(accessToken: string, videoId: string, thumbnailUrl: string) {
    const imgRes = await fetch(thumbnailUrl);
    if (!imgRes.ok) throw new Error('thumbnail_download_failed');
    const bytes = new Uint8Array(await imgRes.arrayBuffer());
    const contentType = imgRes.headers.get('content-type')?.includes('png') ? 'image/png' : 'image/jpeg';

    const url = `${YOUTUBE_UPLOAD_BASE}/thumbnails/set?videoId=${encodeURIComponent(videoId)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': contentType,
        'Content-Length': String(bytes.byteLength),
      },
      body: Buffer.from(bytes),
    });
    if (!res.ok) {
      const err = await this.parseApiError(res);
      throw new Error(err);
    }
  }

  private async downloadVideo(url: string): Promise<Uint8Array> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Stažení MP4 selhalo (${res.status}).`);
    return new Uint8Array(await res.arrayBuffer());
  }

  private async parseApiError(res: Response): Promise<string> {
    try {
      const data = (await res.json()) as {
        error?: { message?: string; errors?: Array<{ reason?: string }> };
      };
      const reason = data.error?.errors?.[0]?.reason;
      const message = data.error?.message ?? `HTTP ${res.status}`;
      if (reason === 'quotaExceeded' || /quota/i.test(message)) {
        return 'QUOTA_EXCEEDED: YouTube API kvóta vyčerpána.';
      }
      if (reason === 'uploadLimitExceeded') {
        return 'QUOTA_EXCEEDED: Denní limit uploadů na YouTube.';
      }
      return message;
    } catch {
      return `HTTP ${res.status}`;
    }
  }
}
