import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { SocialIntroPropertyType } from '@prisma/client';
import { readFile, rm } from 'node:fs/promises';
import { PrismaService } from '../../../database/prisma.service';
import { PropertyMediaCloudinaryService } from '../../properties/property-media-cloudinary.service';
import {
  FACEBOOK_TEASER_MAX_SECONDS,
  FacebookVideoTeaserService,
} from './facebook-video-teaser.service';
import { ReelVideoComposerService } from './reel-video-composer.service';
import { SocialAutopostSettingsService } from './social-autopost-settings.service';
import { SocialIntroVideoService } from './social-intro-video.service';
import {
  type ListingIntroContext,
  resolveListingNormalizedType,
  resolveListingRawPropertyType,
  resolveSocialIntroPropertyType,
} from './social-intro-property-type.util';
import { FACEBOOK_REEL_MAX_SECONDS } from './social-facebook-reel.util';

export type ListingReelFinalVideoResult = {
  finalVideoUrl: string;
  sourceListingVideoUrl: string;
  teaserDurationSec: number;
  originalDurationSec: number | null;
  introVideoUsed: boolean;
  introVideoIdUsed: string | null;
  introVideoAttemptId: string | null;
  introVideoTitle: string | null;
  introVideoPropertyType: SocialIntroPropertyType | null;
  introVideoDurationSec: number | null;
  totalReelDurationSec: number | null;
  introVideoError: string | null;
  rawPropertyType: string | null;
  normalizedPropertyType: string | null;
  matchedIntroPropertyType: SocialIntroPropertyType | null;
  finalVideoGeneratedAt: Date;
  finalVideoSizeBytes: number | null;
  fromCache: boolean;
  teaserLocalPath?: string;
  drawtextUsed?: boolean;
  drawtextSkippedReason?: string | null;
  composeLog?: Record<string, unknown>;
};

export type BuildListingReelFinalVideoInput = {
  sourceVideoUrl: string;
  listingContext?: ListingIntroContext;
  forceRebuild?: boolean;
};

@Injectable()
export class ListingReelFinalVideoService {
  private readonly log = new Logger(ListingReelFinalVideoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SocialAutopostSettingsService,
    private readonly teaserService: FacebookVideoTeaserService,
    private readonly introVideos: SocialIntroVideoService,
    private readonly reelComposer: ReelVideoComposerService,
    private readonly cloudinary: PropertyMediaCloudinaryService,
  ) {}

  buildCacheKey(input: {
    introVideoId: string;
    introVideoUpdatedAt: Date;
    sourceListingVideoUrl: string;
    listingTeaserSeconds: number;
  }): string {
    const raw = [
      input.introVideoId,
      input.introVideoUpdatedAt.toISOString(),
      input.sourceListingVideoUrl.trim(),
      String(input.listingTeaserSeconds),
    ].join('|');
    return createHash('sha256').update(raw).digest('hex');
  }

