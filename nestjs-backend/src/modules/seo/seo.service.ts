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
import { getSiteOriginForOg } from '../properties/property-og-media.util';
import {
  buildPostSeoDescription,
  buildPostSeoTitle,
  ensureUniquePostSlug,
  generatePostSlug,
  postHasVideo,
  postSeoPath,
  listingSeoPath,
} from './post-seo.util';
import { communityPostAuthorUserWhere } from '../posts/community-posts.util';
import { isCommunityPostAuthorVisible } from '../../common/public-visibility.util';
import { ProgrammaticSeoService } from './programmatic-seo.service';

export type SitemapEntry = {
  loc: string;
  lastmod?: string;
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority?: number;
};

export type SitemapKind =
  | 'inzeraty'
  | 'mesta'
  | 'kraje'
  | 'obce'
  | 'videa'
  | 'profily'
  | 'clanky'
  | 'programmatic'
  | 'static'
  | 'firmy';

@Injectable()
export class SeoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly programmaticSeo: ProgrammaticSeoService,
  ) {}

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

    const [properties, brokers, articles, posts] = await Promise.all([
      this.prisma.property.findMany({
        where: {
          deletedAt: null,
          approved: true,
          isActive: true,
          isVisible: true,
          slug: { not: null },
        },
        select: { slug: true, createdAt: true, listingType: true, videoUrl: true },
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
      this.prisma.post.findMany({
        where: {
          slug: { not: null },
          type: { not: 'short' },
          user: communityPostAuthorUserWhere(),
        },
        select: {
          id: true,
          slug: true,
          videoUrl: true,
          createdAt: true,
          publishedAt: true,
          media: { select: { type: true }, take: 5 },
        },
        take: 50000,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const propertyEntries: SitemapEntry[] = properties
      .filter((p) => p.slug)
      .flatMap((p) => {
        const lastmod = p.createdAt.toISOString();
        const isShorts =
          String(p.listingType ?? '').toUpperCase() === 'SHORTS' || Boolean(p.videoUrl?.trim());
        const slug = p.slug!;
        const entries: SitemapEntry[] = [
          {
            loc: `${base}${listingSeoPath(slug, isShorts ? 'shorts' : 'classic')}`,
            lastmod,
            changefreq: 'weekly' as const,
            priority: isShorts ? 0.75 : 0.7,
          },
        ];
        if (!isShorts) {
          entries.push({
            loc: `${base}/nemovitosti/${slug}`,
            lastmod,
            changefreq: 'weekly' as const,
            priority: 0.65,
          });
        }
        return entries;
      });

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

    const postEntries: SitemapEntry[] = posts
      .filter((p) => p.slug)
      .map((p) => {
        const hasVideo = postHasVideo(p);
        const lastmod = (p.publishedAt ?? p.createdAt).toISOString();
        return {
          loc: `${base}${postSeoPath(p.slug!, hasVideo)}`,
          lastmod,
          changefreq: 'weekly' as const,
          priority: hasVideo ? 0.72 : 0.68,
        };
      });

    return [...staticPages, ...propertyEntries, ...brokerEntries, ...articleEntries, ...postEntries];
  }

  async getSitemapEntriesByKind(kind: SitemapKind, origin: string): Promise<SitemapEntry[]> {
    const base = origin.replace(/\/+$/, '');
    const now = new Date().toISOString();

    switch (kind) {
      case 'static': {
        return [
          { loc: base, changefreq: 'daily', priority: 1, lastmod: now },
          { loc: `${base}/nemovitosti`, changefreq: 'daily', priority: 0.9, lastmod: now },
          { loc: `${base}/makleri`, changefreq: 'weekly', priority: 0.8, lastmod: now },
          { loc: `${base}/o-portalu`, changefreq: 'weekly', priority: 0.85, lastmod: now },
          { loc: `${base}/shorts`, changefreq: 'daily', priority: 0.8, lastmod: now },
          { loc: `${base}/privacy-policy`, changefreq: 'yearly', priority: 0.3, lastmod: now },
          { loc: `${base}/obchodni-podminky`, changefreq: 'yearly', priority: 0.3, lastmod: now },
          { loc: `${base}/terms`, changefreq: 'yearly', priority: 0.3, lastmod: now },
        ];
      }
      case 'inzeraty':
        return this.getPropertySitemapEntries(base);
      case 'profily':
        return this.getBrokerSitemapEntries(base);
      case 'clanky':
        return this.getArticleSitemapEntries(base);
      case 'videa':
        return this.getVideoSitemapEntries(base);
      case 'programmatic':
      case 'mesta':
        return await this.programmaticSeo.getProgrammaticSitemapEntries(base);
      case 'kraje':
        return this.programmaticSeo.getRegionSitemapEntries(base);
      case 'obce':
        return this.programmaticSeo.getCitySitemapEntries(base);
      case 'firmy':
        return this.getCompanySitemapEntries(base);
      default:
        return [];
    }
  }

  private async getCompanySitemapEntries(base: string, page = 1): Promise<SitemapEntry[]> {
    const pageSize = 5000;
    const rows = await this.prisma.companyDirectoryEntry.findMany({
      where: {
        publicProfile: true,
        hidden: false,
        seoStatus: 'SEO_READY',
      },
      select: { slug: true, seoLastSignificantChangeAt: true, updatedAt: true },
      orderBy: { seoLastSignificantChangeAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return rows.map((r) => ({
      loc: `${base}/firmy/${r.slug}`,
      lastmod: (r.seoLastSignificantChangeAt ?? r.updatedAt).toISOString(),
      changefreq: 'weekly' as const,
      priority: 0.55,
    }));
  }

  private async getPropertySitemapEntries(base: string): Promise<SitemapEntry[]> {
    const properties = await this.prisma.property.findMany({
      where: {
        deletedAt: null,
        approved: true,
        isActive: true,
        isVisible: true,
        slug: { not: null },
      },
      select: { slug: true, createdAt: true, listingType: true, videoUrl: true },
      take: 50000,
      orderBy: { createdAt: 'desc' },
    });

    return properties
      .filter((p) => p.slug)
      .flatMap((p) => {
        const lastmod = p.createdAt.toISOString();
        const isShorts =
          String(p.listingType ?? '').toUpperCase() === 'SHORTS' || Boolean(p.videoUrl?.trim());
        const slug = p.slug!;
        const entries: SitemapEntry[] = [
          {
            loc: `${base}${listingSeoPath(slug, isShorts ? 'shorts' : 'classic')}`,
            lastmod,
            changefreq: 'weekly' as const,
            priority: isShorts ? 0.75 : 0.7,
          },
        ];
        if (!isShorts) {
          entries.push({
            loc: `${base}/nemovitosti/${slug}`,
            lastmod,
            changefreq: 'weekly' as const,
            priority: 0.65,
          });
        }
        return entries;
      });
  }

  private async getBrokerSitemapEntries(base: string): Promise<SitemapEntry[]> {
    const brokers = await this.prisma.user.findMany({
      where: {
        brokerProfileSlug: { not: null },
        isPublicBrokerProfile: true,
      },
      select: { brokerProfileSlug: true, createdAt: true },
      take: 10000,
    });

    return brokers
      .filter((b) => b.brokerProfileSlug)
      .map((b) => ({
        loc: `${base}/makler/${b.brokerProfileSlug}`,
        lastmod: b.createdAt.toISOString(),
        changefreq: 'weekly' as const,
        priority: 0.6,
      }));
  }

  private async getArticleSitemapEntries(base: string): Promise<SitemapEntry[]> {
    const [articles, posts] = await Promise.all([
      this.prisma.purchaseAdviceArticle.findMany({
        where: { isPublished: true },
        select: { id: true, updatedAt: true },
        take: 5000,
      }),
      this.prisma.post.findMany({
        where: {
          slug: { not: null },
          type: { not: 'short' },
          user: communityPostAuthorUserWhere(),
        },
        select: {
          slug: true,
          videoUrl: true,
          createdAt: true,
          publishedAt: true,
          media: { select: { type: true }, take: 5 },
        },
        take: 50000,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const articleEntries: SitemapEntry[] = articles.map((a) => ({
      loc: `${base}/rady/${a.id}`,
      lastmod: a.updatedAt.toISOString(),
      changefreq: 'monthly' as const,
      priority: 0.5,
    }));

    const postEntries: SitemapEntry[] = posts
      .filter((p) => p.slug)
      .map((p) => {
        const hasVideo = postHasVideo(p);
        const lastmod = (p.publishedAt ?? p.createdAt).toISOString();
        return {
          loc: `${base}${postSeoPath(p.slug!, hasVideo)}`,
          lastmod,
          changefreq: 'weekly' as const,
          priority: hasVideo ? 0.72 : 0.68,
        };
      });

    return [...articleEntries, ...postEntries];
  }

  private async getVideoSitemapEntries(base: string): Promise<SitemapEntry[]> {
    const properties = await this.prisma.property.findMany({
      where: {
        deletedAt: null,
        approved: true,
        isActive: true,
        isVisible: true,
        slug: { not: null },
        OR: [{ videoUrl: { not: null } }, { listingType: 'SHORTS' }],
      },
      select: { slug: true, createdAt: true, listingType: true, videoUrl: true },
      take: 50000,
      orderBy: { createdAt: 'desc' },
    });

    return properties
      .filter((p) => p.slug)
      .map((p) => ({
        loc: `${base}${listingSeoPath(p.slug!, 'shorts')}`,
        lastmod: p.createdAt.toISOString(),
        changefreq: 'weekly' as const,
        priority: 0.75,
      }));
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

    const programmaticEntries = await this.programmaticSeo.getProgrammaticSitemapEntries('https://x');
    const programmaticPages = programmaticEntries.length;

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
      programmaticSeoPages: programmaticPages,
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

  async findPostBySlug(slug: string) {
    const post = await this.prisma.post.findFirst({
      where: { slug, user: communityPostAuthorUserWhere() },
      select: { id: true, slug: true, videoUrl: true, media: { select: { type: true } } },
    });
    if (!post?.slug) throw new NotFoundException('Příspěvek nenalezen.');
    return {
      id: post.id,
      slug: post.slug,
      hasVideo: postHasVideo(post),
      canonicalPath: postSeoPath(post.slug, postHasVideo(post)),
    };
  }

  async getPostOgMeta(postId: string) {
    let post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: {
        media: { orderBy: { order: 'asc' } },
        user: {
          select: {
            name: true,
            role: true,
            publicProfile: true,
            canPublishPosts: true,
            accountLimited: true,
            portalWorkerStatus: true,
          },
        },
      },
    });
    if (!post || !isCommunityPostAuthorVisible(post.user)) throw new NotFoundException('Příspěvek není veřejný.');
    if (!post.slug) {
      await this.ensurePostSeoFields(postId);
      post = await this.prisma.post.findUnique({
        where: { id: postId },
        include: {
          media: { orderBy: { order: 'asc' } },
          user: {
          select: {
            name: true,
            role: true,
            publicProfile: true,
            canPublishPosts: true,
            accountLimited: true,
            portalWorkerStatus: true,
          },
        },
        },
      });
    }
    if (!post?.slug) throw new NotFoundException('Příspěvek nemá SEO slug.');

    const hasVideo = postHasVideo(post);
    const origin = getSiteOriginForOg();
    const canonicalPath = postSeoPath(post.slug, hasVideo);
    const image =
      post.previewImage ??
      post.imageUrl ??
      post.media.find((m) => String(m.type).toLowerCase() !== 'video')?.url ??
      post.facebookVideoThumbnail ??
      null;
    return {
      id: post.id,
      slug: post.slug,
      hasVideo,
      canonicalPath,
      canonicalUrl: `${origin}${canonicalPath}`,
      seoTitle:
        post.seoTitle ??
        buildPostSeoTitle({
          title: post.title,
          description: post.description,
          hasVideo,
        }),
      seoDescription:
        post.seoDescription ??
        buildPostSeoDescription({
          title: post.title,
          description: post.description,
          content: post.content,
          authorName: post.user?.name,
          hasVideo,
        }),
      imageUrl: image,
      videoUrl: post.videoUrl,
      videoDurationSec: post.facebookVideoDurationSec,
      publishedAt: (post.publishedAt ?? post.createdAt).toISOString(),
      authorName: post.user?.name ?? null,
    };
  }

  async ensurePostSeoFields(postId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: {
        media: { select: { type: true } },
        user: {
          select: {
            name: true,
            role: true,
            publicProfile: true,
            canPublishPosts: true,
            accountLimited: true,
            portalWorkerStatus: true,
          },
        },
      },
    });
    if (!post || !isCommunityPostAuthorVisible(post.user)) return null;

    const hasVideo = postHasVideo(post);
    const baseSlug = generatePostSlug(
      post.title?.trim() || post.description?.trim() || post.content?.trim() || 'prispevek',
      post.id,
    );
    const slug = post.slug ?? (await ensureUniquePostSlug(this.prisma, baseSlug, post.id));

    const updated = await this.prisma.post.update({
      where: { id: postId },
      data: {
        slug,
        seoTitle:
          post.seoTitle ??
          buildPostSeoTitle({
            title: post.title,
            description: post.description,
            hasVideo,
          }),
        seoDescription:
          post.seoDescription ??
          buildPostSeoDescription({
            title: post.title,
            description: post.description,
            content: post.content,
            authorName: post.user?.name,
            hasVideo,
          }),
        publishedAt: post.publishedAt ?? post.createdAt,
      },
    });
    return updated;
  }

  async backfillPostSlugs(limit = 500) {
    const rows = await this.prisma.post.findMany({
      where: { slug: null, user: communityPostAuthorUserWhere() },
      select: { id: true },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
    for (const row of rows) {
      await this.ensurePostSeoFields(row.id);
    }
    return { processed: rows.length };
  }

  async lookupRedirect(path: string): Promise<{ toPath: string; statusCode: number } | null> {
    const normalized = path.startsWith('/') ? path : `/${path}`;
    const row = await this.prisma.seoRedirect.findUnique({
      where: { fromPath: normalized },
      select: { toPath: true, statusCode: true },
    });
    if (!row) return null;
    return { toPath: row.toPath, statusCode: row.statusCode };
  }
}
