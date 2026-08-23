import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { NewsArticleStatus, NewsSourceType, NewsYoutubePublishMode } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/guards/admin.guard';
import {
  NEWS_ARTICLE_CATEGORIES,
  NEWS_CATEGORY_LABELS,
  NEWS_EDITORIAL_ENABLED,
} from './news-editorial.constants';
import { NewsArticleService } from './news-article.service';
import { NewsAuditService } from './news-audit.service';
import { NewsEditorialSettingsService } from './news-editorial-settings.service';
import { NewsFetchService } from './news-fetch.service';
import { NewsPublishService } from './news-publish.service';
import { NewsRssTestService } from './news-rss-test.service';
import { NewsSourceService } from './news-source.service';
import { NewsEditorialWorkerService } from './news-editorial-worker.service';
import { NewsBackfillService } from './news-backfill.service';
import { NewsYoutubeService } from './news-youtube.service';
import type { NewsAutomationSettings } from './news-editorial-settings.types';

@Controller('admin/news-editorial')
@UseGuards(JwtAuthGuard, AdminGuard)
export class NewsEditorialAdminController {
  constructor(
    private readonly articles: NewsArticleService,
    private readonly sources: NewsSourceService,
    private readonly settings: NewsEditorialSettingsService,
    private readonly fetchService: NewsFetchService,
    private readonly publish: NewsPublishService,
    private readonly rssTest: NewsRssTestService,
    private readonly worker: NewsEditorialWorkerService,
    private readonly audit: NewsAuditService,
    private readonly backfill: NewsBackfillService,
    private readonly youtube: NewsYoutubeService,
  ) {}

  @Get('dashboard')
  async dashboard() {
    const [stats, sourceCount, settings] = await Promise.all([
      this.articles.getDashboardStats(),
      this.sources.listWithStats(),
      this.settings.getCached(),
    ]);
    return {
      enabled: NEWS_EDITORIAL_ENABLED,
      stats,
      sources: sourceCount.length,
      settings,
      categories: NEWS_ARTICLE_CATEGORIES.map((c) => ({
        value: c,
        label: NEWS_CATEGORY_LABELS[c],
      })),
    };
  }

  @Get('sources')
  listSources() {
    return this.sources.listWithStats();
  }

  @Post('sources')
  createSource(
    @Body()
    body: {
      name: string;
      url: string;
      type: NewsSourceType;
      category?: string;
      enabled?: boolean;
      trustScore?: number;
      priority?: number;
      checkIntervalMinutes?: number;
      note?: string;
      channelId?: string;
      youtubePublishMode?: NewsYoutubePublishMode;
      youtubeCreatePost?: boolean;
      youtubeFacebookPost?: boolean;
      minRelevanceScore?: number;
    },
  ) {
    return this.sources.create(body);
  }

  @Patch('sources/:id')
  updateSource(
    @Param('id') id: string,
    @Body()
    body: Partial<{
      name: string;
      url: string;
      type: NewsSourceType;
      category: string | null;
      enabled: boolean;
      trustScore: number;
      priority: number;
      checkIntervalMinutes: number;
      note: string | null;
      channelId: string | null;
      youtubePublishMode: NewsYoutubePublishMode;
      youtubeCreatePost: boolean;
      youtubeFacebookPost: boolean;
      minRelevanceScore: number | null;
    }>,
  ) {
    return this.sources.update(id, body);
  }

  @Delete('sources/:id')
  deleteSource(@Param('id') id: string) {
    return this.sources.remove(id);
  }

  @Get('settings')
  getSettings() {
    return this.settings.getCached();
  }

  @Patch('settings')
  updateSettings(@Body() body: Partial<NewsAutomationSettings>) {
    return this.settings.updateSettings(body);
  }

  @Get('articles')
  listArticles(@Query() query: Record<string, string | undefined>) {
    return this.articles.listArticles(query);
  }

  @Get('articles/:id')
  getArticle(@Param('id') id: string) {
    return this.articles.getArticle(id);
  }

  @Patch('articles/:id')
  async updateArticle(
    @Param('id') id: string,
    @Body()
    body: Partial<{
      title: string;
      seoTitle: string;
      seoDescription: string;
      perex: string;
      bodyMarkdown: string;
      category: string;
      region: string | null;
      status: NewsArticleStatus;
      editorNotes: string | null;
      scheduledAt: string | null;
      indexable: boolean;
      robots: string;
    }>,
  ) {
    const { scheduledAt, ...rest } = body;
    const updated = await this.articles.updateArticle(id, {
      ...rest,
      scheduledAt:
        scheduledAt === undefined
          ? undefined
          : scheduledAt
            ? new Date(scheduledAt)
            : null,
    });
    if (updated.status === NewsArticleStatus.PUBLISHED) {
      await this.publish.syncPortalPost(id);
    }
    return this.articles.getArticle(id);
  }

  @Post('articles/:id/publish')
  publishArticle(@Param('id') id: string, @Body() body?: { force?: boolean }) {
    return this.publish.publish(id, body);
  }

