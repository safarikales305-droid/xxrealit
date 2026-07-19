import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SeoContentStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { buildProgrammaticSeoCopy } from './programmatic-seo.util';
import type { CzGeoLocation } from './cz-geo-locations.data';
import { getProgrammaticSeoIntent } from './programmatic-seo-intents';
import { buildProgrammaticSeoPageKey } from './seo-location.util';
import { SeoLocationService } from './seo-location.service';

export type SeoContentGenerateInput = {
  intentSlug: string;
  locationSlug: string;
  useAi?: boolean;
};

@Injectable()
export class SeoContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly locations: SeoLocationService,
  ) {}

  async generateDraft(input: SeoContentGenerateInput, createdBy?: string) {
    const intent = getProgrammaticSeoIntent(input.intentSlug);
    if (!intent) throw new BadRequestException('Neznámý intent.');

    const dbLoc = await this.locations.findBySlug(input.locationSlug);
    if (!dbLoc) throw new NotFoundException('Lokalita nenalezena v databázi.');

    const locForCopy = {
      slug: dbLoc.slug,
      name: dbLoc.name,
      locative: dbLoc.locative || dbLoc.name,
      kind: 'mesto' as const,
      searchTerms: dbLoc.searchTerms,
    } satisfies Pick<CzGeoLocation, 'slug' | 'name' | 'locative' | 'kind' | 'searchTerms'>;

    const copy = buildProgrammaticSeoCopy(intent, locForCopy as CzGeoLocation);
    const pageKey = buildProgrammaticSeoPageKey(input.intentSlug, dbLoc.slug);

    const existing = await this.prisma.seoPageContent.findUnique({ where: { pageKey } });
    if (existing?.isLocked) {
      throw new BadRequestException('Obsah je zamčený — AI ho nesmí přepsat.');
    }

    const snapshot = {
      title: copy.title,
      description: copy.description,
      h1: copy.h1,
      bodyText: copy.bodyText,
      faq: copy.faq,
      keywords: copy.keywords,
    };

    if (existing) {
      const nextVersion =
        (await this.prisma.seoPageContentVersion.count({ where: { contentId: existing.id } })) + 1;
      await this.prisma.seoPageContentVersion.create({
        data: {
          contentId: existing.id,
          version: nextVersion,
          snapshot: existing as unknown as Prisma.InputJsonValue,
          createdBy,
          note: 'Před AI návrhem',
        },
      });
      return this.prisma.seoPageContent.update({
        where: { id: existing.id },
        data: {
          status: SeoContentStatus.DRAFT,
          title: copy.title,
          description: copy.description,
          h1: copy.h1,
          bodyText: copy.bodyText,
          faq: copy.faq as Prisma.InputJsonValue,
          aiGenerated: Boolean(input.useAi),
          qualityScore: this.scoreContent(copy),
        },
      });
    }

    return this.prisma.seoPageContent.create({
      data: {
        pageKey,
        intentSlug: input.intentSlug,
        locationId: dbLoc.id,
        status: SeoContentStatus.DRAFT,
        title: copy.title,
        description: copy.description,
        h1: copy.h1,
        bodyText: copy.bodyText,
        faq: copy.faq as Prisma.InputJsonValue,
        aiGenerated: Boolean(input.useAi),
        qualityScore: this.scoreContent(copy),
      },
    });
  }

  async updateStatus(
    id: string,
    status: SeoContentStatus,
    editorId?: string,
  ) {
    const row = await this.prisma.seoPageContent.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('SEO obsah nenalezen.');

    const version =
      (await this.prisma.seoPageContentVersion.count({ where: { contentId: id } })) + 1;
    await this.prisma.seoPageContentVersion.create({
      data: {
        contentId: id,
        version,
        snapshot: row as unknown as Prisma.InputJsonValue,
        createdBy: editorId,
        note: `Status → ${status}`,
      },
    });

    return this.prisma.seoPageContent.update({
      where: { id },
      data: {
        status,
        publishedAt: status === SeoContentStatus.PUBLISHED ? new Date() : row.publishedAt,
        isLocked: status === SeoContentStatus.LOCKED ? true : row.isLocked,
      },
    });
  }

  async getPublished(pageKey: string) {
    return this.prisma.seoPageContent.findFirst({
      where: {
        pageKey,
        status: { in: [SeoContentStatus.PUBLISHED, SeoContentStatus.LOCKED] },
      },
    });
  }

  async listAdmin(q?: string, status?: SeoContentStatus) {
    return this.prisma.seoPageContent.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(q?.trim()
          ? {
              OR: [
                { pageKey: { contains: q.trim(), mode: 'insensitive' } },
                { title: { contains: q.trim(), mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      include: { location: { select: { name: true, slug: true } } },
    });
  }

  private scoreContent(copy: {
    title: string;
    description: string;
    h1: string;
    bodyText: string;
    faq: unknown[];
  }): number {
    let score = 0;
    if (copy.title.length >= 20 && copy.title.length <= 70) score += 25;
    if (copy.description.length >= 80 && copy.description.length <= 160) score += 25;
    if (copy.h1.trim()) score += 20;
    if (copy.bodyText.length >= 200) score += 15;
    if (copy.faq.length >= 3) score += 15;
    return Math.min(100, score);
  }
}
