import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { NewsArticleStatus, NewsPublishMode, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { buildArticleSchema, runQualityGate } from './news-editorial.util';
import { NewsAuditService } from './news-audit.service';
import { NewsArticleService } from './news-article.service';
import { NewsEditorialSettingsService } from './news-editorial-settings.service';

@Injectable()
export class NewsPublishService {
  private readonly log = new Logger(NewsPublishService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: NewsAuditService,
    private readonly articles: NewsArticleService,
    private readonly settings: NewsEditorialSettingsService,
  ) {}

  async publish(id: string, options?: { force?: boolean }) {
    const article = await this.articles.getArticle(id);
    if (article.status === NewsArticleStatus.PUBLISHED) {
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
      if (!gate.passed && cfg.publishMode !== NewsPublishMode.MANUAL) {
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

    if (cfg.createPortalPost) {
      await this.createPortalPost(updated.id);
    }
    if (cfg.createFacebookPost) {
      await this.audit.log('FACEBOOK_POST_QUEUED', 'Facebook publikace zatím pouze audit flag', {
        articleId: id,
        metadata: { queued: true },
      });
      await this.prisma.newsArticle.update({
        where: { id },
        data: { facebookQueued: true },
      });
    }

    await this.audit.log('ARTICLE_PUBLISHED', `Publikován článek: ${updated.title}`, {
      articleId: id,
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

  private async createPortalPost(articleId: string) {
    const article = await this.articles.getArticle(articleId);
    if (article.portalPostId) return;

    const systemUserId = process.env.PORTAL_SYSTEM_USER_ID?.trim();
    if (!systemUserId) {
      await this.audit.log('PORTAL_POST_SKIPPED', 'PORTAL_SYSTEM_USER_ID není nastaveno', {
        articleId,
      });
      return;
    }

    const teaser = article.perex.slice(0, 280);
    const path = article.canonicalPath ?? `/aktuality/${article.slug}`;
    const post = await this.prisma.post.create({
      data: {
        userId: systemUserId,
        content: `📰 Novinka z realitního trhu\n\n${teaser}\n\n👉 Přečíst celý článek: ${path}`,
        seoTitle: article.seoTitle,
        seoDescription: article.seoDescription,
        slug: `${article.slug}-novinka`.slice(0, 80),
        source: 'INTERNAL',
        publishedAt: new Date(),
        externalUrl: path,
        previewTitle: article.title,
        previewDescription: article.perex.slice(0, 200),
        previewImage: article.ogImageUrl,
        previewSiteName: 'XXREALIT',
      },
    });

    await this.prisma.newsArticle.update({
      where: { id: articleId },
      data: { portalPostId: post.id },
    });

    await this.audit.log('PORTAL_POST_CREATED', `Vytvořen portálový příspěvek ${post.id}`, {
      articleId,
      metadata: { postId: post.id },
    });
  }
}
