import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PostCategory, PostSource, SocialProvider, UserRole } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { TokenEncryptionService } from '../token-encryption.service';
import { FacebookUrlImportService } from '../facebook-url-import/facebook-url-import.service';
import {
  buildFacebookEmbedUrl,
} from '../facebook-url-import/facebook-embed.util';
import {
  FACEBOOK_GRAPH_POST_FIELDS,
  buildFacebookImportMediaPlan,
  extractMediaFromGraphItem,
  logFacebookVideoImportDiagnostics,
  resolveFacebookVideoFromGraph,
  type GraphFeedItem,
} from './facebook-video-media.util';
import {
  FACEBOOK_IMPORT_TAG,
  FACEBOOK_PAGE_BADGE,
  FACEBOOK_PAGE_POSTS_LIMIT,
  FACEBOOK_PAGE_SYNC_INTERVAL_MS,
  GRAPH_API,
} from './facebook-page.constants';
import { FacebookConfigService } from './facebook-config.service';
import {
  inspectFacebookAccessToken,
  isFacebookPermissionError,
  parseFacebookGraphError,
} from './facebook-graph-permissions.util';

export type FacebookPageSyncResult = {
  imported: number;
  found?: number;
  skippedDuplicates?: number;
  skipped?: boolean;
  pageId?: string;
  error?: string;
  reason?: string;
  graphError?: string;
  graphErrorCode?: number;
  tokenScopes?: string[];
  missingPermissions?: string[];
  permissionDenied?: boolean;
  fallback?: boolean;
};

const FACEBOOK_RECONNECT_PERMISSION_MSG =
  'Znovu propojte Facebook stránku a povolte oprávnění pages_show_list a pages_read_engagement.';