  @Post('articles/:id/schedule')
  scheduleArticle(@Param('id') id: string, @Body() body: { scheduledAt: string }) {
    return this.publish.schedule(id, new Date(body.scheduledAt));
  }

  @Post('articles/:id/regenerate')
  regenerateArticle(@Param('id') id: string) {
    return this.articles.regenerate(id);
  }

  @Post('articles/:id/reject')
  async rejectArticle(@Param('id') id: string, @Body() body: { reason: string }) {
    const updated = await this.articles.reject(id, body.reason ?? 'Zamítnuto redakcí');
    await this.publish.hidePortalPost(id);
    return updated;
  }

  @Post('articles/:id/sync-portal-post')
  syncPortalPost(@Param('id') id: string) {
    return this.publish.syncPortalPost(id);
  }

  @Post('articles/:id/republish-facebook')
  republishFacebook(@Param('id') id: string) {
    return this.publish.republishFacebook(id);
  }

  @Post('sources/:id/test-rss')
  testRss(@Param('id') id: string) {
    return this.rssTest.testSource(id);
  }

  @Post('sources/:id/test-import-one')
  testImportOne(@Param('id') id: string) {
    return this.rssTest.testImportOne(id);
  }

  @Post('sources/:id/test-pipeline')
  testPipeline(@Param('id') id: string) {
    return this.rssTest.testPipeline(id);
  }

  @Post('sources/:id/test-youtube')
  testYoutube(@Param('id') id: string) {
    return this.youtube.testChannel(id);
  }

  @Post('sources/:id/test-youtube-import-one')
  testYoutubeImportOne(@Param('id') id: string) {
    return this.youtube.testImportOne(id);
  }

  @Post('sources/:id/test-youtube-pipeline')
  testYoutubePipeline(@Param('id') id: string) {
    return this.youtube.testPipeline(id);
  }

  @Post('sources/:id/youtube-backfill')
  youtubeBackfill(
    @Param('id') id: string,
    @Body() body?: { count?: number; ignoreRelevance?: boolean },
  ) {
    return this.youtube.backfillRecent(id, body?.count ?? 5, {
      ignoreRelevance: body?.ignoreRelevance,
    });
  }

  @Post('sources/:id/youtube-diagnose')
  youtubeDiagnose(@Param('id') id: string) {
    return this.youtube.diagnoseSource(id);
  }

  @Get('youtube/status')
  youtubeStatus() {
    return this.youtube.getAdminStatus();
  }

  @Post('articles/:id/quality')
  async qualityGate(@Param('id') id: string) {
    return this.articles.runQualityGateForId(id);
  }

  @Post('articles/from-url')
  createFromUrl(@Body() body: { url: string }) {
    return this.articles.createFromUrl(body.url);
  }

  @Get('worker')
  workerStatus() {
    return this.worker.getStatus();
  }

  @Post('worker/run-fetch')
  async runFetch() {
    const results = await this.fetchService.fetchDueSources(10);
    this.worker.pulse();
    return { results };
  }

  @Post('worker/pulse')
  pulseWorker() {
    this.worker.pulse();
    return { ok: true };
  }

  @Post('worker/pause')
  pauseWorker() {
    return this.worker.pause();
  }

  @Post('worker/resume')
  resumeWorker() {
    return this.worker.resume();
  }

  @Post('backfill/images')
  backfillImages() {
    return this.backfill.startBackfillImages();
  }

  @Post('backfill/posts')
  backfillPosts() {
    return this.backfill.startBackfillPosts();
  }

  @Get('jobs/:id')
  getJob(@Param('id') id: string) {
    return this.backfill.getJob(id);
  }

  @Post('jobs/:id/pause')
  pauseJob(@Param('id') id: string) {
    return this.backfill.pauseJob(id);
  }

  @Post('jobs/:id/resume')
  resumeJob(@Param('id') id: string) {
    return this.backfill.resumeJob(id);
  }

  @Post('jobs/:id/cancel')
  cancelJob(@Param('id') id: string) {
    return this.backfill.cancelJob(id);
  }

  @Post('backfill/bad-articles')
  backfillBadArticles() {
    return this.backfill.startBackfillBadArticles();
  }

  @Get('automation/diagnostics')
  automationDiagnostics() {
    return this.publish.getAutomationDiagnostics();
  }

  @Post('test-auto-publish')
  async testAutoPublish(@Body() body?: { articleId?: string; bypassSchedule?: boolean }) {
    const opts = { bypassSchedule: body?.bypassSchedule !== false };
    if (body?.articleId) {
      return this.publish.tryAutoPublish(body.articleId, opts);
    }
    const candidate = await this.articles.listArticles({ status: 'REVIEW', limit: '1' });
    const article = candidate.items[0] ?? (await this.articles.listArticles({ status: 'DRAFT', limit: '1' })).items[0];
    if (!article) return { ok: false, reason: 'Žádný kandidát' };
    return this.publish.tryAutoPublish(article.id, opts);
  }

  @Get('audit-log')
  auditLog(
    @Query('limit') limit?: string,
    @Query('articleId') articleId?: string,
  ) {
    return this.audit.list(limit ? Number(limit) : 100, articleId);
  }
}
