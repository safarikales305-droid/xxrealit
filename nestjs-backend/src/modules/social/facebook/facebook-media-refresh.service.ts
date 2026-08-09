import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PostSource } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { TokenEncryptionService } from '../token-encryption.service';
import { buildFacebookEmbedUrl } from '../facebook-url-import/facebook-embed.util';
import {
  buildFacebookImportMediaPlan,
  extractFacebookVideoIdFromPermalink,
  extractMediaFromGraphItem,
  isPlayableDirectVideoUrl,
  resolveFacebookVideoFromGraph,
  type GraphFeedItem,
} from './facebook-video-media.util';
import {
  FACEBOOK_MEDIA_REFRESH_BATCH_SIZE,
  FACEBOOK_MEDIA_REFRESH_STALE_MS,
} from './facebook-page.constants';

export type FacebookMediaRefreshResult = {
  ok: boolean;
  postId: string;
  refreshed: boolean;
  videoUrl?: string | null;
  thumbnailUrl?: string | null;
  reason?: string;
  error?: string;
};

export type FacebookMediaBatchRefreshResult = {
  processed: number;
  refreshed: number;
  failed: number;
  skipped: number;
};

@Injectable()
export class FacebookMediaRefreshService {
  private readonly logger = new Logger(FacebookMediaRefreshService.name);
  private readonly refreshCooldown = new Map<string, number>();
  private static readonly COOLDOWN_MS = 60_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: TokenEncryptionService,
  ) {}

  async refreshPostMediaByPostId(
    postId: string,
    options?: { force?: boolean; source?: string },
  ): Promise<FacebookMediaRefreshResult> {
    const now = Date.now();
    const last = this.refreshCooldown.get(postId) ?? 0;
    if (!options?.force && now - last < FacebookMediaRefreshService.COOLDOWN_MS) {
      const post = await this.prisma.post.findUnique({
        where: { id: postId },
        select: { videoUrl: true, facebookVideoThumbnail: true },
      });
      return {
        ok: true,
        postId,
        refreshed: false,
        videoUrl: post?.videoUrl ?? null,
        thumbnailUrl: post?.facebookVideoThumbnail ?? null,
        reason: 'cooldown',
      };
    }
    this.refreshCooldown.set(postId, now);

    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: { media: true },
    });

    if (!post || post.source !== PostSource.FACEBOOK) {
      throw new NotFoundException('Facebook příspěvek nenalezen.');
    }

    const synced = await this.prisma.facebookSyncedPost.findFirst({
      where: { importedPostId: postId },
      include: {
        pageConnection: { select: { pageAccessTokenEncrypted: true, pageId: true } },
      },
    });
    if (!synced?.pageConnection?.pageAccessTokenEncrypted) {
      this.logger.warn(
        `[FacebookVideoPlayer] refresh skipped postId=${postId} reason=no_page_connection`,
      );
      return { ok: false, postId, refreshed: false, reason: 'no_page_connection' };
    }

    let pageToken: string;
    try {
      pageToken = this.crypto.decrypt(synced.pageConnection.pageAccessTokenEncrypted);
    } catch {
      return { ok: false, postId, refreshed: false, reason: 'token_decrypt_failed' };
    }

    const raw = synced.rawJson as GraphFeedItem | null;
    if (!raw) {
      return await this.refreshPostMediaFromStoredIds(post, synced, pageToken, options?.source);
    }

    const refreshed = await this.updateExistingFromGraphItem({
      postId: post.id,
      syncedPostId: synced.id,
      pageId: synced.pageConnection.pageId,
      item: raw,
      pageToken,
      existingVideoId: post.facebookVideoId ?? synced.facebookVideoId,
      force: options?.force,
      logSource: options?.source ?? 'player',
    });

    return {
      ok: true,
      postId,
      refreshed: refreshed.updated,
      videoUrl: refreshed.videoUrl,
      thumbnailUrl: refreshed.thumbnailUrl,
      reason: refreshed.reason,
    };
  }

  private async refreshPostMediaFromStoredIds(
    post: {
      id: string;
      facebookVideoId: string | null;
      facebookPermalink: string | null;
      externalUrl: string | null;
      videoUrl: string | null;
      facebookVideoThumbnail: string | null;
    },
    synced: { id: string; facebookVideoId: string | null },
    pageToken: string,
    logSource?: string,
  ): Promise<FacebookMediaRefreshResult> {
    const videoId =
      post.facebookVideoId?.trim() ||
      synced.facebookVideoId?.trim() ||
      extractFacebookVideoIdFromPermalink(
        post.facebookPermalink ?? post.externalUrl ?? '',
      );

    if (!videoId) {
      return { ok: false, postId: post.id, refreshed: false, reason: 'missing_video_id' };
    }

    const resolved = await resolveFacebookVideoFromGraph(videoId, pageToken);
    if (!resolved.source) {
      this.logger.warn(
        `[FacebookMediaRefresh] ${logSource ?? 'stored'} postId=${post.id} videoId=${videoId} ` +
          `failure=${resolved.failureReason ?? 'unknown'}`,
      );
      return {
        ok: false,
        postId: post.id,
        refreshed: false,
        reason: resolved.failureReason ?? 'graph_video_source_missing',
      };
    }

    await this.applyMediaPlanToPost({
      postId: post.id,
      syncedPostId: synced.id,
      videoId,
      videoUrl: resolved.source,
      thumbnailUrl: resolved.thumbnail ?? post.facebookVideoThumbnail,
      durationSec: resolved.durationSec,
      hasAudio: resolved.hasAudio,
      mimeType: resolved.mimeType,
      failureReason: resolved.failureReason,
    });

    return {
      ok: true,
      postId: post.id,
      refreshed: true,
      videoUrl: resolved.source,
      thumbnailUrl: resolved.thumbnail ?? post.facebookVideoThumbnail,
    };
  }

  async updateExistingFromGraphItem(input: {
    postId: string;
    syncedPostId: string;
    pageId: string;
    item: GraphFeedItem;
    pageToken: string;
    existingVideoId?: string | null;
    force?: boolean;
    logSource?: string;
  }): Promise<{
    updated: boolean;
    videoUrl: string | null;
    thumbnailUrl: string | null;
    reason?: string;
  }> {
    const extracted = extractMediaFromGraphItem(input.item);
    const videoId = extracted.videoId?.trim() || input.existingVideoId?.trim() || null;
    const permalink =
      input.item.permalink_url?.trim() ||
      extracted.linkUrl?.trim() ||
      null;

    let resolvedVideo = null;
    if (videoId) {
      resolvedVideo = await resolveFacebookVideoFromGraph(videoId, input.pageToken);
    }

    const mediaPlan = buildFacebookImportMediaPlan({
      permalink,
      extracted,
      fullPicture: input.item.full_picture,
      resolvedVideo,
    });

    const message = (input.item.message ?? input.item.story ?? '').trim();
    const facebookEmbedUrl = permalink
      ? buildFacebookEmbedUrl(permalink, mediaPlan.facebookPostType)
      : null;

    const post = await this.prisma.post.findUnique({
      where: { id: input.postId },
      select: { videoUrl: true, facebookVideoThumbnail: true, description: true, content: true },
    });
    if (!post) return { updated: false, videoUrl: null, thumbnailUrl: null, reason: 'post_missing' };

    const urlChanged =
      Boolean(mediaPlan.videoUrl) && mediaPlan.videoUrl !== (post.videoUrl?.trim() || null);
    const thumbChanged =
      Boolean(mediaPlan.thumbnailUrl) &&
      mediaPlan.thumbnailUrl !== (post.facebookVideoThumbnail?.trim() || null);
    const textChanged = Boolean(message && message !== (post.content?.trim() || ''));

    if (!input.force && !urlChanged && !thumbChanged && !textChanged) {
      await this.touchSyncedPost(input.syncedPostId);
      return {
        updated: false,
        videoUrl: post.videoUrl,
        thumbnailUrl: post.facebookVideoThumbnail,
        reason: 'unchanged',
      };
    }

    await this.applyMediaPlanToPost({
      postId: input.postId,
      syncedPostId: input.syncedPostId,
      pageId: input.pageId,
      videoId,
      videoUrl: mediaPlan.videoUrl,
      thumbnailUrl: mediaPlan.thumbnailUrl,
      durationSec: mediaPlan.durationSec,
      hasAudio: mediaPlan.hasAudio,
      mimeType: mediaPlan.mimeType,
      failureReason: mediaPlan.videoUrlFailureReason,
      message,
      permalink,
      facebookEmbedUrl,
      facebookPostType: mediaPlan.facebookPostType,
      rawJson: input.item,
    });

    if (urlChanged) {
      this.logger.log(
        `[FacebookMediaRefresh] ${input.logSource ?? 'sync'} postId=${input.postId} ` +
          `videoId=${videoId ?? 'n/a'} refreshed=true`,
      );
    }

    return {
      updated: urlChanged || thumbChanged || textChanged,
      videoUrl: mediaPlan.videoUrl,
      thumbnailUrl: mediaPlan.thumbnailUrl,
    };
  }

  async applyMediaPlanToPost(input: {
    postId: string;
    syncedPostId: string;
    pageId?: string;
    videoId?: string | null;
    videoUrl: string | null;
    thumbnailUrl: string | null;
    durationSec?: number | null;
    hasAudio?: boolean | null;
    mimeType?: string | null;
    failureReason?: string | null;
    message?: string;
    permalink?: string | null;
    facebookEmbedUrl?: string | null;
    facebookPostType?: import('@prisma/client').FacebookPostType | null;
    rawJson?: GraphFeedItem;
  }) {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const videoMedia = await tx.media.findFirst({
        where: { postId: input.postId, type: 'video' },
      });

      await tx.post.update({
        where: { id: input.postId },
        data: {
          videoUrl: input.videoUrl,
          facebookVideoSourceUrl: input.videoUrl,
          facebookVideoThumbnail: input.thumbnailUrl,
          previewImage: input.thumbnailUrl,
          imageUrl: input.videoUrl ? null : undefined,
          facebookVideoId: input.videoId ?? undefined,
          facebookPageId: input.pageId ?? undefined,
          facebookVideoDurationSec: input.durationSec ?? undefined,
          facebookVideoHasAudio: input.hasAudio ?? undefined,
          facebookVideoMimeType: input.mimeType ?? undefined,
          lastMediaRefreshAt: now,
          type: input.videoUrl ? 'video' : undefined,
          ...(input.message ? { content: input.message } : {}),
          ...(input.permalink
            ? {
                facebookPermalink: input.permalink,
                externalUrl: input.permalink,
              }
            : {}),
          ...(input.facebookEmbedUrl ? { facebookEmbedUrl: input.facebookEmbedUrl } : {}),
          ...(input.facebookPostType ? { facebookPostType: input.facebookPostType } : {}),
        },
      });

      if (input.videoUrl) {
        if (videoMedia) {
          await tx.media.update({
            where: { id: videoMedia.id },
            data: { url: input.videoUrl },
          });
        } else {
          await tx.media.create({
            data: {
              postId: input.postId,
              url: input.videoUrl,
              type: 'video',
              order: 1,
            },
          });
        }
      }

      await tx.facebookSyncedPost.update({
        where: { id: input.syncedPostId },
        data: {
          videoSourceUrl: input.videoUrl,
          fullPictureUrl: input.thumbnailUrl,
          videoUrlFailureReason: input.failureReason,
          videoHasAudio: input.hasAudio,
          videoMimeType: input.mimeType,
          facebookVideoId: input.videoId ?? undefined,
          lastMediaRefreshAt: now,
          lastSyncedAt: now,
          ...(input.message ? { message: input.message } : {}),
          ...(input.permalink ? { permalinkUrl: input.permalink } : {}),
          ...(input.rawJson ? { rawJson: input.rawJson as object } : {}),
        },
      });
    });
  }

  private async touchSyncedPost(syncedPostId: string) {
    await this.prisma.facebookSyncedPost.update({
      where: { id: syncedPostId },
      data: { lastSyncedAt: new Date() },
    });
  }

  async refreshStaleMediaForConnection(
    pageConnectionId: string,
    options?: { limit?: number; force?: boolean },
  ): Promise<FacebookMediaBatchRefreshResult> {
    const limit = options?.limit ?? FACEBOOK_MEDIA_REFRESH_BATCH_SIZE;
    const staleBefore = new Date(Date.now() - FACEBOOK_MEDIA_REFRESH_STALE_MS);

    const connection = await this.prisma.facebookPageConnection.findUnique({
      where: { id: pageConnectionId },
      select: { pageAccessTokenEncrypted: true, pageId: true, userId: true },
    });
    if (!connection?.pageAccessTokenEncrypted) {
      return { processed: 0, refreshed: 0, failed: 0, skipped: 0 };
    }

    let pageToken: string;
    try {
      pageToken = this.crypto.decrypt(connection.pageAccessTokenEncrypted);
    } catch {
      this.logger.warn(
        `[FacebookMediaRefresh] connection=${pageConnectionId} token_decrypt_failed`,
      );
      return { processed: 0, refreshed: 0, failed: 0, skipped: 0 };
    }

    const syncedPosts = await this.prisma.facebookSyncedPost.findMany({
      where: {
        pageConnectionId,
        OR: [
          { lastMediaRefreshAt: null },
          { lastMediaRefreshAt: { lt: staleBefore } },
        ],
        importedPostId: { not: null },
      },
      orderBy: [{ lastMediaRefreshAt: 'asc' }, { updatedAt: 'asc' }],
      take: limit,
      select: {
        id: true,
        importedPostId: true,
        facebookVideoId: true,
        rawJson: true,
        videoSourceUrl: true,
        lastMediaRefreshAt: true,
      },
    });

    let refreshed = 0;
    let failed = 0;
    let skipped = 0;

    for (const row of syncedPosts) {
      if (!row.importedPostId) {
        skipped += 1;
        continue;
      }

      const post = await this.prisma.post.findUnique({
        where: { id: row.importedPostId },
        select: {
          id: true,
          videoUrl: true,
          facebookVideoId: true,
          facebookPermalink: true,
          externalUrl: true,
          facebookVideoThumbnail: true,
          lastMediaRefreshAt: true,
        },
      });
      if (!post) {
        skipped += 1;
        continue;
      }

      const staleAt = row.lastMediaRefreshAt ?? post.lastMediaRefreshAt;
      const needsRefresh =
        options?.force ||
        !post.videoUrl?.trim() ||
        !isPlayableDirectVideoUrl(post.videoUrl) ||
        !staleAt ||
        staleAt < staleBefore;

      if (!needsRefresh) {
        skipped += 1;
        continue;
      }

      try {
        const raw = row.rawJson as GraphFeedItem | null;
        if (raw) {
          const result = await this.updateExistingFromGraphItem({
            postId: post.id,
            syncedPostId: row.id,
            pageId: connection.pageId,
            item: raw,
            pageToken,
            existingVideoId: post.facebookVideoId ?? row.facebookVideoId,
            force: options?.force,
            logSource: 'cron',
          });
          if (result.updated) refreshed += 1;
          else skipped += 1;
        } else {
          const result = await this.refreshPostMediaFromStoredIds(
            post,
            row,
            pageToken,
            'cron',
          );
          if (result.refreshed) refreshed += 1;
          else failed += 1;
        }
      } catch (err) {
        failed += 1;
        this.logger.warn(
          `[FacebookMediaRefresh] cron postId=${post.id} error=${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    this.logger.log(
      `[FacebookMediaRefresh] connection=${pageConnectionId} processed=${syncedPosts.length} ` +
        `refreshed=${refreshed} failed=${failed} skipped=${skipped}`,
    );

    return {
      processed: syncedPosts.length,
      refreshed,
      failed,
      skipped,
    };
  }

  async repairAllImportedFacebookVideos(options?: {
    limit?: number;
    userId?: string;
  }): Promise<FacebookMediaBatchRefreshResult> {
    const limit = options?.limit ?? 500;
    const connections = await this.prisma.facebookPageConnection.findMany({
      where: {
        isActive: true,
        ...(options?.userId ? { userId: options.userId } : {}),
      },
      select: { id: true },
    });

    let refreshed = 0;
    let failed = 0;
    let skipped = 0;
    let processed = 0;

    for (const conn of connections) {
      const batch = await this.refreshStaleMediaForConnection(conn.id, {
        limit: Math.max(1, Math.floor(limit / Math.max(connections.length, 1))),
        force: true,
      });
      processed += batch.processed;
      refreshed += batch.refreshed;
      failed += batch.failed;
      skipped += batch.skipped;
    }

    this.logger.log(
      `[FacebookMediaRefresh] repairAll processed=${processed} refreshed=${refreshed} failed=${failed}`,
    );

    return { processed, refreshed, failed, skipped };
  }

  async countBrokenFacebookVideos(userId?: string): Promise<number> {
    const posts = await this.prisma.post.findMany({
      where: {
        source: PostSource.FACEBOOK,
        OR: [
          { facebookPostType: { in: ['FACEBOOK_VIDEO', 'FACEBOOK_REEL'] } },
          { videoUrl: { not: null } },
        ],
        ...(userId ? { userId } : {}),
      },
      select: { videoUrl: true, facebookVideoHasAudio: true },
      take: 2000,
    });

    let broken = 0;
    for (const p of posts) {
      const url = p.videoUrl?.trim();
      if (!url) {
        broken += 1;
        continue;
      }
      if (!isPlayableDirectVideoUrl(url)) {
        broken += 1;
        continue;
      }
      const alive = await this.probeMediaUrl(url);
      if (!alive) broken += 1;
    }
    return broken;
  }

  async probeMediaUrl(url: string): Promise<boolean> {
    try {
      const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
      if (res.status === 403 || res.status === 404 || res.status === 410) return false;
      return res.ok;
    } catch {
      return false;
    }
  }
}
