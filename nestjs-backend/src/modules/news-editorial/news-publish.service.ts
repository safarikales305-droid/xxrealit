import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { NewsArticleStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { buildArticleSchema, runQualityGate } from './news-editorial.util';
import { NewsAuditService } from './news-audit.service';
import { NewsArticleService } from './news-article.service';
import { NewsEditorialSettingsService } from './news-editorial-settings.service';
import { NewsPortalPostService } from './news-portal-post.service';

@Injectable()
export class NewsPublishService {
  private readonly log = new Logger(NewsPublishService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: NewsAuditService,
    private readonly articles: NewsArticleService,
    private readonly settings: NewsEditorialSettingsService,
    private readonly portalPosts: NewsPortalPostService,
  ) {}

  async publish(id: string, options?: { force?: boolean }) {
    const article = await this.articles.getArticle(id);
    if (article.status === NewsArticleStatus.PUBLISHED) {
      await this.portalPosts.syncFromArticle(id, {
        enqueueFacebook: this.settings.getCached().createFacebookPost,
      });
      return article;
    }

    const gate = runQualityGate(article);
    const cfg = this.settings.getCached();

    if (!options?.force) {
      if (gate.qualityScore < cfg.autoPublishMinQuality) {
        throw new BadRequestException(
          `Kvalita ${gate.qualityScore} je pod minimem ${cfg.autoPublishMinQuality}.`,
        );
      }
      if (!gate.passed && cfg.publishMode !== 'MANUAL') {
        throw new BadRequestException(`Quality gate: ${gate.issues.join(' ')}`);
      }
    }

    const slug = article.slug;
    const canonicalPath = `/aktuality/${slug}`;
    const siteBase = process.env.PUBLIC_SITE_URL?.replace(/\/$/, '') ?? 'https://xxrealit.cz';
    const indexable = gate.qualityScore >= cfg.autoPublishMinQuality;
    const robots = indexable ? 'index,follow' : 'noindex,nofollow';

    const updated = await this.prisma.newsArticle.update({
      where: { id },
      data: {
        status: NewsArticleStatus.PUBLISHED,
        publishedAt: new Date(),
        canonicalPath,
        qualityScore: gate.qualityScore,
        seoScore: gate.seoScore,
        indexable,
        robots,
        schemaJson: buildArticleSchema(
          {
            ...article,
            publishedAt: new Date(),
          },
          siteBase,
        ) as Prisma.InputJsonValue,
        ogImageUrl: article.ogImageUrl ?? cfg.defaultOgImageUrl ?? null,
      },
    });

    const portalResult = await this.portalPosts.syncFromArticle(updated.id, {
      enqueueFacebook: cfg.createFacebookPost,
    });

    await this.audit.log('ARTICLE_PUBLISHED', `Publikován článek: ${updated.title}`, {
      articleId: id,
      metadata: { portalResult: portalResult as object },
    });

    return this.articles.getArticle(id);
  }

  async schedule(id: string, scheduledAt: Date) {
    await this.articles.getArticle(id);
    const updated = await this.prisma.newsArticle.update({
      where: { id },
      data: {
        status: NewsArticleStatus.SCHEDULED,
        scheduledAt,
      },
    });
    await this.audit.log('ARTICLE_SCHEDULED', `Naplánováno na ${scheduledAt.toISOString()}`, {
      articleId: id,
    });
    return updated;
  }

  async publishScheduledDue(limit = 5) {
    const now = new Date();
    const due = await this.prisma.newsArticle.findMany({
      where: {
        status: NewsArticleStatus.SCHEDULED,
        scheduledAt: { lte: now },
      },
      orderBy: { scheduledAt: 'asc' },
      take: limit,
    });

    const published = [];
    for (const article of due) {
      try {
        published.push(await this.publish(article.id));
      } catch (err) {
        this.log.warn(
          `Scheduled publish failed ${article.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    return { count: published.length };
  }

  async syncPortalPost(articleId: string) {
    return this.portalPosts.syncFromArticle(articleId, { enqueueFacebook: false });
  }

  async hidePortalPost(articleId: string) {
    return this.portalPosts.hideFromArticle(articleId);
  }

  async republishFacebook(articleId: string, adminUserId?: string) {
    return this.portalPosts.republishFacebook(articleId, adminUserId);
  }
}
