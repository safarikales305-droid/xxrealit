import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import type { FacebookConnectDto } from '../dto/facebook-connect.dto';
import type { FacebookUploadVideoDto } from '../dto/facebook-upload-video.dto';
import { FacebookConfigService } from './facebook-config.service';
import { GRAPH_API, GRAPH_VIDEO_API } from './facebook-page.constants';

type GraphMeResponse = { id?: string; name?: string };
type GraphTokenExchange = { access_token?: string; expires_in?: number };
type GraphDebugToken = {
  data?: {
    is_valid?: boolean;
    user_id?: string;
    expires_at?: number;
    scopes?: string[];
  };
};
type GraphVideoResponse = { id?: string; error?: { message?: string; code?: number } };

@Injectable()
export class FacebookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fbConfig: FacebookConfigService,
  ) {}

  getAppId(): string | null {
    return this.fbConfig.getLoginAppId();
  }

  getAppSecret(): string | null {
    return this.fbConfig.getLoginAppSecret();
  }

  isConfigured(): boolean {
    return this.fbConfig.isLoginConfigured();
  }

  getPublicConfig() {
    return {
      configured: this.isConfigured(),
      appId: this.getAppId(),
      loginAppId: this.getAppId(),
      pagesAppId: this.fbConfig.getPagesAppId(),
    };
  }

  async getConnectionStatus(userId: string) {
    const row = await this.prisma.facebookConnection.findUnique({
      where: { userId },
      select: {
        facebookUserId: true,
        tokenExpiresAt: true,
        scopes: true,
        updatedAt: true,
      },
    });
    return {
      connected: Boolean(row),
      facebookUserId: row?.facebookUserId ?? null,
      tokenExpiresAt: row?.tokenExpiresAt?.toISOString() ?? null,
      scopes: row?.scopes ?? [],
    };
  }

  async connect(userId: string, dto: FacebookConnectDto) {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'Facebook upload není na serveru nakonfigurován (chybí FACEBOOK_LOGIN_APP_ID / FACEBOOK_LOGIN_APP_SECRET).',
      );
    }

    const shortToken = dto.accessToken.trim();
    if (!shortToken) {
      throw new BadRequestException('Chybí Facebook access token.');
    }

    const longLived = await this.exchangeForLongLivedToken(shortToken);
    const accessToken = longLived.access_token?.trim() || shortToken;
    const expiresIn = longLived.expires_in;

    const me = await this.fetchGraphJson<GraphMeResponse>(
      `${GRAPH_API}/me?fields=id,name&access_token=${encodeURIComponent(accessToken)}`,
    );
    if (!me.id) {
      throw new BadRequestException('Facebook token je neplatný nebo expirovaný.');
    }

    const debug = await this.debugToken(accessToken);
    const scopes = debug.data?.scopes ?? [];

    const tokenExpiresAt =
      expiresIn != null && Number.isFinite(expiresIn)
        ? new Date(Date.now() + expiresIn * 1000)
        : debug.data?.expires_at
          ? new Date(debug.data.expires_at * 1000)
          : null;

    await this.prisma.facebookConnection.upsert({
      where: { userId },
      create: {
        userId,
        facebookUserId: me.id,
        accessToken,
        tokenExpiresAt,
        scopes,
      },
      update: {
        facebookUserId: me.id,
        accessToken,
        tokenExpiresAt,
        scopes,
      },
    });

    return {
      connected: true,
      facebookUserId: me.id,
      facebookName: me.name ?? null,
      tokenExpiresAt: tokenExpiresAt?.toISOString() ?? null,
      scopes,
    };
  }

  async uploadVideo(userId: string, dto: FacebookUploadVideoDto) {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'Facebook upload není na serveru nakonfigurován (chybí FACEBOOK_LOGIN_APP_ID / FACEBOOK_LOGIN_APP_SECRET).',
      );
    }

    const connection = await this.prisma.facebookConnection.findUnique({
      where: { userId },
    });
    if (!connection) {
      throw new BadRequestException(
        'Nejprve propojte Facebook účet (tlačítko Nahrát video na Facebook).',
      );
    }

    if (
      connection.tokenExpiresAt &&
      connection.tokenExpiresAt.getTime() < Date.now()
    ) {
      throw new BadRequestException(
        'Facebook přístup vypršel. Znovu se přihlaste přes Facebook.',
      );
    }

    const videoUrl = dto.videoUrl.trim();
    this.assertPublicVideoUrl(videoUrl);

    const postText = this.buildPostText(dto);
    const targetId = connection.facebookUserId;

    let result = await this.publishVideoWithFileUrl(
      targetId,
      connection.accessToken,
      videoUrl,
      dto.title.trim(),
      postText,
    );

    if (!result.id) {
      result = await this.publishVideoFromDownload(
        targetId,
        connection.accessToken,
        videoUrl,
        dto.title.trim(),
        postText,
      );
    }

    if (!result.id) {
      throw new BadRequestException(
        result.error?.message ??
          'Nahrání videa na Facebook selhalo. Zkontrolujte oprávnění publish_video.',
      );
    }

    return {
      facebookVideoId: result.id,
      postText,
    };
  }

  private buildPostText(dto: FacebookUploadVideoDto): string {
    const parts = [dto.description.trim(), dto.listingUrl.trim()].filter(Boolean);
    return parts.join('\n\n');
  }

  private assertPublicVideoUrl(url: string) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException('Neplatná URL videa.');
    }
    if (parsed.protocol !== 'https:') {
      throw new BadRequestException('Video URL musí být veřejně dostupná přes HTTPS.');
    }
  }

  private async exchangeForLongLivedToken(shortToken: string): Promise<GraphTokenExchange> {
    const appId = this.getAppId()!;
    const appSecret = this.getAppSecret()!;
    const url =
      `${GRAPH_API}/oauth/access_token?` +
      `grant_type=fb_exchange_token&client_id=${encodeURIComponent(appId)}` +
      `&client_secret=${encodeURIComponent(appSecret)}` +
      `&fb_exchange_token=${encodeURIComponent(shortToken)}`;
    return this.fetchGraphJson<GraphTokenExchange>(url);
  }

  private async debugToken(inputToken: string): Promise<GraphDebugToken> {
    const appId = this.getAppId()!;
    const appSecret = this.getAppSecret()!;
    const appToken = `${appId}|${appSecret}`;
    const url =
      `${GRAPH_API}/debug_token?` +
      `input_token=${encodeURIComponent(inputToken)}` +
      `&access_token=${encodeURIComponent(appToken)}`;
    return this.fetchGraphJson<GraphDebugToken>(url);
  }

  private async publishVideoWithFileUrl(
    targetId: string,
    accessToken: string,
    fileUrl: string,
    title: string,
    description: string,
  ): Promise<GraphVideoResponse> {
    const body = new URLSearchParams({
      access_token: accessToken,
      file_url: fileUrl,
      title,
      description,
    });
    const res = await fetch(`${GRAPH_VIDEO_API}/${targetId}/videos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    return (await res.json().catch(() => ({}))) as GraphVideoResponse;
  }

  private async publishVideoFromDownload(
    targetId: string,
    accessToken: string,
    fileUrl: string,
    title: string,
    description: string,
  ): Promise<GraphVideoResponse> {
    const videoRes = await fetch(fileUrl);
    if (!videoRes.ok) {
      return { error: { message: 'Video se nepodařilo stáhnout ze storage.' } };
    }
    const buffer = Buffer.from(await videoRes.arrayBuffer());
    const form = new FormData();
    form.append('access_token', accessToken);
    form.append('title', title);
    form.append('description', description);
    form.append(
      'source',
      new Blob([buffer], { type: videoRes.headers.get('content-type') || 'video/mp4' }),
      'shorts.mp4',
    );

    const res = await fetch(`${GRAPH_VIDEO_API}/${targetId}/videos`, {
      method: 'POST',
      body: form,
    });
    return (await res.json().catch(() => ({}))) as GraphVideoResponse;
  }

  private async fetchGraphJson<T>(url: string): Promise<T> {
    const res = await fetch(url);
    const data = (await res.json().catch(() => ({}))) as T & {
      error?: { message?: string };
    };
    if (!res.ok) {
      const msg =
        typeof data.error?.message === 'string'
          ? data.error.message
          : `Facebook API HTTP ${res.status}`;
      throw new BadRequestException(msg);
    }
    return data;
  }
}
