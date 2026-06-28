import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { computeListingPublicStatus } from '../properties/property-public-visibility';
import type { UpdatePropertySeoDto, UpdateSeoSettingsDto } from './dto/seo.dto';
import {
  buildListingSeoDescription,
  buildListingSeoKeywords,
  buildListingSeoTitle,
  ensureUniquePropertySlug,
  generatePropertySlug,
} from './property-seo.util';

export type SitemapEntry = {
  loc: string;
  lastmod?: string;
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority?: number;
};

@Injectable()
export class SeoService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings() {
    return this.prisma.seoSettings.upsert({
      where: { id: 'default' },
      create: {},
      update: {},
    });
  }

  async getPublicSettings() {
    const s = await this.getSettings();
    return {
      defaultTitle: s.defaultTitle,
      defaultDescription: s.defaultDescription,
      defaultOgImageUrl: s.defaultOgImageUrl,
      robotsIndex: s.robotsIndex,
      googleAnalyticsId: s.googleAnalyticsId,
      googleTagManagerId: s.googleTagManagerId,
      metaPixelId: s.metaPixelId,
      cookieConsentEnabled: s.cookieConsentEnabled,
      hreflangLocales: s.hreflangLocales,
      googleSearchConsoleVerification: s.googleSearchConsoleVerification,
      seznamWebmasterVerification: s.seznamWebmasterVerification,
      bingWebmasterVerification: s.bingWebmasterVerification,
      yandexVerification: s.yandexVerification,
      pinterestVerification: s.pinterestVerification,
      tiktokPixelId: s.tiktokPixelId,
      linkedInInsightId: s.linkedInInsightId,
    };
  }

  async updateSettings(dto: UpdateSeoSettingsDto) {
    return this.prisma.seoSettings.upsert({
      where: { id: 'default' },
      create: { ...dto },
      update: { ...dto },
    });
  }

  async getSitemapEntries(origin: string): Promise<SitemapEntry[]> {
    const base = origin.replace(/\/+$/, '');
    const now = new Date().toISOString();
    const staticPages: SitemapEntry[] = [
      { loc: base, changefreq: 'daily', priority: 1, lastmod: now },
      { loc: `${base}/nemovitosti`, changefreq: 'daily', priority: 0.9, lastmod: now },
      { loc: `${base}/makleri`, changefreq: 'weekly', priority: 0.8, lastmod: now },
      { loc: `${base}/o-portalu`, changefreq: 'weekly', priority: 0.85, lastmod: now },
      { loc: `${base}/shorts`, changefreq: 'daily', priority: 0.8, lastmod: now },
      { loc: `${base}/privacy-policy`, changefreq: 'yearly', priority: 0.3, lastmod: now },
      { loc: `${base}/obchodni-podminky`, changefreq: 'yearly', priority: 0.3, lastmod: now },
      { loc: `${base}/terms`, changefreq: 'yearly', priority: 0.3, lastmod: now },
    ];

    const [properties, brokers, articles] = await Promise.all([
      this.prisma.property.findMany({
        where: {
          deletedAt: null,
          approved: true,
          isActive: true,
          isVisible: true,
          slug: { not: null },
        },
        select: { slug: true, createdAt: true },
        take: 50000,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.findMany({
        where: {
          brokerProfileSlug: { not: null },
          isPublicBrokerProfile: true,
        },
        select: { brokerProfileSlug: true, createdAt: true },
        take: 10000,
      }),
      this.prisma.purchaseAdviceArticle.findMany({
        where: { isPublished: true },
        select: { id: true, updatedAt: true },
        take: 5000,
      }),
    ]);

    const propertyEntries: SitemapEntry[] = properties
      .filter((p) => p.slug)
      .map((p) => ({
        loc: `${base}/nemovitosti/${p.slug}`,
        lastmod: p.createdAt.toISOString(),
        changefreq: 'weekly' as const,
        priority: 0.7,
      }));

    const brokerEntries: SitemapEntry[] = brokers
      .filter((b) => b.brokerProfileSlug)
      .map((b) => ({
        loc: `${base}/makler/${b.brokerProfileSlug}`,
        lastmod: b.createdAt.toISOString(),
        changefreq: 'weekly' as const,
        priority: 0.6,
      }));

    const articleEntries: SitemapEntry[] = articles.map((a) => ({
      loc: `${base}/rady/${a.id}`,
      lastmod: a.updatedAt.toISOString(),
      changefreq: 'monthly' as const,
      priority: 0.5,
    }));

    return [...staticPages, ...propertyEntries, ...brokerEntries, ...articleEntries];
  }

  async getAdminHealth() {
    const [propertyCount, withSlug, withSeoTitle, withSeoDesc, duplicateSlugs] =
      await Promise.all([
        this.prisma.property.count({ where: { deletedAt: null, approved: true } }),
        this.prisma.property.count({
          where: { deletedAt: null, approved: true, slug: { not: null } },
        }),
        this.prisma.property.count({
          where: { deletedAt: null, approved: true, seoTitle: { not: null } },
        }),
        this.prisma.property.count({
          where: { deletedAt: null, approved: true, seoDescription: { not: null } },
        }),
        this.prisma.$queryRaw<Array<{ cnt: bigint }>>`
          SELECT COUNT(*)::bigint AS cnt FROM (
            SELECT slug FROM "Property" WHERE slug IS NOT NULL GROUP BY slug HAVING COUNT(*) > 1
          ) d`,
      ]);

    const score = propertyCount
      ? Math.round(((withSlug + withSeoTitle + withSeoDesc) / (propertyCount * 3)) * 100)
      : 100;

    return {
      indexedListings: withSlug,
      totalListings: propertyCount,
      missingMetaTitle: propertyCount - withSeoTitle,
      missingMetaDescription: propertyCount - withSeoDesc,
      missingSlug: propertyCount - withSlug,
      duplicateSlugs: Number(duplicateSlugs[0]?.cnt ?? 0),
      seoScore: Math.min(100, score),
    };
  }

  async findPropertyBySlug(slug: string) {
    const property = await this.prisma.property.findFirst({
      where: { slug, deletedAt: null },
    });
    if (!property) throw new NotFoundException('Inzerát nenalezen.');
    const status = computeListingPublicStatus(property);
    if (status !== 'ACTIVE') throw new NotFoundException('Inzerát není veřejný.');
    return { id: property.id, slug: property.slug };
  }

  async suggestPropertySeo(propertyId: string) {
    const p = await this.prisma.property.findUnique({ where: { id: propertyId } });
    if (!p) throw new NotFoundException('Inzerát nenalezen.');
    const baseSlug = generatePropertySlug(p.title, p.city);
    const slug = await ensureUniquePropertySlug(this.prisma, baseSlug, p.id);
    return {
      seoTitle: buildListingSeoTitle({
        title: p.title,
        city: p.city,
        price: p.price,
        currency: p.currency,
      }),
      seoDescription: buildListingSeoDescription({
        title: p.title,
        city: p.city,
        description: p.description,
        offerType: p.offerType,
        propertyType: p.propertyType,
      }),
      seoKeywords: buildListingSeoKeywords({
        city: p.city,
        offerType: p.offerType,
        propertyType: p.propertyType,
        title: p.title,
      }),
      slug,
    };
  }

  async updatePropertySeo(propertyId: string, dto: UpdatePropertySeoDto) {
    const data: Prisma.PropertyUpdateInput = {};
    if (dto.seoTitle !== undefined) data.seoTitle = dto.seoTitle?.trim() || null;
    if (dto.seoDescription !== undefined) data.seoDescription = dto.seoDescription?.trim() || null;
    if (dto.seoKeywords !== undefined) data.seoKeywords = dto.seoKeywords;
    if (dto.slug !== undefined) {
      const slug = dto.slug.trim();
      data.slug = slug
        ? await ensureUniquePropertySlug(this.prisma, slug, propertyId)
        : null;
    }
    return this.prisma.property.update({ where: { id: propertyId }, data });
  }

  async ensurePropertySeoFields(propertyId: string) {
    const p = await this.prisma.property.findUnique({ where: { id: propertyId } });
    if (!p) return;
    const baseSlug = generatePropertySlug(p.title, p.city);
    const slug = p.slug ?? (await ensureUniquePropertySlug(this.prisma, baseSlug, p.id));
    await this.prisma.property.update({
      where: { id: propertyId },
      data: {
        slug,
        seoTitle:
          p.seoTitle ??
          buildListingSeoTitle({
            title: p.title,
            city: p.city,
            price: p.price,
            currency: p.currency,
          }),
        seoDescription:
          p.seoDescription ??
          buildListingSeoDescription({
            title: p.title,
            city: p.city,
            description: p.description,
            offerType: p.offerType,
            propertyType: p.propertyType,
          }),
        seoKeywords:
          p.seoKeywords.length > 0
            ? p.seoKeywords
            : buildListingSeoKeywords({
                city: p.city,
                offerType: p.offerType,
                propertyType: p.propertyType,
                title: p.title,
              }),
      },
    });
  }

  async backfillPropertySlugs(limit = 500) {
    const rows = await this.prisma.property.findMany({
      where: { slug: null, deletedAt: null },
      select: { id: true, title: true, city: true },
      take: limit,
    });
    for (const row of rows) {
      await this.ensurePropertySeoFields(row.id);
    }
    return { processed: rows.length };
  }
}
