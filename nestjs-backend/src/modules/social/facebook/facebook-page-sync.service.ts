import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PostCategory, SocialProvider } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { PostsService } from '../../posts/posts.service';
import { TokenEncryptionService } from '../token-encryption.service';
import { FACEBOOK_IMPORT_TAG, GRAPH_API } from './facebook-page.constants';

type GraphFeedAttachment = {
  media_type?: string;
  media?: { image?: { src?: string }; source?: string };
  url?: string;
  subattachments?: { data?: GraphFeedAttachment[] };
};
type GraphFeedItem = {
  id?: string;
  message?: string;
  permalink_url?: string;
  created_time?: string;
  attachments?: { data?: GraphFeedAttachment[] };
};

const SYNC_INTERVAL_MS = 12 * 60 * 1000;

@Injectable()
export class FacebookPageSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FacebookPageSyncService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: TokenEncryptionService,
    private readonly posts: PostsService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.syncAllActive().catch((err) => {
        this.logger.warn(`[facebook-sync] scheduled run failed: ${String(err)}`);
      });
    }, SYNC_INTERVAL_MS);
    void this.syncAllActive();
    this.logger.log('[facebook-sync] scheduler initialized (every 12 min)');
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async syncAllActive() {
    const connections = await this.prisma.socialConnection.findMany({
      where: {
        provider: SocialProvider.FACEBOOK,
        syncEnabled: true,
        pageId: { not: null },
        pageAccessToken: { not: null },
      },
      select: { id: true },
    });
    for (const c of connections) {
      await this.syncConnection(c.id);
    }
    return { processed: connections.length };
  }

  async syncConnection(connectionId: string) {
    const connection = await this.prisma.socialConnection.findUnique({
      where: { id: connectionId },
      include: {
        user: { select: { id: true, role: true } },
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
        `${GRAPH_API}/${encodeURIComponent(connection.pageId)}/feed?` +
        `fields=id,message,permalink_url,created_time,attachments{media_type,media,url,subattachments}&limit=25` +
        `&access_token=${encodeURIComponent(pageToken)}`;
      const res = await fetch(feedUrl);
      const payload = (await res.json().catch(() => ({}))) as {
        data?: GraphFeedItem[];
        error?: { message?: string };
      };
      if (!res.ok || payload.error) {
        throw new Error(payload.error?.message ?? `Facebook feed HTTP ${res.status}`);
      }

      let imported = 0;
      for (const item of payload.data ?? []) {
        if (!item.id) continue;
        const created = await this.importFeedItem(connection.id, connection.userId, connection.user.role, item);
        if (created) imported += 1;
      }

      await this.prisma.socialConnection.update({
        where: { id: connectionId },
        data: { lastSyncAt: new Date(), lastSyncError: null },
      });
      return { imported };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Synchronizace selhala';
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

  private async importFeedItem(
    connectionId: string,
    userId: string,
    role: import('@prisma/client').UserRole,
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

    const media = this.extractMedia(item);
    const message = (item.message ?? '').trim();
    const sourceUrl = item.permalink_url?.trim() || media.linkUrl || null;
    const description = this.formatImportedDescription(message);

    let importedPostId: string;
    if (media.videoUrl) {
      const post = await this.posts.createMediaPost(userId, {
        kind: 'video',
        url: media.videoUrl,
        description,
      });
      importedPostId = post.id;
    } else if (media.imageUrl) {
      const post = await this.posts.createMediaPost(userId, {
        kind: 'image',
        url: media.imageUrl,
        description,
      });
      importedPostId = post.id;
    } else if (sourceUrl) {
      const post = await this.posts.create(userId, {
        text: description,
        externalUrl: sourceUrl,
        previewSiteName: 'Facebook',
        category: this.categoryForRole(role),
      });
      importedPostId = post.id;
    } else if (message) {
      const post = await this.posts.create(userId, {
        text: description,
        category: this.categoryForRole(role),
      });
      importedPostId = post.id;
    } else {
      return false;
    }

    await this.prisma.socialImportedPost.create({
      data: {
        userId,
        connectionId,
        provider: SocialProvider.FACEBOOK,
        providerPostId,
        sourceUrl,
        message: message || null,
        imageUrl: media.imageUrl,
        videoUrl: media.videoUrl,
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

  private categoryForRole(role: import('@prisma/client').UserRole): PostCategory {
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
