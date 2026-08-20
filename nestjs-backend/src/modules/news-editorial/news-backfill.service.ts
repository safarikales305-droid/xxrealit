import { Injectable, Logger } from '@nestjs/common';
import { NewsArticleStatus, NewsWorkerJobStatus, NewsWorkerJobType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { NewsAuditService } from './news-audit.service';
import { NewsImageService } from './news-image.service';
import { NewsPortalPostService } from './news-portal-post.service';

export type NewsBackfillProgress = {
  jobId: string;
  type: 'IMAGES' | 'POSTS';
  status: NewsWorkerJobStatus;
  total: number;
  done: number;
  fallback: number;
  errors: number;
  current?: string | null;
};

@Injectable()
export class NewsBackfillService {
  private readonly log = new Logger(NewsBackfillService.name);
  private readonly running = new Map<string, { cancel: boolean; pause: boolean }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly images: NewsImageService,
    private readonly portalPosts: NewsPortalPostService,
    private readonly audit: NewsAuditService,
  ) {}

  async getJob(id: string): Promise<NewsBackfillProgress | null> {
    const job = await this.prisma.newsWorkerJob.findUnique({ where: { id } });
    if (!job) return null;
    const result = (job.result ?? {}) as Record<string, number | string>;
    return {
      jobId: job.id,
      type: job.type === NewsWorkerJobType.ARTICLE_GENERATION ? 'IMAGES' : 'POSTS',
      status: job.status,
      total: Number(result.total ?? 0),
      done: Number(result.done ?? 0),
      fallback: Number(result.fallback ?? 0),
      errors: Number(result.errors ?? 0),
      current: (result.current as string) ?? null,
    };
  }

  pauseJob(jobId: string) {
    const state = this.running.get(jobId);
    if (state) state.pause = true;
    return this.prisma.newsWorkerJob.update({
      where: { id: jobId },
      data: { status: 'PENDING' },
    });
  }

  resumeJob(jobId: string) {
    const state = this.running.get(jobId);
    if (state) state.pause = false;
    void this.continueJob(jobId);
    return { ok: true };
  }

  cancelJob(jobId: string) {
    const state = this.running.get(jobId);
    if (state) state.cancel = true;
    return this.prisma.newsWorkerJob.update({
      where: { id: jobId },
      data: { status: 'CANCELLED', finishedAt: new Date() },
    });
  }

  async startBackfillImages(): Promise<{ jobId: string }> {
    const articles = await this.prisma.newsArticle.findMany({
      where: {
        status: NewsArticleStatus.PUBLISHED,
        OR: [{ ogImageUrl: null }, { ogImageUrl: '' }],
      },
      select: { id: true, slug: true, title: true, category: true },
      orderBy: { publishedAt: 'asc' },
    });

    const job = await this.prisma.newsWorkerJob.create({
      data: {
        type: NewsWorkerJobType.ARTICLE_GENERATION,
        status: 'RUNNING',
        startedAt: new Date(),
        payload: { kind: 'BACKFILL_IMAGES' },
        result: { total: articles.length, done: 0, fallback: 0, errors: 0 },
      },
    });

    this.running.set(job.id, { cancel: false, pause: false });
    void this.runImageBackfill(job.id, articles);
    return { jobId: job.id };
  }

  async startBackfillPosts(): Promise<{ jobId: string }> {
    const articles = await this.prisma.newsArticle.findMany({
      where: { status: NewsArticleStatus.PUBLISHED, portalPostId: null },
      select: { id: true, title: true },
      orderBy: { publishedAt: 'asc' },
    });

    const job = await this.prisma.newsWorkerJob.create({
      data: {
        type: NewsWorkerJobType.PUBLISH,
        status: 'RUNNING',
        startedAt: new Date(),
        payload: { kind: 'BACKFILL_POSTS' },
        result: { total: articles.length, done: 0, fallback: 0, errors: 0 },
      },
    });

    this.running.set(job.id, { cancel: false, pause: false });
    void this.runPostBackfill(job.id, articles);
    return { jobId: job.id };
  }

  private async continueJob(jobId: string) {
    const job = await this.prisma.newsWorkerJob.findUnique({ where: { id: jobId } });
    if (!job || job.status === 'CANCELLED' || job.status === 'COMPLETED') return;
    const payload = job.payload as { kind?: string };
    if (payload?.kind === 'BACKFILL_IMAGES') {
      const articles = await this.prisma.newsArticle.findMany({
        where: {
          status: NewsArticleStatus.PUBLISHED,
          OR: [{ ogImageUrl: null }, { ogImageUrl: '' }],
        },
        select: { id: true, slug: true, title: true, category: true },
      });
      void this.runImageBackfill(jobId, articles);
    }
  }

  private async runImageBackfill(
    jobId: string,
    articles: Array<{ id: string; slug: string; title: string; category: string }>,
  ) {
    let done = 0;
    let fallback = 0;
    let errors = 0;

    for (const article of articles) {
      const state = this.running.get(jobId);
      if (!state || state.cancel) break;
      while (state.pause) {
        await new Promise((r) => setTimeout(r, 500));
        if (state.cancel) break;
      }

      try {
        const sourceLink = await this.prisma.newsArticleSource.findFirst({
          where: { articleId: article.id },
          include: { sourceItem: true },
        });
        const resolved = await this.images.resolveHeroForArticle({
          articleId: article.id,
          slug: article.slug,
          title: article.title,
          category: article.category,
          rssImageUrl: sourceLink?.sourceItem?.imageUrl,
          articlePageUrl: sourceLink?.sourceUrl,
        });

        await this.prisma.newsArticle.update({
          where: { id: article.id },
          data: {
            ogImageUrl: resolved.storedUrl,
            ogImageAlt: resolved.alt,
            imageDiagnosticsJson: resolved.diagnostics as object,
          },
        });

        if (resolved.diagnostics.imageSource === 'fallback') fallback += 1;
        done += 1;
        await this.portalPosts.syncFromArticle(article.id, { enqueueFacebook: false });
      } catch (err) {
        errors += 1;
        this.log.warn(`Image backfill ${article.id}: ${err instanceof Error ? err.message : err}`);
      }

      const progress = Math.round((done / Math.max(articles.length, 1)) * 100);
      await this.prisma.newsWorkerJob.update({
        where: { id: jobId },
        data: {
          progress,
          heartbeatAt: new Date(),
          result: {
            total: articles.length,
            done,
            fallback,
            errors,
            current: article.title,
          },
        },
      });
    }

    const state = this.running.get(jobId);
    const status =
      state?.cancel ? NewsWorkerJobStatus.CANCELLED : NewsWorkerJobStatus.COMPLETED;
    await this.prisma.newsWorkerJob.update({
      where: { id: jobId },
      data: {
        status,
        finishedAt: new Date(),
        progress: 100,
        result: { total: articles.length, done, fallback, errors },
      },
    });
    this.running.delete(jobId);
    await this.audit.log('NEWS_BACKFILL_IMAGES', `Hotovo ${done}/${articles.length}`, {
      metadata: { jobId, done, fallback, errors },
    });
  }

  private async runPostBackfill(
    jobId: string,
    articles: Array<{ id: string; title: string }>,
  ) {
    let done = 0;
    let errors = 0;

    for (const article of articles) {
      const state = this.running.get(jobId);
      if (!state || state.cancel) break;
      while (state.pause) {
        await new Promise((r) => setTimeout(r, 500));
        if (state.cancel) break;
      }

      try {
        const existing = await this.prisma.post.findFirst({
          where: { newsArticleId: article.id },
          select: { id: true },
        });
        if (existing) {
          await this.prisma.newsArticle.update({
            where: { id: article.id },
            data: { portalPostId: existing.id },
          });
        } else {
          await this.portalPosts.syncFromArticle(article.id, { enqueueFacebook: false });
        }
        done += 1;
      } catch (err) {
        errors += 1;
        this.log.warn(`Post backfill ${article.id}: ${err instanceof Error ? err.message : err}`);
      }

      await this.prisma.newsWorkerJob.update({
        where: { id: jobId },
        data: {
          progress: Math.round((done / Math.max(articles.length, 1)) * 100),
          heartbeatAt: new Date(),
          result: { total: articles.length, done, fallback: 0, errors, current: article.title },
        },
      });
    }

    const state = this.running.get(jobId);
    await this.prisma.newsWorkerJob.update({
      where: { id: jobId },
      data: {
        status: state?.cancel ? 'CANCELLED' : 'COMPLETED',
        finishedAt: new Date(),
        progress: 100,
        result: { total: articles.length, done, fallback: 0, errors },
      },
    });
    this.running.delete(jobId);
    await this.audit.log('NEWS_BACKFILL_POSTS', `Hotovo ${done}/${articles.length}`, {
      metadata: { jobId, done, errors },
    });
  }
}