  async buildFinalVideo(
    input: BuildListingReelFinalVideoInput,
  ): Promise<ListingReelFinalVideoResult> {
    await this.settings.reload();
    const global = this.settings.getSettings().global;
    const sourceListingVideoUrl = input.sourceVideoUrl.trim();
    if (!sourceListingVideoUrl) {
      throw new Error('Chybí URL videa inzerátu.');
    }

    const generatedAt = new Date();

    if (global.socialVideoPublishFull) {
      this.log.log(
        `[final-video] Publikace celého videa bez úvodu (socialVideoPublishFull): ${sourceListingVideoUrl}`,
      );
      return {
        finalVideoUrl: sourceListingVideoUrl,
        sourceListingVideoUrl,
        teaserDurationSec: 0,
        originalDurationSec: null,
        introVideoUsed: false,
        introVideoIdUsed: null,
        introVideoAttemptId: null,
        introVideoTitle: null,
        introVideoPropertyType: null,
        introVideoDurationSec: null,
        totalReelDurationSec: null,
        introVideoError: null,
        rawPropertyType: input.listingContext
          ? resolveListingRawPropertyType(input.listingContext)
          : null,
        normalizedPropertyType: input.listingContext
          ? resolveListingNormalizedType(input.listingContext)
          : null,
        matchedIntroPropertyType: null,
        finalVideoGeneratedAt: generatedAt,
        finalVideoSizeBytes: null,
        fromCache: false,
        drawtextSkippedReason: 'publikováno celé video bez teaseru',
      };
    }

    const maxSeconds =
      global.socialVideoUsePortalTeaserRule !== false
        ? (global.videoTeaserMaxSeconds ?? FACEBOOK_TEASER_MAX_SECONDS)
        : (global.socialVideoTeaserSeconds ??
          global.videoTeaserMaxSeconds ??
          FACEBOOK_TEASER_MAX_SECONDS);

    const rendered = await this.teaserService.createListingTeaserLocal(
      sourceListingVideoUrl,
      maxSeconds,
    );

    const structuralType = input.listingContext
      ? resolveSocialIntroPropertyType(input.listingContext)
      : null;
    const rawPropertyType = input.listingContext
      ? resolveListingRawPropertyType(input.listingContext)
      : null;
    const normalizedPropertyType = input.listingContext
      ? resolveListingNormalizedType(input.listingContext)
      : null;

    const introMatch =
      input.listingContext != null
        ? await this.introVideos.findIntroForListing(input.listingContext)
        : null;

    this.log.log(
      `[final-video] listingId/context raw=${rawPropertyType ?? '—'} normalized=${normalizedPropertyType ?? '—'} structural=${structuralType ?? '—'} intro=${
        introMatch
          ? `${introMatch.intro.title} (enum=${introMatch.matchedPropertyType}, normalized=${introMatch.normalizedPropertyType}, id=${introMatch.intro.id})`
          : 'nenalezeno'
      } source=${sourceListingVideoUrl}`,
    );

    let composeResult: Awaited<
      ReturnType<ReelVideoComposerService['composeIntroAndListing']>
    > | null = null;

    try {
      if (!introMatch) {
        const uploadBuffer = await readFile(rendered.teaserPath);
        const finalVideoUrl = await this.cloudinary.uploadVideoBuffer(
          uploadBuffer,
          'facebook-teaser.mp4',
        );
        const size = uploadBuffer.length;
        this.log.log(
          `[final-video] Bez úvodního videa — ukázka inzerátu (${size} B): ${finalVideoUrl} | raw=${rawPropertyType} normalized=${normalizedPropertyType}`,
        );
        return {
          finalVideoUrl,
          sourceListingVideoUrl,
          teaserDurationSec: rendered.teaserDurationSec,
          originalDurationSec: rendered.originalDurationSec,
          introVideoUsed: false,
          introVideoIdUsed: null,
          introVideoAttemptId: null,
          introVideoTitle: null,
          introVideoPropertyType: structuralType,
          introVideoDurationSec: null,
          totalReelDurationSec: rendered.teaserDurationSec,
          introVideoError: 'Nenalezeno aktivní úvodní video pro kategorii',
          rawPropertyType,
          normalizedPropertyType,
          matchedIntroPropertyType: null,
          finalVideoGeneratedAt: generatedAt,
          finalVideoSizeBytes: size,
          fromCache: false,
          teaserLocalPath: rendered.teaserPath,
          drawtextUsed: rendered.drawtextUsed,
          drawtextSkippedReason: rendered.drawtextSkippedReason,
        };
      }

      const { intro, matchedPropertyType, structuralPropertyType: structType } = introMatch;
      const cacheKey = this.buildCacheKey({
        introVideoId: intro.id,
        introVideoUpdatedAt: intro.updatedAt,
        sourceListingVideoUrl,
        listingTeaserSeconds: rendered.teaserDurationSec,
      });

      if (!input.forceRebuild) {
        const cached = await this.prisma.socialReelCompositionCache.findUnique({
          where: { cacheKey },
        });
        if (cached?.finalVideoUrl?.trim()) {
          this.log.log(
            `[final-video] Cache hit: intro=${intro.id}, final=${cached.finalVideoUrl}`,
          );
          return {
            finalVideoUrl: cached.finalVideoUrl,
            sourceListingVideoUrl,
            teaserDurationSec: rendered.teaserDurationSec,
            originalDurationSec: rendered.originalDurationSec,
            introVideoUsed: true,
            introVideoIdUsed: intro.id,
            introVideoAttemptId: intro.id,
            introVideoTitle: intro.title,
            introVideoPropertyType: structType,
            introVideoDurationSec:
              intro.durationSeconds ??
              (cached.totalDurationSec != null
                ? Math.max(0, cached.totalDurationSec - rendered.teaserDurationSec)
                : null),
            totalReelDurationSec: cached.totalDurationSec,
            introVideoError: null,
            rawPropertyType,
            normalizedPropertyType,
            matchedIntroPropertyType: matchedPropertyType,
            finalVideoGeneratedAt: cached.createdAt,
            finalVideoSizeBytes: cached.finalVideoSizeBytes,
            fromCache: true,
            teaserLocalPath: rendered.teaserPath,
            drawtextUsed: rendered.drawtextUsed,
            drawtextSkippedReason: rendered.drawtextSkippedReason,
            composeLog: {
              cacheKey,
              matchedPropertyType,
              introVideoUrl: intro.videoUrl,
              cached: true,
            },
          };
        }
      }

      let uploadBuffer: Buffer;
      let introVideoUsed = false;
      let introVideoDurationSec: number | null = null;
      let totalReelDurationSec: number | null = null;
      let introVideoError: string | null = null;
      let composeLog: Record<string, unknown> = {
        cacheKey,
        matchedPropertyType,
        introVideoUrl: intro.videoUrl,
        listingTeaserPath: rendered.teaserPath,
      };

      try {
        composeResult = await this.reelComposer.composeIntroAndListing(
          intro.videoUrl,
          rendered.teaserPath,
        );
        composeLog = {
          ...composeLog,
          ffmpegCommands: composeResult.ffmpegCommands,
          introLocalPath: composeResult.introLocalPath,
          listingLocalPath: composeResult.listingLocalPath,
          outputPath: composeResult.outputPath,
        };
        this.log.log(
          `[final-video] FFmpeg příkazy:\n${composeResult.ffmpegCommands.join('\n')}`,
        );

        if (
          composeResult.durationSec != null &&
          composeResult.durationSec > FACEBOOK_REEL_MAX_SECONDS
        ) {
          this.log.warn(
            `[final-video] Výsledné video ${composeResult.durationSec}s přesahuje doporučených ${FACEBOOK_REEL_MAX_SECONDS}s`,
          );
        }

        uploadBuffer = await this.reelComposer.readOutputBuffer(composeResult);
        introVideoUsed = true;
        introVideoDurationSec =
          intro.durationSeconds ??
          (composeResult.durationSec != null
            ? Math.max(0, composeResult.durationSec - rendered.teaserDurationSec)
            : null);
        totalReelDurationSec = composeResult.durationSec;
      } catch (err) {
        introVideoError = err instanceof Error ? err.message : String(err);
        composeLog = { ...composeLog, composeError: introVideoError };
        this.log.error(
          `[final-video] Spojení selhalo (${matchedPropertyType}), fallback na ukázku: ${introVideoError} | introId=${intro.id}`,
        );
        uploadBuffer = await readFile(rendered.teaserPath);
      }

      const finalVideoUrl = await this.cloudinary.uploadVideoBuffer(
        uploadBuffer,
        introVideoUsed ? 'facebook-reel-final.mp4' : 'facebook-teaser.mp4',
      );
      const finalVideoSizeBytes = uploadBuffer.length;

      if (introVideoUsed && composeResult) {
        const ffmpegCommand = composeResult.ffmpegCommands.join('\n');
        await this.prisma.socialReelCompositionCache.upsert({
          where: { cacheKey },
          create: {
            cacheKey,
            introVideoId: intro.id,
            introVideoUpdatedAt: intro.updatedAt,
            sourceListingVideoUrl,
            listingTeaserSeconds: rendered.teaserDurationSec,
            finalVideoUrl,
            finalVideoSizeBytes,
            totalDurationSec: totalReelDurationSec,
            ffmpegCommand,
          },
          update: {
            introVideoUpdatedAt: intro.updatedAt,
            finalVideoUrl,
            finalVideoSizeBytes,
            totalDurationSec: totalReelDurationSec,
            ffmpegCommand,
          },
        });
      }

      this.log.log(
        `[final-video] Hotovo: intro=${introVideoUsed ? intro.title : 'ne'}, délka=${totalReelDurationSec ?? rendered.teaserDurationSec}s, ${finalVideoSizeBytes} B → ${finalVideoUrl}`,
      );

      return {
        finalVideoUrl,
        sourceListingVideoUrl,
        teaserDurationSec: rendered.teaserDurationSec,
        originalDurationSec: rendered.originalDurationSec,
        introVideoUsed,
        introVideoIdUsed: introVideoUsed ? intro.id : null,
        introVideoAttemptId: intro.id,
        introVideoTitle: introVideoUsed ? intro.title : intro.title,
        introVideoPropertyType: structType,
        introVideoDurationSec,
        totalReelDurationSec: totalReelDurationSec ?? rendered.teaserDurationSec,
        introVideoError,
        rawPropertyType,
        normalizedPropertyType,
        matchedIntroPropertyType: matchedPropertyType,
        finalVideoGeneratedAt: generatedAt,
        finalVideoSizeBytes,
        fromCache: false,
        teaserLocalPath: rendered.teaserPath,
        drawtextUsed: rendered.drawtextUsed,
        drawtextSkippedReason: rendered.drawtextSkippedReason,
        composeLog,
      };
    } finally {
      if (composeResult) {
        await this.reelComposer.cleanup(composeResult);
      }
      await rm(rendered.tmpRoot, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async updateScheduleFinalVideoSnapshot(
    scheduleId: string,
    result: ListingReelFinalVideoResult,
  ): Promise<void> {
    await this.prisma.socialPublishSchedule.update({
      where: { id: scheduleId },
      data: {
        lastIntroVideoUsed: result.introVideoUsed,
        lastIntroVideoIdUsed: result.introVideoIdUsed,
        lastIntroVideoAttemptId: result.introVideoAttemptId,
        lastIntroVideoTitle: result.introVideoTitle,
        lastIntroVideoError: result.introVideoError,
        lastRawPropertyType: result.rawPropertyType,
        lastNormalizedPropertyType: result.normalizedPropertyType,
        lastMatchedIntroPropertyType: result.matchedIntroPropertyType,
        lastSourceListingVideoUrl: result.sourceListingVideoUrl,
        lastFinalVideoUrl: result.finalVideoUrl,
        lastFinalVideoGeneratedAt: result.finalVideoGeneratedAt,
        lastTotalReelDurationSec: result.totalReelDurationSec,
      },
    });
  }
}
