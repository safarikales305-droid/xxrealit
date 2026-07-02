import { Injectable, NotFoundException } from '@nestjs/common';
import { SocialIntroPropertyType } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import {
  type ListingIntroContext,
  type NormalizedPropertyType,
  buildIntroVideoLookupOrder,
  resolveListingNormalizedType,
  resolveSocialIntroPropertyType,
  socialIntroEnumToNormalized,
} from './social-intro-property-type.util';

export type ActiveIntroVideo = {
  id: string;
  title: string;
  videoUrl: string;
  durationSeconds: number | null;
  updatedAt: Date;
  propertyType: SocialIntroPropertyType;
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
    return this.findActiveForNormalizedType(socialIntroEnumToNormalized(propertyType));
  }

  /** Hledá aktivní intro podle normalizovaného typu (house = HOUSE = DUM = Dům). */
  async findActiveForNormalizedType(
    normalized: NormalizedPropertyType,
  ): Promise<ActiveIntroVideo | null> {
    const rows = await this.prisma.socialIntroVideo.findMany({
      where: { active: true, videoUrl: { not: '' } },
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
      select: {
        id: true,
        title: true,
        videoUrl: true,
        durationSeconds: true,
        updatedAt: true,
        propertyType: true,
      },
    });

    const match = rows.find(
      (row) => socialIntroEnumToNormalized(row.propertyType) === normalized,
    );
    if (!match?.videoUrl?.trim()) return null;
    return match;
  }

  /** Najde aktivní úvodní video pro inzerát (s fallbacky Novostavba / Pronájem). */
  async findIntroForListing(listingContext: ListingIntroContext): Promise<{
    intro: ActiveIntroVideo;
    matchedPropertyType: SocialIntroPropertyType;
    structuralPropertyType: SocialIntroPropertyType;
    normalizedPropertyType: NormalizedPropertyType;
  } | null> {
    const structuralPropertyType = resolveSocialIntroPropertyType(listingContext);
    const normalizedPropertyType = resolveListingNormalizedType(listingContext);
    const lookupOrder = buildIntroVideoLookupOrder(listingContext);
    const tried = new Set<NormalizedPropertyType>();

    for (const propertyType of lookupOrder) {
      const normalized = socialIntroEnumToNormalized(propertyType);
      if (tried.has(normalized)) continue;
      tried.add(normalized);

      const intro = await this.findActiveForNormalizedType(normalized);
      if (intro) {
        return {
          intro,
          matchedPropertyType: intro.propertyType,
          structuralPropertyType,
          normalizedPropertyType,
        };
      }
    }
    return null;
  }

  /** Rychlá predikce z přednačteného katalogu (pro seznam plánů). */
  predictIntroForListingFromCatalog(
    listingContext: ListingIntroContext,
    catalog: ActiveIntroVideo[],
  ): {
    intro: ActiveIntroVideo;
    matchedPropertyType: SocialIntroPropertyType;
    structuralPropertyType: SocialIntroPropertyType;
    normalizedPropertyType: NormalizedPropertyType;
  } | null {
    const structuralPropertyType = resolveSocialIntroPropertyType(listingContext);
    const normalizedPropertyType = resolveListingNormalizedType(listingContext);
    const lookupOrder = buildIntroVideoLookupOrder(listingContext);
    const tried = new Set<NormalizedPropertyType>();

    for (const propertyType of lookupOrder) {
      const normalized = socialIntroEnumToNormalized(propertyType);
      if (tried.has(normalized)) continue;
      tried.add(normalized);

      const intro = catalog.find(
        (row) => socialIntroEnumToNormalized(row.propertyType) === normalized,
      );
      if (intro) {
        return {
          intro,
          matchedPropertyType: intro.propertyType,
          structuralPropertyType,
          normalizedPropertyType,
        };
      }
    }
    return null;
  }

  async loadActiveIntroCatalog(): Promise<ActiveIntroVideo[]> {
    return this.prisma.socialIntroVideo.findMany({
      where: { active: true, videoUrl: { not: '' } },
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
      select: {
        id: true,
        title: true,
        videoUrl: true,
        durationSeconds: true,
        updatedAt: true,
        propertyType: true,
      },
    });
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
