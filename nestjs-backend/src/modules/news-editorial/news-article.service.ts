import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  NewsArticleStatus,
  NewsEditorialDecision,
  NewsSourceItemStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  markdownToBasicHtml,
  runQualityGate,
  slugifyNewsTitle,
} from './news-editorial.util';
import { NewsAuditService } from './news-audit.service';
import { NewsAiService } from './news-ai.service';
import { fetchFeedText } from './news-feed.util';
import { newsContentHash, scoreNewsRelevance } from './news-editorial.util';

@Injectable()
export class NewsArticleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: NewsAuditService,
    private readonly ai: NewsAiService,
  ) {}

  async getDashboardStats() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      foundToday,
      relevantToday,
      aiDrafts,
      pendingReview,
      publishedToday,
      ignoredToday,
      duplicateToday,
      publishedTotal,
    ] = await Promise.all([
      this.prisma.newsSourceItem.count({ where: { fetchedAt: { gte: todayStart } } }),
      this.prisma.newsSourceItem.count({
        where: { fetchedAt: { gte: todayStart }, relevanceScore: { gte: 45 } },
      }),
      this.prisma.newsArticle.count({ where: { status: NewsArticleStatus.DRAFT } }),
      this.prisma.newsArticle.count({
        where: { status: { in: [NewsArticleStatus.DRAFT, NewsArticleStatus.REVIEW] } },
      }),
      this.prisma.newsArticle.count({
        where: { status: NewsArticleStatus.PUBLISHED, publishedAt: { gte: todayStart } },
      }),
      this.prisma.newsSourceItem.count({
        where: { fetchedAt: { gte: todayStart }, status: NewsSourceItemStatus.IGNORED },
      }),
      this.prisma.newsSourceItem.count({
        where: { fetchedAt: { gte: todayStart }, status: NewsSourceItemStatus.DUPLICATE },
      }),
      this.prisma.newsArticle.count({ where: { status: NewsArticleStatus.PUBLISHED } }),
    ]);

    return {
      foundToday,
      relevantToday,
      aiDrafts,
      pendingReview,
      publishedToday,
      ignoredToday,
      duplicateToday,
      publishedTotal,
    };
  }

  async listArticles(query: Record<string, string | undefined>) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.NewsArticleWhereInput = {};
    if (query.status) where.status = query.status as NewsArticleStatus;
    if (query.category) where.category = query.category;
    if (query.q?.trim()) {
      where.OR = [
        { title: { contains: query.q.trim(), mode: 'insensitive' } },
        { perex: { contains: query.q.trim(), mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.newsArticle.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }],
        skip,
        take: limit,
        include: {
          sources: true,
          topic: { select: { id: true, title: true, trendScore: true } },
        },
      }),
      this.prisma.newsArticle.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async getArticle(id: string) {
    const article = await this.prisma.newsArticle.findUnique({
      where: { id },
      include: {
        sources: true,
        topic: true,
        analytics: true,
        auditLogs: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    if (!article) throw new NotFoundException('Článek nenalezen.');
    return article;
  }

  async getArticleBySlug(slug: string) {
    const article = await this.prisma.newsArticle.findFirst({
      where: { slug, status: NewsArticleStatus.PUBLISHED },
      include: { sources: true, topic: true },
    });
    if (!article) throw new NotFoundException('Článek nenalezen.');
    return article;
  }

  async updateArticle(
    id: string,
    patch: Partial<{
      title: string;
      seoTitle: string;
      seoDescription: string;
      perex: string;
      bodyMarkdown: string;
      category: string;
      region: string | null;
      status: NewsArticleStatus;
      editorNotes: string | null;
      scheduledAt: Date | null;
      indexable: boolean;
      robots: string;
    }>,
  ) {
    await this.getArticle(id);
    const data: Prisma.NewsArticleUpdateInput = {};
    if (patch.title != null) data.title = patch.title.trim();
    if (patch.seoTitle != null) data.seoTitle = patch.seoTitle.trim();
    if (patch.seoDescription != null) data.seoDescription = patch.seoDescription.trim();
    if (patch.perex != null) data.perex = patch.perex.trim();
    if (patch.bodyMarkdown != null) {
      data.bodyMarkdown = patch.bodyMarkdown;
      data.bodyHtml = markdownToBasicHtml(patch.bodyMarkdown);
    }
    if (patch.category != null) data.category = patch.category;
    if (patch.region !== undefined) data.region = patch.region;
    if (patch.status != null) data.status = patch.status;
    if (patch.editorNotes !== undefined) data.editorNotes = patch.editorNotes;
    if (patch.scheduledAt !== undefined) data.scheduledAt = patch.scheduledAt;
    if (patch.indexable != null) data.indexable = patch.indexable;
    if (patch.robots != null) data.robots = patch.robots;

    const updated = await this.prisma.newsArticle.update({ where: { id }, data });
    await this.audit.log('ARTICLE_UPDATED', `Upraven článek: ${updated.title}`, { articleId: id });
    return updated;
  }

  async runQualityGateForId(id: string) {
    const article = await this.getArticle(id);
    return this.runQualityGate(article);
  }

  runQualityGate(
    article: Pick<
      Prisma.NewsArticleGetPayload<{ include: { sources: true } }>,
      'id' | 'title' | 'seoTitle' | 'seoDescription' | 'perex' | 'bodyMarkdown' | 'sourcesFooterHtml'
    >,
  ) {
    const result = runQualityGate(article);
    void this.prisma.newsArticle.update({
      where: { id: article.id },
      data: {
        qualityScore: result.qualityScore,
        seoScore: result.seoScore,
      },
    });
    return result;
  }

  async regenerate(id: string) {
    const article = await this.getArticle(id);
    const sourceLink = article.sources[0];
    if (!sourceLink?.sourceItemId) {
      throw new BadRequestException('Článek nemá vazbu na zdrojovou položku.');
    }

    const draft = await this.ai.generateDraftFromItem(sourceLink.sourceItemId);
    if (!draft) throw new BadRequestException('Regenerace selhala.');

    await this.prisma.newsArticle.update({
      where: { id },
      data: {
        title: draft.title,
        seoTitle: draft.seoTitle,
        seoDescription: draft.seoDescription,
        perex: draft.perex,
        bodyMarkdown: draft.bodyMarkdown,
        bodyHtml: draft.bodyHtml,
        sourcesFooterHtml: draft.sourcesFooterHtml,
        aiGenerated: true,
      },
    });

    await this.audit.log('ARTICLE_REGENERATED', `Regenerován článek: ${draft.title}`, {
      articleId: id,
    });
    return this.getArticle(id);
  }

  async reject(id: string, reason: string) {
    await this.getArticle(id);
    const updated = await this.prisma.newsArticle.update({
      where: { id },
      data: {
        status: NewsArticleStatus.REJECTED,
        rejectedReason: reason.trim(),
      },
    });
    await this.audit.log('ARTICLE_REJECTED', reason, { articleId: id });
    return updated;
  }

  async createFromUrl(url: string) {
    const trimmed = url.trim();
    if (!trimmed) throw new BadRequestException('URL je povinná.');

    let html: string;
    try {
      html = await fetchFeedText(trimmed, 15_000);
    } catch {
      const res = await fetch(trimmed, { headers: { 'User-Agent': 'XXREALIT-NewsBot/1.0' } });
      if (!res.ok) throw new BadRequestException(`URL nelze načíst: HTTP ${res.status}`);
      html = await res.text();
    }

    const titleMatch = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
    const title = titleMatch?.[1]?.trim() || trimmed;
    const summaryMatch = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i.exec(html);
    const summary = summaryMatch?.[1]?.trim() ?? null;

    const manualSource = await this.prisma.newsSource.upsert({
      where: { url: 'manual://url-import' },
      create: {
        name: 'Ruční import URL',
        url: 'manual://url-import',
        type: 'WEB_SOURCE',
        enabled: false,
        trustScore: 50,
        priority: 10,
        checkIntervalMinutes: 9999,
      },
      update: {},
    });

    const hash = newsContentHash(title, trimmed, null);
    const item = await this.prisma.newsSourceItem.create({
      data: {
        sourceId: manualSource.id,
        sourceUrl: trimmed,
        canonicalUrl: trimmed,
        title,
        summary,
        contentHash: hash,
        status: NewsSourceItemStatus.NEW,
        relevanceScore: scoreNewsRelevance(title, summary),
        editorialDecision: NewsEditorialDecision.HIGH_PRIORITY,
      },
    });

    await this.ai.analyzeItem(item.id);
    const article = await this.ai.generateDraftFromItem(item.id);
    if (!article) throw new BadRequestException('Vytvoření článku selhalo.');
    return this.getArticle(article.id);
  }

  async listPublishedPublic(query: Record<string, string | undefined>) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 12));
    const skip = (page - 1) * limit;

    const where: Prisma.NewsArticleWhereInput = {
      status: NewsArticleStatus.PUBLISHED,
      publishedAt: { not: null },
    };
    if (query.category) where.category = query.category;

    const [items, total] = await Promise.all([
      this.prisma.newsArticle.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          slug: true,
          title: true,
          perex: true,
          category: true,
          region: true,
          publishedAt: true,
          ogImageUrl: true,
          ogImageAlt: true,
          authorLabel: true,
        },
      }),
      this.prisma.newsArticle.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async getRelatedForArticle(slug: string) {
    const article = await this.getArticleBySlug(slug);

    const [listings, posts, companies] = await Promise.all([
      this.prisma.property.findMany({
        where: {
          deletedAt: null,
          approved: true,
          isActive: true,
          isVisible: true,
          ...(article.region
            ? { city: { contains: article.region, mode: 'insensitive' } }
            : {}),
        },
        select: {
          id: true,
          slug: true,
          title: true,
          city: true,
          price: true,
          mainImage: true,
        },
        take: 6,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.post.findMany({
        where: {
          slug: { not: null },
          OR: [
            { content: { contains: article.category, mode: 'insensitive' } },
            { seoTitle: { contains: article.title.split(' ')[0] ?? '', mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          slug: true,
          seoTitle: true,
          content: true,
          createdAt: true,
        },
        take: 4,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.companyDirectoryEntry.findMany({
        where: {
          seoStatus: 'SEO_READY',
          ...(article.region ? { region: { contains: article.region, mode: 'insensitive' } } : {}),
        },
        select: {
          id: true,
          name: true,
          slug: true,
          city: true,
          categories: true,
        },
        take: 4,
        orderBy: { updatedAt: 'desc' },
      }),
    ]);

    return { listings, posts, companies };
  }

  async incrementView(slug: string) {
    const article = await this.getArticleBySlug(slug);
    await this.prisma.newsArticle.update({
      where: { id: article.id },
      data: { views: { increment: 1 } },
    });
    await this.prisma.newsArticleAnalytics.upsert({
      where: { articleId: article.id },
      create: { articleId: article.id, views: 1 },
      update: { views: { increment: 1 } },
    });
    return { ok: true };
  }
}
