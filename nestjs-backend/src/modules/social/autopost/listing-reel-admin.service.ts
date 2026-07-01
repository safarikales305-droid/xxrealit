import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SocialIntroPropertyType } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { toAbsoluteMediaUrl } from './social-publish-format.util';
import { ListingReelFinalVideoService } from './listing-reel-final-video.service';
import { buildIntroVideoLookupOrder } from './social-intro-property-type.util';

@Injectable()
export class ListingReelAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly finalVideo: ListingReelFinalVideoService,
  ) {}

  async testIntroCompose(input: {
    propertyType: SocialIntroPropertyType;
    propertyId?: string;
  }) {
    const property = await this.resolveSampleProperty(input.propertyType, input.propertyId);
    const videoUrl = toAbsoluteMediaUrl(property.videoUrl);
    if (!videoUrl) {
      throw new BadRequestException('Testovací inzerát nemá video.');
    }

    const result = await this.finalVideo.buildFinalVideo({
      sourceVideoUrl: videoUrl,
      listingContext: {
        propertyTypeKey: property.propertyTypeKey,
        propertyType: property.propertyType,
        offerType: property.offerType,
        title: property.title,
        description: property.description,
      },
      forceRebuild: true,
    });

    return {
      ok: true,
      propertyId: property.id,
      propertyTitle: property.title,
      result,
    };
  }

  async regenerateScheduleFinalVideo(scheduleId: string) {
    const schedule = await this.prisma.socialPublishSchedule.findUnique({
      where: { id: scheduleId },
    });
    if (!schedule) throw new NotFoundException('Plán nenalezen');

    const property = await this.prisma.property.findUnique({
      where: { id: schedule.contentId },
    });
    if (!property?.videoUrl?.trim()) {
      throw new BadRequestException('Inzerát nemá video pro Reel.');
    }

    const videoUrl = toAbsoluteMediaUrl(property.videoUrl);
    if (!videoUrl) throw new BadRequestException('Video inzerátu není dostupné.');

    const result = await this.finalVideo.buildFinalVideo({
      sourceVideoUrl: videoUrl,
      listingContext: {
        propertyTypeKey: property.propertyTypeKey,
        propertyType: property.propertyType,
        offerType: property.offerType,
        title: property.title,
        description: property.description,
      },
      forceRebuild: true,
    });

    await this.finalVideo.updateScheduleFinalVideoSnapshot(scheduleId, result);

    return { ok: true, scheduleId, result };
  }

  async regenerateAllScheduledFinalVideos() {
    const schedules = await this.prisma.socialPublishSchedule.findMany({
      where: {
        enabled: true,
        platform: 'FACEBOOK',
        contentType: { in: ['PROPERTY', 'SHORT'] },
      },
      take: 200,
    });

    const results: Array<{
      scheduleId: string;
      propertyId: string;
      ok: boolean;
      error?: string;
      finalVideoUrl?: string;
      introVideoUsed?: boolean;
    }> = [];

    for (const schedule of schedules) {
      try {
        const r = await this.regenerateScheduleFinalVideo(schedule.id);
        results.push({
          scheduleId: schedule.id,
          propertyId: schedule.contentId,
          ok: true,
          finalVideoUrl: r.result.finalVideoUrl,
          introVideoUsed: r.result.introVideoUsed,
        });
      } catch (err) {
        results.push({
          scheduleId: schedule.id,
          propertyId: schedule.contentId,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return {
      ok: true,
      processed: results.length,
      succeeded: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    };
  }

  private async resolveSampleProperty(
    propertyType: SocialIntroPropertyType,
    propertyId?: string,
  ) {
    if (propertyId) {
      const row = await this.prisma.property.findUnique({ where: { id: propertyId } });
      if (!row || row.deletedAt) throw new NotFoundException('Inzerát nenalezen.');
      return row;
    }

    const candidates = await this.prisma.property.findMany({
      where: {
        deletedAt: null,
        videoUrl: { not: null },
        approved: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 80,
    });

    const match = candidates.find((p) => {
      const order = buildIntroVideoLookupOrder({
        propertyTypeKey: p.propertyTypeKey,
        propertyType: p.propertyType,
        offerType: p.offerType,
        title: p.title,
        description: p.description,
      });
      return order.includes(propertyType);
    });

    if (!match) {
      throw new NotFoundException(
        `Nenalezen testovací inzerát s videem pro typ ${propertyType}. Zadejte propertyId.`,
      );
    }
    return match;
  }
}
