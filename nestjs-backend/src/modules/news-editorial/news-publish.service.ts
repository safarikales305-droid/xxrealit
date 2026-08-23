import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { NewsArticleStatus, NewsPublishMode, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  buildArticleSchema,
  evaluateArticleReadiness,
  runQualityGate,
} from './news-editorial.util';
import { NewsAuditService } from './news-audit.service';
import { NewsArticleService } from './news-article.service';
import { NewsEditorialSettingsService } from './news-editorial-settings.service';
import { NewsImageService } from './news-image.service';
import { NewsPortalPostService } from './news-portal-post.service';
import { isWithinPublishWindow, nextPublishSlotLabel } from './news-publish-scheduler.util';
import { getNewsWorkerHeartbeat } from './news-editorial-worker.service';

export type AutoPublishStepResult = {
  step: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  detail?: string;
};

@Injectable()
export class NewsPublishService {
  private readonly log = new Logger(NewsPublishService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: NewsAuditService,
    private readonly articles: NewsArticleService,
    private readonly settings: NewsEditorialSettingsService,
    private readonly portalPosts: NewsPortalPostService,
    private readonly images: NewsImageService,
  ) {}

  async publish(id: string, options?: { force?: boolean }) {
    const article = await this.articles.getArticle(id);
    if (article.status === NewsArticleStatus.PUBLISHED) {
      await this.portalPosts.syncFromArticle(id, {
        enqueueFacebook: this.settings.getCached().createFacebookPost,
      });
      return article;
    }

    const ensured = await this.ensureHeroImage(id);
    const gate = runQualityGate(ensured);
    const cfg = this.settings.getCached();
    const readiness = evaluateArticleReadiness(ensured, {
      minQuality: cfg.autoPublishMinQuality,
      minLanguage: cfg.minLanguageQuality,
    });

    if (!options?.force) {
      if (!readiness.ready) {
        await this.markWaiting(id, readiness.waitReason, readiness);
        throw new BadRequestException(`Článek není připraven: ${readiness.waitReason}`);
      }
    }

    const slug = ensured.slug;
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
        languageQualityScore: readiness.languageScore,
        waitReason: null,
        indexable,
        robots,
        schemaJson: buildArticleSchema(
          {
            ...ensured,
            publishedAt: new Date(),
          },
          siteBase,
        ) as Prisma.InputJsonValue,
        ogImageUrl: ensured.ogImageUrl ?? cfg.defaultOgImageUrl ?? null,
      },
    });

    const portalResult = await this.portalPosts.syncFromArticle(updated.id, {
      enqueueFacebook: cfg.createFacebookPost,
    });

    await this.audit.log('NEWS_ARTICLE_PUBLISHED', `Publikován článek: ${updated.title}`, {
      articleId: id,
      metadata: { portalResult: portalResult as object },
    });

    return this.articles.getArticle(id);
  }

  async tryAutoPublish(
    articleId: string,
    options?: { bypassSchedule?: boolean },
  ): Promise<{
    published: boolean;
    waitReason?: string;
    steps: AutoPublishStepResult[];
    articleId: string;
  }> {
    const cfg = this.settings.getCached();
    const steps: AutoPublishStepResult[] = [];
    const article = await this.articles.getArticle(articleId);

    if (article.status === NewsArticleStatus.PUBLISHED) {
      return { published: true, steps: [{ step: 'ALREADY_PUBLISHED', status: 'SKIP' }], articleId };
    }

    const ensured = await this.ensureHeroImage(articleId);
    steps.push({
      step: 'IMAGE',
      status: ensured.ogImageUrl ? 'PASS' : 'FAIL',
      detail: ensured.ogImageUrl ?? 'missing',
    });

    const readiness = evaluateArticleReadiness(ensured, {
      minQuality: cfg.autoPublishMinQuality,
      minLanguage: cfg.minLanguageQuality,
    });
    steps.push({
      step: 'QUALITY',
      status: readiness.quality.qualityScore >= cfg.autoPublishMinQuality ? 'PASS' : 'FAIL',
      detail: String(readiness.quality.qualityScore),
    });
    steps.push({
      step: 'LANGUAGE',
      status: readiness.languageScore >= cfg.minLanguageQuality ? 'PASS' : 'FAIL',
      detail: String(readiness.languageScore),
    });

    if (!readiness.ready) {
      await this.markWaiting(articleId, readiness.waitReason, readiness);
      steps.push({ step: 'AUTO_PUBLISH', status: 'FAIL', detail: readiness.waitReason });
      return { published: false, waitReason: readiness.waitReason, steps, articleId };
    }

    const schedule = isWithinPublishWindow(cfg.publishTimes);
    if (cfg.publishMode === NewsPublishMode.AUTOMATIC && !schedule.due && !options?.bypassSchedule) {
      await this.markWaiting(articleId, 'WAITING_SCHEDULE', readiness);
      steps.push({ step: 'SCHEDULE', status: 'SKIP', detail: 'WAITING_SCHEDULE' });
      return { published: false, waitReason: 'WAITING_SCHEDULE', steps, articleId };
    }

    try {
      const published = await this.publish(articleId);
      steps.push({ step: 'ARTICLE_PUBLISHED', status: 'PASS' });
      const portal = await this.portalPosts.syncFromArticle(published.id, {
        enqueueFacebook: cfg.createFacebookPost,
      });
      steps.push({
        step: 'PORTAL_POST',
        status: portal.ok ? 'PASS' : 'FAIL',
        detail: portal.ok ? String(portal.postId) : String(portal.reason),
      });
      steps.push({
        step: 'FACEBOOK',
        status: cfg.createFacebookPost ? (portal.facebook ? 'PASS' : 'SKIP') : 'SKIP',
      });
      return { published: true, steps, articleId };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      steps.push({ step: 'AUTO_PUBLISH', status: 'FAIL', detail: msg });
      return { published: false, waitReason: readiness.waitReason, steps, articleId };
    }
  }

  async ensureHeroImage(articleId: string) {
    const article = await this.articles.getArticle(articleId);
    if (article.ogImageUrl?.trim()) return article;

    const sourceLink = article.sources[0];
    const sourceItem = sourceLink?.sourceItemId
      ? await this.prisma.newsSourceItem.findUnique({ where: { id: sourceLink.sourceItemId } })
      : null;

    const hero = await this.images.resolveHeroForArticle({
      articleId: article.id,
      slug: article.slug,
      title: article.title,
      category: article.category,
      rssImageUrl: sourceItem?.imageUrl,
      articlePageUrl: sourceLink?.sourceUrl ?? sourceItem?.sourceUrl,
    });

    return this.prisma.newsArticle.update({
      where: { id: articleId },
      data: {
        ogImageUrl: hero.storedUrl,
        ogImageAlt: hero.alt,
        imageDiagnosticsJson: hero.diagnostics as object,
        waitReason: hero.storedUrl ? article.waitReason : 'IMAGE_REQUIRED',
      },
    });
  }

  private async markWaiting(
    articleId: string,
    waitReason: string,
    readiness: ReturnType<typeof evaluateArticleReadiness>,
  ) {
    await this.prisma.newsArticle.update({
      where: { id: articleId },
      data: {
        status: NewsArticleStatus.REVIEW,
        waitReason,
        qualityScore: readiness.quality.qualityScore,
        seoScore: readiness.quality.seoScore,
        languageQualityScore: readiness.languageScore,
      },
    });
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

  async getAutomationDiagnostics() {
    const cfg = this.settings.getCached();
    const [eligible, waitingImage, waitingQuality, waitingLanguage, waitingSchedule, portalQueue] =
      await Promise.all([
        this.prisma.newsArticle.count({
          where: { status: { in: ['DRAFT', 'REVIEW'] }, waitReason: 'AUTO_READY' },
        }),
        this.prisma.newsArticle.count({ where: { waitReason: 'IMAGE_REQUIRED' } }),
        this.prisma.newsArticle.count({ where: { waitReason: 'QUALITY_LOW' } }),
        this.prisma.newsArticle.count({ where: { waitReason: 'LANGUAGE_QUALITY_LOW' } }),
        this.prisma.newsArticle.count({ where: { waitReason: 'WAITING_SCHEDULE' } }),
        this.prisma.newsArticle.count({
          where: { status: 'PUBLISHED', portalPostId: null },
        }),
      ]);

    const schedule = isWithinPublishWindow(cfg.publishTimes);
    const heartbeat = getNewsWorkerHeartbeat();
    return {
      settings: cfg,
      autoPublishEnabled: cfg.publishMode === NewsPublishMode.AUTOMATIC || cfg.autoPublishArticles,
      scheduleWindowOpen: schedule.due,
      nextPublishSlot: nextPublishSlotLabel(cfg.publishTimes),
      workerOnline:
        heartbeat != null && Date.now() - heartbeat.getTime() < 90_000,
      workerLastHeartbeat: heartbeat?.toISOString() ?? null,
      eligibleForAuto: eligible,
      waitingImage,
      waitingQuality,
      waitingLanguage,
      waitingSchedule,
      portalPostQueue: portalQueue,
    };
  }
}
