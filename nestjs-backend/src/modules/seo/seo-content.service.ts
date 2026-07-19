import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SeoContentStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { CzGeoLocation } from './cz-geo-locations.data';
import { getProgrammaticSeoIntent } from './programmatic-seo-intents';
import {
  buildExtendedSeoMetadata,
  buildProgrammaticSeoCopy,
} from './programmatic-seo.util';
import { buildProgrammaticSeoPageKey } from './seo-location.util';
import { SeoLocationService } from './seo-location.service';

export type SeoContentGenerateInput = {
  intentSlug: string;
  locationSlug: string;
  useAi?: boolean;
};

export type SeoContentUpdateInput = {
  title?: string | null;
  description?: string | null;
  keywords?: string[];
  h1?: string | null;
  h2?: string | null;
  bodyText?: string | null;
  faq?: unknown;
  internalLinks?: unknown;
  relatedLocations?: unknown;
  relatedPages?: unknown;
  canonical?: string | null;
  robots?: string | null;
  noindex?: boolean;
  ogTitle?: string | null;
  ogDescription?: string | null;
  ogImage?: string | null;
  twitterCard?: string | null;
  schemaJson?: unknown;
  altTexts?: unknown;
  redirectTo?: string | null;
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
    const extended = buildExtendedSeoMetadata(intent, locForCopy as CzGeoLocation, copy);
    const related = await this.locations.findRelated(dbLoc.slug, 6);
    extended.relatedLocations = related;

    const pageKey = buildProgrammaticSeoPageKey(input.intentSlug, dbLoc.slug);

    const existing = await this.prisma.seoPageContent.findUnique({ where: { pageKey } });
    if (existing?.isLocked) {
      throw new BadRequestException('Obsah je zamčený — AI ho nesmí přepsat.');
    }

    const data = {
      status: SeoContentStatus.DRAFT,
      title: copy.title,
      description: copy.description,
      keywords: copy.keywords,
      h1: copy.h1,
      h2: extended.h2,
      bodyText: copy.bodyText,
      faq: copy.faq as Prisma.InputJsonValue,
      internalLinks: extended.internalLinks as Prisma.InputJsonValue,
      relatedLocations: extended.relatedLocations as Prisma.InputJsonValue,
      relatedPages: extended.relatedPages as Prisma.InputJsonValue,
      canonical: extended.canonical,
      robots: extended.robots,
      noindex: false,
      ogTitle: extended.ogTitle,
      ogDescription: extended.ogDescription,
      ogImage: extended.ogImage,
      twitterCard: extended.twitterCard,
      schemaJson: extended.schemaJson as Prisma.InputJsonValue,
      altTexts: extended.altTexts as Prisma.InputJsonValue,
      aiGenerated: Boolean(input.useAi),
      qualityScore: this.scoreContent(copy),
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
        data,
        include: { location: { select: { name: true, slug: true } } },
      });
    }

    return this.prisma.seoPageContent.create({
      data: {
        pageKey,
        intentSlug: input.intentSlug,
        locationId: dbLoc.id,
        ...data,
      },
      include: { location: { select: { name: true, slug: true } } },
    });
  }

  async getById(id: string) {
    const row = await this.prisma.seoPageContent.findUnique({
      where: { id },
      include: {
        location: {
          select: {
            id: true,
            name: true,
            slug: true,
            kind: true,
            regionId: true,
            districtId: true,
          },
        },
        versions: { orderBy: { version: 'desc' }, take: 20 },
      },
    });
    if (!row) throw new NotFoundException('SEO obsah nenalezen.');
    return row;
  }

  async getByPageKey(pageKey: string) {
    return this.prisma.seoPageContent.findUnique({
      where: { pageKey },
      include: {
        location: { select: { id: true, name: true, slug: true } },
        versions: { orderBy: { version: 'desc' }, take: 20 },
      },
    });
  }

  async updateContent(id: string, input: SeoContentUpdateInput, editorId?: string) {
    const row = await this.prisma.seoPageContent.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('SEO obsah nenalezen.');
    if (row.isLocked) throw new BadRequestException('Obsah je zamčený.');

    const version =
      (await this.prisma.seoPageContentVersion.count({ where: { contentId: id } })) + 1;
    await this.prisma.seoPageContentVersion.create({
      data: {
        contentId: id,
        version,
        snapshot: row as unknown as Prisma.InputJsonValue,
        createdBy: editorId,
        note: 'Ruční úprava',
      },
    });

    return this.prisma.seoPageContent.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.keywords !== undefined ? { keywords: input.keywords } : {}),
        ...(input.h1 !== undefined ? { h1: input.h1 } : {}),
        ...(input.h2 !== undefined ? { h2: input.h2 } : {}),
        ...(input.bodyText !== undefined ? { bodyText: input.bodyText } : {}),
        ...(input.faq !== undefined ? { faq: input.faq as Prisma.InputJsonValue } : {}),
        ...(input.internalLinks !== undefined
          ? { internalLinks: input.internalLinks as Prisma.InputJsonValue }
          : {}),
        ...(input.relatedLocations !== undefined
          ? { relatedLocations: input.relatedLocations as Prisma.InputJsonValue }
          : {}),
        ...(input.relatedPages !== undefined
          ? { relatedPages: input.relatedPages as Prisma.InputJsonValue }
          : {}),
        ...(input.canonical !== undefined ? { canonical: input.canonical } : {}),
        ...(input.robots !== undefined ? { robots: input.robots } : {}),
        ...(input.noindex !== undefined ? { noindex: input.noindex } : {}),
        ...(input.ogTitle !== undefined ? { ogTitle: input.ogTitle } : {}),
        ...(input.ogDescription !== undefined ? { ogDescription: input.ogDescription } : {}),
        ...(input.ogImage !== undefined ? { ogImage: input.ogImage } : {}),
        ...(input.twitterCard !== undefined ? { twitterCard: input.twitterCard } : {}),
        ...(input.schemaJson !== undefined
          ? { schemaJson: input.schemaJson as Prisma.InputJsonValue }
          : {}),
        ...(input.altTexts !== undefined ? { altTexts: input.altTexts as Prisma.InputJsonValue } : {}),
        ...(input.redirectTo !== undefined ? { redirectTo: input.redirectTo } : {}),
        qualityScore: this.scoreContent({
          title: input.title ?? row.title ?? '',
          description: input.description ?? row.description ?? '',
          h1: input.h1 ?? row.h1 ?? '',
          bodyText: input.bodyText ?? row.bodyText ?? '',
          faq: Array.isArray(input.faq) ? input.faq : Array.isArray(row.faq) ? row.faq : [],
        }),
      },
      include: { location: { select: { name: true, slug: true } } },
    });
  }

  async updateStatus(id: string, status: SeoContentStatus, editorId?: string) {
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

  async listVersions(id: string) {
    return this.prisma.seoPageContentVersion.findMany({
      where: { contentId: id },
      orderBy: { version: 'desc' },
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