@Injectable()
export class FacebookPageSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FacebookPageSyncService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: TokenEncryptionService,
    private readonly urlImport: FacebookUrlImportService,
    private readonly fbConfig: FacebookConfigService,
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

  async syncPageConnection(
    pageConnectionId: string,
    options?: { manual?: boolean },
  ): Promise<FacebookPageSyncResult> {
    const connection = await this.prisma.facebookPageConnection.findUnique({
      where: { id: pageConnectionId },
      include: { user: { select: { id: true, role: true, facebookUrl: true } } },
    });
    if (!connection?.isActive) {
      return { imported: 0, skipped: true, reason: 'connection_inactive' };
    }

    let pageToken: string;
    try {
      pageToken = this.crypto.decrypt(connection.pageAccessTokenEncrypted);
    } catch {
      await this.markPageSyncError(pageConnectionId, 'Vyžaduje nové propojení.');
      return { imported: 0, error: 'decrypt_failed', pageId: connection.pageId };
    }

    const pagesAppId = this.fbConfig.getPagesAppId();
    const pagesAppSecret = this.fbConfig.getPagesAppSecret();
    let tokenInspection = null;
    if (pagesAppId && pagesAppSecret) {
      tokenInspection = await inspectFacebookAccessToken(pageToken, pagesAppId, pagesAppSecret);
      this.logger.log(
        `FACEBOOK_SYNC_TOKEN_DEBUG pageConnectionId=${pageConnectionId} pageId=${connection.pageId} ` +
          `isValid=${tokenInspection.isValid} scopes=${tokenInspection.scopes.join(',') || 'none'} ` +
          `missing=${tokenInspection.missingScopes.join(',') || 'none'}`,
      );
      if (tokenInspection.missingScopes.length > 0) {
        await this.markPageSyncError(pageConnectionId, FACEBOOK_RECONNECT_PERMISSION_MSG);
        return {
          imported: 0,
          pageId: connection.pageId,
          error: FACEBOOK_RECONNECT_PERMISSION_MSG,
          reason: 'missing_permissions',
          permissionDenied: true,
          tokenScopes: tokenInspection.scopes,
          missingPermissions: tokenInspection.missingScopes,
        };
      }
    }

    try {
      const feedUrl =
        `${GRAPH_API}/${encodeURIComponent(connection.pageId)}/posts?` +
        `fields=${FACEBOOK_GRAPH_POST_FIELDS}` +
        `&limit=${FACEBOOK_PAGE_POSTS_LIMIT}` +
        `&access_token=${encodeURIComponent(pageToken)}`;

      this.logger.log(
        `FACEBOOK_SYNC_GRAPH_REQUEST pageConnectionId=${pageConnectionId} pageId=${connection.pageId} ` +
          `limit=${FACEBOOK_PAGE_POSTS_LIMIT} fields=${FACEBOOK_GRAPH_POST_FIELDS}`,
      );

      const res = await fetch(feedUrl);
      const payload = (await res.json().catch(() => ({}))) as {
        data?: GraphFeedItem[];
        paging?: { next?: string };
      };
      const graphError = parseFacebookGraphError(payload);

      if (!res.ok || graphError) {
        const errMsg = graphError?.message ?? `Facebook posts HTTP ${res.status}`;
        this.logger.warn(
          `FACEBOOK_SYNC_GRAPH_ERROR pageConnectionId=${pageConnectionId} pageId=${connection.pageId} ` +
            `code=${graphError?.code ?? 'n/a'} type=${graphError?.type ?? 'n/a'} message=${errMsg}`,
        );

        if (isFacebookPermissionError(graphError)) {
          await this.markPageSyncError(pageConnectionId, FACEBOOK_RECONNECT_PERMISSION_MSG);
          return {
            imported: 0,
            pageId: connection.pageId,
            error: FACEBOOK_RECONNECT_PERMISSION_MSG,
            reason: 'graph_permission_denied',
            graphError: errMsg,
            graphErrorCode: graphError?.code,
            permissionDenied: true,
            tokenScopes: tokenInspection?.scopes,
            missingPermissions: tokenInspection?.missingScopes,
          };
        }

        throw new Error(errMsg);
      }

      const items = payload.data ?? [];
      const found = items.length;
      let imported = 0;
      for (const item of items) {
        if (!item.id) continue;
        const created = await this.importPagePost(connection, item, pageToken);
        if (created) imported += 1;
      }
      const skippedDuplicates = found - imported;

      this.logger.log(
        `FACEBOOK_SYNC_GRAPH_RESPONSE pageConnectionId=${pageConnectionId} pageId=${connection.pageId} ` +
          `found=${found} imported=${imported} skippedDuplicates=${skippedDuplicates} ` +
          `hasNextPage=${Boolean(payload.paging?.next)}`,
      );

      await this.prisma.facebookPageConnection.update({
        where: { id: pageConnectionId },
        data: { lastSyncAt: new Date(), lastSyncError: null },
      });

      const result: FacebookPageSyncResult = {
        imported,
        found,
        skippedDuplicates,
        pageId: connection.pageId,
        tokenScopes: tokenInspection?.scopes,
      };

      if (found === 0) {
        result.reason = 'no_posts_on_page';
        result.graphError = 'Meta Graph API vrátilo 0 příspěvků pro tuto stránku.';
      } else if (imported === 0) {
        result.reason = 'all_already_imported';
        result.graphError = `Nalezeno ${found} příspěvků, všechny už byly dříve importovány.`;
      }

      this.logger.log(
        `FACEBOOK_PAGE_POSTS_SYNCED pageConnectionId=${pageConnectionId} pageId=${connection.pageId} imported=${imported}`,
      );
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Synchronizace selhala';
      this.logger.warn(
        `FACEBOOK_PAGE_SYNC_FAILED pageConnectionId=${pageConnectionId} pageId=${connection.pageId} error=${message}`,
      );

      if (!options?.manual) {
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
            imported: fallback.imported ?? 0,
            fallback: true,
            error: message,
            pageId: connection.pageId,
            reason: 'url_import_fallback',
          };
        }
      }

      await this.markPageSyncError(pageConnectionId, message);
      return {
        imported: 0,
        error: message,
        pageId: connection.pageId,
        reason: 'graph_fetch_failed',
        graphError: message,
        tokenScopes: tokenInspection?.scopes,
      };
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
    pageToken?: string,
  ): Promise<boolean> {
    const facebookPostId = item.id!.trim();
    const existing = await this.prisma.facebookSyncedPost.findUnique({
      where: { facebookPostId },
    });
    if (existing) return false;

    const extracted = extractMediaFromGraphItem(item);
    const message = (item.message ?? item.story ?? '').trim();
    const permalink = this.normalizePermalink(item.permalink_url) ?? extracted.linkUrl;
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

    let resolvedVideo = null;
    if (pageToken && extracted.videoId) {
      resolvedVideo = await resolveFacebookVideoFromGraph(extracted.videoId, pageToken);
      if (resolvedVideo.failureReason) {
        this.logger.warn(
          `FACEBOOK_VIDEO_SOURCE_MISSING postId=${facebookPostId} reason=${resolvedVideo.failureReason}`,
        );
      }
    }

    const mediaPlan = buildFacebookImportMediaPlan({
      permalink,
      extracted,
      fullPicture: item.full_picture,
      resolvedVideo,
    });

    const text = this.formatImportedDescription(message);
    const category = this.categoryForRole(connection.user.role);
    const professionalProfileId = await this.resolveProfessionalProfileId(
      connection.userId,
      connection.user.role,
    );
    const facebookEmbedUrl = permalink
      ? buildFacebookEmbedUrl(permalink, mediaPlan.facebookPostType)
      : null;

    if (!text && !mediaPlan.thumbnailUrl && !mediaPlan.videoUrl && !permalink) {
      return false;
    }

    let importedPostId: string;
    try {
      const post = await this.prisma.post.create({
        data: {
          type: mediaPlan.videoUrl ? 'video' : 'post',
          category,
          userId: connection.userId,
          professionalProfileId,
          title: '',
          price: 0,
          city: '',
          description: text,
          content: message || null,
          imageUrl: mediaPlan.imageUrl,
          videoUrl: mediaPlan.videoUrl,
          externalUrl: permalink,
          facebookPermalink: permalink,
          facebookExternalId: facebookPostId,
          facebookPostType: permalink ? mediaPlan.facebookPostType : null,
          facebookEmbedUrl,
          facebookVideoThumbnail: mediaPlan.thumbnailUrl,
          facebookVideoDurationSec: mediaPlan.durationSec,
          facebookVideoSourceUrl: mediaPlan.videoUrl,
          facebookVideoHasAudio: mediaPlan.hasAudio,
          facebookVideoMimeType: mediaPlan.mimeType,
          previewTitle: message.slice(0, 200) || FACEBOOK_PAGE_BADGE,
          previewDescription: message.slice(0, 500) || null,
          previewImage: mediaPlan.thumbnailUrl,
          previewSiteName: FACEBOOK_PAGE_BADGE,
          source: PostSource.FACEBOOK,
          isFacebookPagePost: true,
          publishedAt,
          createdAt: publishedAt ?? new Date(),
          media: mediaPlan.mediaCreate.length ? { create: mediaPlan.mediaCreate } : undefined,
        },
        select: { id: true },
      });
      importedPostId = post.id;
      if (mediaPlan.isVideoPost) {
        this.logger.log(
          `FACEBOOK_VIDEO_IMPORT ${logFacebookVideoImportDiagnostics({
            postId: importedPostId,
            videoUrl: mediaPlan.videoUrl,
            hasAudio: mediaPlan.hasAudio,
            mimeType: mediaPlan.mimeType,
            durationSec: mediaPlan.durationSec,
            sizeBytes: mediaPlan.sizeBytes,
            importSource: mediaPlan.importSource,
            failureReason: mediaPlan.videoUrlFailureReason,
          })}`,
        );
      }
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
        fullPictureUrl: mediaPlan.thumbnailUrl,
        videoSourceUrl: mediaPlan.videoUrl,
        videoUrlFailureReason: mediaPlan.videoUrlFailureReason,
        videoHasAudio: mediaPlan.hasAudio,
        videoMimeType: mediaPlan.mimeType,
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
        `fields=${FACEBOOK_GRAPH_POST_FIELDS}` +
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

    const extracted = extractMediaFromGraphItem(item);
    const message = (item.message ?? item.story ?? '').trim();
    const permalink = this.normalizePermalink(item.permalink_url) ?? extracted.linkUrl;
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

    let resolvedVideo = null;
    const fbAuth = await this.prisma.facebookConnection.findFirst({
      where: { userId: connection.userId },
      select: { accessTokenEncrypted: true },
    });
    if (extracted.videoId && fbAuth?.accessTokenEncrypted) {
      try {
        const userToken = this.crypto.decrypt(fbAuth.accessTokenEncrypted);
        resolvedVideo = await resolveFacebookVideoFromGraph(extracted.videoId, userToken);
      } catch {
        /* token decrypt failed */
      }
    }

    const mediaPlan = buildFacebookImportMediaPlan({
      permalink,
      extracted,
      fullPicture: item.full_picture,
      resolvedVideo,
    });

    const text = this.formatImportedDescription(message);
    const category = this.categoryForRole(connection.user.role);
    const professionalProfileId = await this.resolveProfessionalProfileId(
      connection.userId,
      connection.user.role,
    );
    const facebookEmbedUrl = permalink
      ? buildFacebookEmbedUrl(permalink, mediaPlan.facebookPostType)
      : null;

    if (!text && !mediaPlan.thumbnailUrl && !mediaPlan.videoUrl && !permalink) return false;

    let importedPostId: string;
    try {
      const post = await this.prisma.post.create({
        data: {
          type: mediaPlan.videoUrl ? 'video' : 'post',
          category,
          userId: connection.userId,
          professionalProfileId,
          title: '',
          price: 0,
          city: '',
          description: text,
          content: message || null,
          imageUrl: mediaPlan.imageUrl,
          videoUrl: mediaPlan.videoUrl,
          externalUrl: permalink,
          facebookPermalink: permalink,
          facebookExternalId: providerPostId,
          facebookPostType: permalink ? mediaPlan.facebookPostType : null,
          facebookEmbedUrl,
          facebookVideoThumbnail: mediaPlan.thumbnailUrl,
          facebookVideoDurationSec: mediaPlan.durationSec,
          facebookVideoSourceUrl: mediaPlan.videoUrl,
          facebookVideoHasAudio: mediaPlan.hasAudio,
          facebookVideoMimeType: mediaPlan.mimeType,
          previewTitle: message.slice(0, 200) || 'Facebook',
          previewDescription: message.slice(0, 500) || null,
          previewImage: mediaPlan.thumbnailUrl,
          previewSiteName: 'Facebook',
          source: PostSource.FACEBOOK,
          isFacebookPagePost: true,
          publishedAt,
          createdAt: publishedAt ?? new Date(),
          media: mediaPlan.mediaCreate.length ? { create: mediaPlan.mediaCreate } : undefined,
        },
        select: { id: true },
      });
      importedPostId = post.id;
      if (mediaPlan.isVideoPost) {
        this.logger.log(
          `FACEBOOK_VIDEO_IMPORT ${logFacebookVideoImportDiagnostics({
            postId: importedPostId,
            videoUrl: mediaPlan.videoUrl,
            hasAudio: mediaPlan.hasAudio,
            mimeType: mediaPlan.mimeType,
            durationSec: mediaPlan.durationSec,
            sizeBytes: mediaPlan.sizeBytes,
            importSource: mediaPlan.importSource,
            failureReason: mediaPlan.videoUrlFailureReason,
          })}`,
        );
      }
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
        imageUrl: mediaPlan.thumbnailUrl,
        videoUrl: mediaPlan.videoUrl,
        importedPostId,
      },
    });
    return true;
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
