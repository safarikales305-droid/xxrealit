import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PostSource } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { TokenEncryptionService } from '../token-encryption.service';
import { isFacebookVideoType } from '../facebook-url-import/facebook-embed.util';
import {
  extractMediaFromGraphItem,
  isPlayableDirectVideoUrl,
  resolveFacebookVideoFromGraph,
  type GraphFeedItem,
} from './facebook-video-media.util';

@Injectable()
export class FacebookVideoMigrationService implements OnModuleInit {
  private readonly logger = new Logger(FacebookVideoMigrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: TokenEncryptionService,
  ) {}

  onModuleInit() {
    void this.repairImportedFacebookVideos().catch((err) => {
      this.logger.warn(`facebook video repair failed: ${String(err)}`);
    });
  }

  async repairImportedFacebookVideos(): Promise<{ repaired: number; skipped: boolean }> {
    const posts = await this.prisma.post.findMany({
      where: {
        source: PostSource.FACEBOOK,
        OR: [
          { facebookPostType: { in: ['FACEBOOK_VIDEO', 'FACEBOOK_REEL'] } },
          { videoUrl: { not: null } },
          {
            media: {
              some: { type: 'image' },
            },
          },
        ],
      },
      include: {
        media: true,
      },
      take: 500,
    });

    let repaired = 0;
    for (const post of posts) {
      const isVideo =
        isFacebookVideoType(post.facebookPostType) || Boolean(post.videoUrl?.trim());
      if (!isVideo) continue;

      const thumbnail =
        post.facebookVideoThumbnail?.trim() ||
        post.previewImage?.trim() ||
        post.imageUrl?.trim() ||
        null;
      const hasImageMedia = post.media.some((m) => m.type === 'image');
      const videoMedia = post.media.find((m) => m.type === 'video');
      const needsVideoUrl =
        !post.videoUrl?.trim() ||
        !isPlayableDirectVideoUrl(post.videoUrl) ||
        post.videoUrl === thumbnail;

      let nextVideoUrl = post.videoUrl?.trim() || videoMedia?.url?.trim() || null;
      let nextSourceUrl = post.facebookVideoSourceUrl?.trim() || null;
      let durationSec = post.facebookVideoDurationSec ?? null;
      let hasAudio = post.facebookVideoHasAudio ?? null;
      let mimeType = post.facebookVideoMimeType ?? null;
      let failureReason: string | null = null;

      if (needsVideoUrl || hasImageMedia) {
        const synced = await this.prisma.facebookSyncedPost.findFirst({
          where: { importedPostId: post.id },
          include: {
            pageConnection: { select: { pageAccessTokenEncrypted: true } },
          },
        });
        const raw = synced?.rawJson as GraphFeedItem | null;
        if (raw && synced?.pageConnection?.pageAccessTokenEncrypted) {
          try {
            const token = this.crypto.decrypt(synced.pageConnection.pageAccessTokenEncrypted);
            const extracted = extractMediaFromGraphItem(raw);
            if (extracted.videoId) {
              const resolved = await resolveFacebookVideoFromGraph(extracted.videoId, token);
              if (resolved.source) {
                nextVideoUrl = resolved.source;
                nextSourceUrl = resolved.source;
                durationSec = resolved.durationSec;
                hasAudio = resolved.hasAudio;
                mimeType = resolved.mimeType;
                failureReason = resolved.failureReason;
              } else {
                failureReason = resolved.failureReason;
              }
            } else if (extracted.videoUrl) {
              nextVideoUrl = extracted.videoUrl;
              nextSourceUrl = extracted.videoUrl;
            }
          } catch (err) {
            failureReason = `repair_decrypt_failed: ${err instanceof Error ? err.message : String(err)}`;
          }
        }
      }

      const imageIds = post.media.filter((m) => m.type === 'image').map((m) => m.id);
      const shouldUpdate =
        hasImageMedia ||
        Boolean(post.imageUrl?.trim()) ||
        (needsVideoUrl && nextVideoUrl && nextVideoUrl !== post.videoUrl) ||
        post.facebookVideoHasAudio == null;

      if (!shouldUpdate && !imageIds.length) continue;

      await this.prisma.$transaction(async (tx) => {
        if (imageIds.length) {
          await tx.media.deleteMany({ where: { id: { in: imageIds } } });
        }
        await tx.post.update({
          where: { id: post.id },
          data: {
            imageUrl: null,
            previewImage: thumbnail,
            facebookVideoThumbnail: thumbnail,
            videoUrl: nextVideoUrl,
            facebookVideoSourceUrl: nextSourceUrl,
            facebookVideoDurationSec: durationSec,
            facebookVideoHasAudio: hasAudio,
            facebookVideoMimeType: mimeType,
            type: nextVideoUrl ? 'video' : post.type,
          },
        });
        if (nextVideoUrl && (!videoMedia || videoMedia.url !== nextVideoUrl)) {
          if (videoMedia) {
            await tx.media.update({
              where: { id: videoMedia.id },
              data: { url: nextVideoUrl },
            });
          } else {
            await tx.media.create({
              data: { postId: post.id, url: nextVideoUrl, type: 'video', order: 1 },
            });
          }
        }
        const synced = await tx.facebookSyncedPost.findFirst({
          where: { importedPostId: post.id },
          select: { id: true },
        });
        if (synced) {
          await tx.facebookSyncedPost.update({
            where: { id: synced.id },
            data: {
              videoSourceUrl: nextSourceUrl,
              videoUrlFailureReason: failureReason,
              videoHasAudio: hasAudio,
              videoMimeType: mimeType,
              fullPictureUrl: thumbnail,
            },
          });
        }
      });
      repaired += 1;
    }

    if (repaired > 0) {
      this.logger.log(`FACEBOOK_VIDEO_REPAIR repaired=${repaired}`);
    }
    return { repaired, skipped: false };
  }
}