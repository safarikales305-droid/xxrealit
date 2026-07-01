import { Injectable, NotFoundException } from '@nestjs/common';
import { SocialIntroPropertyType } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import {
  type ListingIntroContext,
  buildIntroVideoLookupOrder,
  resolveSocialIntroPropertyType,
} from './social-intro-property-type.util';

export type ActiveIntroVideo = {
  id: string;
  title: string;
  videoUrl: string;
  durationSeconds: number | null;
  updatedAt: Date;
};

@Injectable()
export class SocialIntroVideoService {
  constructor(private readonly prisma: PrismaService) {}

  async listAll() {
    return this.prisma.socialIntroVideo.findMany({
      orderBy: [{ propertyType: 'asc' }, { priority: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  async findActiveForPropertyType(
    propertyType: SocialIntroPropertyType,
  ): Promise<ActiveIntroVideo | null> {
    const row = await this.prisma.socialIntroVideo.findFirst({
      where: { propertyType, active: true },
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
      select: {
        id: true,
        title: true,
        videoUrl: true,
        durationSeconds: true,
        updatedAt: true,
      },
    });
    if (!row?.videoUrl?.trim()) return null;
    return row;
  }

  /** Najde aktivní úvodní video pro inzerát (s fallbacky Novostavba / Pronájem). */
  async findIntroForListing(listingContext: ListingIntroContext): Promise<{
    intro: ActiveIntroVideo;
    matchedPropertyType: SocialIntroPropertyType;
    structuralPropertyType: SocialIntroPropertyType;
  } | null> {
    const structuralPropertyType = resolveSocialIntroPropertyType(listingContext);
    const lookupOrder = buildIntroVideoLookupOrder(listingContext);

    for (const propertyType of lookupOrder) {
      const intro = await this.findActiveForPropertyType(propertyType);
      if (intro) {
        return { intro, matchedPropertyType: propertyType, structuralPropertyType };
      }
    }
    return null;
  }

  async invalidateCompositionCacheForIntro(introVideoId: string): Promise<void> {
    await this.prisma.socialReelCompositionCache.deleteMany({ where: { introVideoId } });
  }

  async create(input: {
    title: string;
    propertyType: SocialIntroPropertyType;
    videoUrl: string;
    thumbnailUrl?: string | null;
    durationSeconds?: number | null;
    active?: boolean;
    priority?: number;
  }) {
    return this.prisma.socialIntroVideo.create({
      data: {
        title: input.title.trim(),
        propertyType: input.propertyType,
        videoUrl: input.videoUrl.trim(),
        thumbnailUrl: input.thumbnailUrl?.trim() || null,
        durationSeconds: input.durationSeconds ?? null,
        active: input.active !== false,
        priority: Number.isFinite(input.priority) ? Math.trunc(input.priority!) : 0,
      },
    });
  }

  async update(
    id: string,
    input: Partial<{
      title: string;
      propertyType: SocialIntroPropertyType;
      videoUrl: string;
      thumbnailUrl: string | null;
      durationSeconds: number | null;
      active: boolean;
      priority: number;
    }>,
  ) {
    await this.assertExists(id);
    const data: Record<string, unknown> = {};
    if (input.title !== undefined) data.title = input.title.trim();
    if (input.propertyType !== undefined) data.propertyType = input.propertyType;
    if (input.videoUrl !== undefined) data.videoUrl = input.videoUrl.trim();
    if (input.thumbnailUrl !== undefined) data.thumbnailUrl = input.thumbnailUrl?.trim() || null;
    if (input.durationSeconds !== undefined) data.durationSeconds = input.durationSeconds;
    if (input.active !== undefined) data.active = input.active;
    if (input.priority !== undefined) data.priority = Math.trunc(input.priority);
    const row = await this.prisma.socialIntroVideo.update({ where: { id }, data });
    await this.invalidateCompositionCacheForIntro(id);
    return row;
  }

  async delete(id: string) {
    await this.assertExists(id);
    await this.invalidateCompositionCacheForIntro(id);
    await this.prisma.socialIntroVideo.delete({ where: { id } });
    return { ok: true };
  }

  private async assertExists(id: string) {
    const row = await this.prisma.socialIntroVideo.findUnique({ where: { id }, select: { id: true } });
    if (!row) throw new NotFoundException('Úvodní video nenalezeno.');
  }
}
