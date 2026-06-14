import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PostCategory, PostSource, SocialProvider, UserRole } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { TokenEncryptionService } from '../token-encryption.service';
import { FacebookUrlImportService } from '../facebook-url-import/facebook-url-import.service';
import {
  buildFacebookEmbedUrl,
  detectFacebookPostType,
} from '../facebook-url-import/facebook-embed.util';
import {
  FACEBOOK_IMPORT_TAG,
  FACEBOOK_PAGE_BADGE,
  FACEBOOK_PAGE_POSTS_LIMIT,
  FACEBOOK_PAGE_SYNC_INTERVAL_MS,
  GRAPH_API,
} from './facebook-page.constants';

type GraphFeedAttachment = {
  media_type?: string;
  media?: { image?: { src?: string }; source?: string };
  url?: string;
  subattachments?: { data?: GraphFeedAttachment[] };
};
type GraphFeedItem = {
  id?: string;
  message?: string;
  story?: string;
  permalink_url?: string;
  full_picture?: string;
  created_time?: string;
  attachments?: { data?: GraphFeedAttachment[] };
};

@Injectable()
export class FacebookPageSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FacebookPageSyncService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: TokenEncryptionService,
    private readonly urlImport: FacebookUrlImportService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.syncAllActive().catch((err) => {
        this.logger.warn(`[facebook-sync] scheduled run failed: ${String(err)}`);
      });
    }, FACEBOOK_PAGE_SYNC_INTERVAL_MS);
    void this.syncAllActive();
    this.logger.log(
      `[facebook-sync] scheduler initialized (every ${FACEBOOK_PAGE_SYNC_INTERVAL_MS / 60000} min)`,
    );
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async syncAllActive() {
    const connections = await this.prisma.facebookPageConnection.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    for (const c of connections) {
      await this.syncPageConnection(c.id);
    }
    const legacy = await this.prisma.socialConnection.findMany({
      where: {
        provider: SocialProvider.FACEBOOK,
        syncEnabled: true,
        pageId: { not: null },
        pageAccessToken: { not: null },
      },
      select: { id: true },
    });
    for (const c of legacy) {
      await this.syncConnection(c.id);
    }
    return { processed: connections.length + legacy.length };
  }

  async syncPageConnection(pageConnectionId: string) {
    const connection = await this.prisma.facebookPageConnection.findUnique({
      where: { id: pageConnectionId },
      include: { user: { select: { id: true, role: true, facebookUrl: true } } },
    });
    if (!connection?.isActive) {
      return { imported: 0, skipped: true };
    }

    let pageToken: string;
    try {
      pageToken = this.crypto.decrypt(connection.pageAccessTokenEncrypted);
    } catch {
      await this.markPageSyncError(pageConnectionId, 'Vyžaduje nové propojení.');
      return { imported: 0, error: 'decrypt_failed' };
    }

    try {
      const feedUrl =
        `${GRAPH_API}/${encodeURIComponent(connection.pageId)}/posts?` +
        `fields=id,message,story,created_time,permalink_url,full_picture,attachments{media_type,media,url,subattachments}` +
        `&limit=${FACEBOOK_PAGE_POSTS_LIMIT}` +
        `&access_token=${encodeURIComponent(pageToken)}`;
      const res = await fetch(feedUrl);
      const payload = (await res.json().catch(() => ({}))) as {
        data?: GraphFeedItem[];
        error?: { message?: string };
      };
      if (!res.ok || payload.error) {
        throw new Error(payload.error?.message ?? `Facebook posts HTTP ${res.status}`);
      }

      let imported = 0;
      for (const item of payload.data ?? []) {
        if (!item.id) continue;
        const created = await this.importPagePost(connection, item);
        if (created) imported += 1;
      }

      await this.prisma.facebookPageConnection.update({
        where: { id: pageConnectionId },
        data: { lastSyncAt: new Date(), lastSyncError: null },
      });
      this.logger.log(
        `FACEBOOK_PAGE_POSTS_SYNCED pageConnectionId=${pageConnectionId} pageId=${connection.pageId} imported=${imported}`,
      );
      return { imported };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Synchronizace selhala';
      this.logger.warn(
        `FACEBOOK_PAGE_SYNC_FAILED pageConnectionId=${pageConnectionId} pageId=${connection.pageId} error=${message}`,
      );

      const fallback = await this.tryUrlImportFallback(connection.userId, connection.user.facebookUrl);
      if (fallback) {
        await this.prisma.facebookPageConnection.update({
          where: { id: pageConnectionId },
          data: {
            lastSyncAt: new Date(),
            lastSyncError: `Graph API nedostupné — použit URL import (${fallback.imported} nových).`,
          },
        });
        return {
          imported: fallback.imported,
          fallback: true,
          error: message,
        };
      }

      await this.markPageSyncError(pageConnectionId, message);
      return { imported: 0, error: message };
    }
  }

  private async tryUrlImportFallback(userId: string, facebookUrl: string | null | undefined) {
    if (!facebookUrl?.trim()) return null;
    try {
      const result = await this.urlImport.syncUser(userId, { triggeredBy: 'admin' });
      this.logger.log(
        `FACEBOOK_PAGE_URL_FALLBACK userId=${userId} imported=${result.imported ?? 0} reason=${result.detectedReason ?? 'unknown'}`,
      );
      return result;
    } catch (fallbackErr) {
      this.logger.warn(
        `FACEBOOK_PAGE_URL_FALLBACK_FAILED userId=${userId} error=${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`,
      );
      return null;
    }
  }

  private async markPageSyncError(pageConnectionId: string, message: string) {
    await this.prisma.facebookPageConnection.update({
      where: { id: pageConnectionId },
      data: { lastSyncError: message.slice(0, 2000) },
    });
  }

  private normalizePermalink(url: string | undefined | null): string | null {
    const raw = url?.trim();
    if (!raw) return null;
    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
    return `https://www.facebook.com${raw.startsWith('/') ? '' : '/'}${raw}`;
  }

  private async resolveProfessionalProfileId(
    userId: string,
    role: UserRole,
  ): Promise<string | null> {
    switch (role) {
      case UserRole.AGENT: {
        const row = await this.prisma.agentProfile.findUnique({
          where: { userId },
          select: { id: true },
        });
        return row?.id ?? null;
      }
      case UserRole.COMPANY: {
        const row = await this.prisma.companyProfile.findUnique({
          where: { userId },
          select: { id: true },
        });
        return row?.id ?? null;
      }
      case UserRole.AGENCY: {
        const row = await this.prisma.agencyProfile.findUnique({
          where: { userId },
          select: { id: true },
        });
        return row?.id ?? null;
      }
      case UserRole.FINANCIAL_ADVISOR: {
        const row = await this.prisma.financialAdvisorProfile.findUnique({
          where: { userId },
          select: { id: true },
        });
        return row?.id ?? null;
      }
      case UserRole.INVESTOR: {
        const row = await this.prisma.investorProfile.findUnique({
          where: { userId },
          select: { id: true },
        });
        return row?.id ?? null;
      }
      default:
        return null;
    }
  }

  private async importPagePost(
    connection: {
      id: string;
      userId: string;
      pageId: string;
      user: { role: UserRole };
    },
    item: GraphFeedItem,
  ): Promise<boolean> {
    const facebookPostId = item.id!.trim();
    const existing = await this.prisma.facebookSyncedPost.findUnique({
      where: { facebookPostId },
    });
    if (existing) return false;

    const media = this.extractMedia(item);
    const message = (item.message ?? item.story ?? '').trim();
    const permalink = this.normalizePermalink(item.permalink_url) ?? media.linkUrl;
    const fullPicture = item.full_picture?.trim() || media.imageUrl || null;
    const publishedAt =
      item.created_time && !Number.isNaN(new Date(item.created_time).getTime())
        ? new Date(item.created_time)
        : null;

    if (permalink) {
      const dup = await this.prisma.post.findFirst({
        where: {
          OR: [
            { facebookExternalId: facebookPostId },
            { facebookPermalink: permalink },
            { externalUrl: permalink },
          ],
        },
        select: { id: true },
      });
      if (dup) return false;
    }

    const text = this.formatImportedDescription(message);
    const category = this.categoryForRole(connection.user.role);
    const professionalProfileId = await this.resolveProfessionalProfileId(
      connection.userId,
      connection.user.role,
    );
    const facebookPostType = permalink ? detectFacebookPostType(permalink) : 'FACEBOOK_POST';
    const facebookEmbedUrl = permalink
      ? buildFacebookEmbedUrl(permalink, facebookPostType)
      : null;
    const videoUrl = media.videoUrl?.trim() || null;
    const imageUrl = fullPicture?.trim() || null;

    const mediaCreate: Array<{ url: string; type: string; order: number }> = [];
    if (imageUrl) {
      mediaCreate.push({ url: imageUrl, type: 'image', order: 1 });
    }
    if (videoUrl) {
      mediaCreate.push({ url: videoUrl, type: 'video', order: mediaCreate.length + 1 });
    }

    if (!text && !imageUrl && !videoUrl && !permalink) {
      return false;
    }

    let importedPostId: string;
    try {
      const post = await this.prisma.post.create({
        data: {
          type: videoUrl ? 'video' : 'post',
          category,
          userId: connection.userId,
          professionalProfileId,
          title: '',
          price: 0,
          city: '',
          description: text,
          content: message || null,
          imageUrl,
          videoUrl,
          externalUrl: permalink,
          facebookPermalink: permalink,
          facebookExternalId: facebookPostId,
          facebookPostType: permalink ? facebookPostType : null,
          facebookEmbedUrl,
          previewTitle: message.slice(0, 200) || FACEBOOK_PAGE_BADGE,
          previewDescription: message.slice(0, 500) || null,
          previewImage: imageUrl,
          previewSiteName: FACEBOOK_PAGE_BADGE,
          source: PostSource.FACEBOOK,
          isFacebookPagePost: true,
          publishedAt,
          createdAt: publishedAt ?? new Date(),
          media: mediaCreate.length ? { create: mediaCreate } : undefined,
        },
        select: { id: true },
      });
      importedPostId = post.id;
    } catch (err) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code?: string }).code)
          : '';
      if (code === 'P2002') return false;
      throw err;
    }

    await this.prisma.facebookSyncedPost.create({
      data: {
        userId: connection.userId,
        pageConnectionId: connection.id,
        facebookPostId,
        message: message || null,
        story: item.story ?? null,
        permalinkUrl: permalink,
        fullPictureUrl: imageUrl,
        createdTime: publishedAt,
        rawJson: item as object,
        importedPostId,
      },
    });

    return true;
  }

  async syncConnection(connectionId: string) {
    const connection = await this.prisma.socialConnection.findUnique({
      where: { id: connectionId },
      include: {
        user: { select: { id: true, role: true, facebookUrl: true } },
      },
    });
    if (!connection?.pageId || !connection.pageAccessToken || !connection.syncEnabled) {
      return { imported: 0, skipped: true };
    }

    let pageToken: string;
    try {
      pageToken = this.crypto.decrypt(connection.pageAccessToken);
    } catch {
      await this.markSyncError(connectionId, 'Facebook propojení vyžaduje nové přihlášení.');
      return { imported: 0, error: 'decrypt_failed' };
    }

    try {
      const feedUrl =
        `${GRAPH_API}/${encodeURIComponent(connection.pageId)}/posts?` +
        `fields=id,message,story,created_time,permalink_url,full_picture,attachments{media_type,media,url,subattachments}` +
        `&limit=${FACEBOOK_PAGE_POSTS_LIMIT}` +
        `&access_token=${encodeURIComponent(pageToken)}`;
      const res = await fetch(feedUrl);
      const payload = (await res.json().catch(() => ({}))) as {
        data?: GraphFeedItem[];
        error?: { message?: string };
      };
      if (!res.ok || payload.error) {
        throw new Error(payload.error?.message ?? `Facebook posts HTTP ${res.status}`);
      }

      let imported = 0;
      for (const item of payload.data ?? []) {
        if (!item.id) continue;
        const created = await this.importLegacyFeedItem(connection, item);
        if (created) imported += 1;
      }

      await this.prisma.socialConnection.update({
        where: { id: connectionId },
        data: { lastSyncAt: new Date(), lastSyncError: null },
      });
      return { imported };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Synchronizace selhala';
      const fallback = await this.tryUrlImportFallback(
        connection.userId,
        connection.user.facebookUrl,
      );
      if (fallback) {
        await this.prisma.socialConnection.update({
          where: { id: connectionId },
          data: {
            lastSyncAt: new Date(),
            lastSyncError: `Graph API nedostupné — použit URL import (${fallback.imported} nových).`,
          },
        });
        return { imported: fallback.imported, fallback: true, error: message };
      }
      await this.markSyncError(connectionId, message);
      return { imported: 0, error: message };
    }
  }

  private async markSyncError(connectionId: string, message: string) {
    await this.prisma.socialConnection.update({
      where: { id: connectionId },
      data: { lastSyncError: message.slice(0, 2000) },
    });
  }

  private async importLegacyFeedItem(
    connection: {
      id: string;
      userId: string;
      user: { role: UserRole };
    },
    item: GraphFeedItem,
  ): Promise<boolean> {
    const providerPostId = item.id!.trim();
    const existing = await this.prisma.socialImportedPost.findUnique({
      where: {
        provider_providerPostId: {
          provider: SocialProvider.FACEBOOK,
          providerPostId,
        },
      },
    });
    if (existing) return false;

    const pageConnection = await this.prisma.facebookPageConnection.findFirst({
      where: { userId: connection.userId, isActive: true },
      select: { id: true, pageId: true },
    });
    if (pageConnection) {
      return this.importPagePost(
        {
          id: pageConnection.id,
          userId: connection.userId,
          pageId: pageConnection.pageId,
          user: { role: connection.user.role },
        },
        item,
      );
    }

    const media = this.extractMedia(item);
    const message = (item.message ?? item.story ?? '').trim();
    const permalink = this.normalizePermalink(item.permalink_url) ?? media.linkUrl;
    const publishedAt =
      item.created_time && !Number.isNaN(new Date(item.created_time).getTime())
        ? new Date(item.created_time)
        : null;

    if (permalink) {
      const dup = await this.prisma.post.findFirst({
        where: {
          OR: [
            { facebookExternalId: providerPostId },
            { facebookPermalink: permalink },
            { externalUrl: permalink },
          ],
        },
        select: { id: true },
      });
      if (dup) return false;
    }

    const text = this.formatImportedDescription(message);
    const category = this.categoryForRole(connection.user.role);
    const professionalProfileId = await this.resolveProfessionalProfileId(
      connection.userId,
      connection.user.role,
    );
    const facebookPostType = permalink ? detectFacebookPostType(permalink) : 'FACEBOOK_POST';
    const facebookEmbedUrl = permalink
      ? buildFacebookEmbedUrl(permalink, facebookPostType)
      : null;
    const videoUrl = media.videoUrl?.trim() || null;
    const imageUrl = item.full_picture?.trim() || media.imageUrl || null;

    const mediaCreate: Array<{ url: string; type: string; order: number }> = [];
    if (imageUrl) mediaCreate.push({ url: imageUrl, type: 'image', order: 1 });
    if (videoUrl) mediaCreate.push({ url: videoUrl, type: 'video', order: mediaCreate.length + 1 });

    if (!text && !imageUrl && !videoUrl && !permalink) return false;

    let importedPostId: string;
    try {
      const post = await this.prisma.post.create({
        data: {
          type: videoUrl ? 'video' : 'post',
          category,
          userId: connection.userId,
          professionalProfileId,
          title: '',
          price: 0,
          city: '',
          description: text,
          content: message || null,
          imageUrl,
          videoUrl,
          externalUrl: permalink,
          facebookPermalink: permalink,
          facebookExternalId: providerPostId,
          facebookPostType: permalink ? facebookPostType : null,
          facebookEmbedUrl,
          previewTitle: message.slice(0, 200) || 'Facebook',
          previewDescription: message.slice(0, 500) || null,
          previewImage: imageUrl,
          previewSiteName: 'Facebook',
          source: PostSource.FACEBOOK,
          isFacebookPagePost: true,
          publishedAt,
          createdAt: publishedAt ?? new Date(),
          media: mediaCreate.length ? { create: mediaCreate } : undefined,
        },
        select: { id: true },
      });
      importedPostId = post.id;
    } catch (err) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code?: string }).code)
          : '';
      if (code === 'P2002') return false;
      throw err;
    }

    await this.prisma.socialImportedPost.create({
      data: {
        userId: connection.userId,
        connectionId: connection.id,
        provider: SocialProvider.FACEBOOK,
        providerPostId,
        sourceUrl: permalink,
        message: message || null,
        imageUrl,
        videoUrl,
        importedPostId,
      },
    });
    return true;
  }

  private extractMedia(item: GraphFeedItem): {
    imageUrl: string | null;
    videoUrl: string | null;
    linkUrl: string | null;
  } {
    let imageUrl: string | null = null;
    let videoUrl: string | null = null;
    let linkUrl: string | null = null;

    const walk = (attachments?: GraphFeedAttachment[]) => {
      for (const att of attachments ?? []) {
        const type = (att.media_type ?? '').toLowerCase();
        if (type === 'photo' && att.media?.image?.src) {
          imageUrl = imageUrl ?? att.media.image.src;
        }
        if (type === 'video' && att.media?.source) {
          videoUrl = videoUrl ?? att.media.source;
        }
        if (att.url && !linkUrl) linkUrl = att.url;
        walk(att.subattachments?.data);
      }
    };
    walk(item.attachments?.data);
    return { imageUrl, videoUrl, linkUrl };
  }

  private formatImportedDescription(message: string): string {
    const text = message.trim();
    if (!text) return FACEBOOK_IMPORT_TAG;
    if (text.includes(FACEBOOK_IMPORT_TAG)) return text;
    return `${FACEBOOK_IMPORT_TAG}\n\n${text}`;
  }

  private categoryForRole(role: UserRole): PostCategory {
    switch (role) {
      case 'COMPANY':
        return PostCategory.STAVEBNI_FIRMY;
      case 'AGENCY':
        return PostCategory.REALITNI_KANCELARE;
      case 'FINANCIAL_ADVISOR':
        return PostCategory.FINANCNI_PORADCI;
      case 'INVESTOR':
        return PostCategory.INVESTORI;
      case 'CRAFTSMAN':
        return PostCategory.REMESLNICI;
      default:
        return PostCategory.MAKLERI;
    }
  }
}
