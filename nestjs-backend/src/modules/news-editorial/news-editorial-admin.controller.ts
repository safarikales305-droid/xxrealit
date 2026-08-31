import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { NewsArticleStatus, NewsSourceType, NewsYoutubePublishMode } from '@prisma/client';
import type { EditorialContentMode } from './news-youtube-seo-gate.constants';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/guards/admin.guard';
import { PROFILE_UPLOAD_MAX_BYTES } from '../upload/profile-images.service';
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
import { NewsSourceDeleteService } from './news-source-delete.service';
import { NewsEditorialWorkerService } from './news-editorial-worker.service';
import { NewsBackfillService } from './news-backfill.service';
import { NewsYoutubeService } from './news-youtube.service';
import { NewsYoutubeDiscoveryService } from './news-youtube-discovery.service';
import { NewsYoutubeSeoGateService } from './news-youtube-seo-gate.service';
import { NewsSystemUserService } from './news-system-user.service';
import { EditorialPortalPostService } from './editorial-portal-post.service';
import type { NewsAutomationSettings } from './news-editorial-settings.types';
import type { SystemAuthorProfilePatch } from './news-system-user.service';
import { PrismaService } from '../../database/prisma.service';
import {
  buildFacebookPostMessage,
  getFacebookDestinationUrl,
  isValidFacebookDestinationUrl,
  type FacebookDestinationPost,
} from '../social/autopost/facebook-post-destination.util';
import { verifyPublicPostResolvable } from '../posts/public-post-resolve.util';

@Controller('admin/news-editorial')
@UseGuards(JwtAuthGuard, AdminGuard)
export class NewsEditorialAdminController {
  constructor(
    private readonly articles: NewsArticleService,
    private readonly sources: NewsSourceService,
    private readonly sourceDelete: NewsSourceDeleteService,
    private readonly settings: NewsEditorialSettingsService,
    private readonly fetchService: NewsFetchService,
    private readonly publish: NewsPublishService,
    private readonly rssTest: NewsRssTestService,
    private readonly worker: NewsEditorialWorkerService,
    private readonly audit: NewsAuditService,
    private readonly backfill: NewsBackfillService,
    private readonly youtube: NewsYoutubeService,
    private readonly youtubeDiscovery: NewsYoutubeDiscoveryService,
    private readonly youtubeSeoGate: NewsYoutubeSeoGateService,
    private readonly systemUser: NewsSystemUserService,
    private readonly editorialPosts: EditorialPortalPostService,
    private readonly prisma: PrismaService,
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
  async createSource(
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
    const source = await this.sources.create(body);
    if (source.type === NewsSourceType.YOUTUBE_CHANNEL && source.enabled) {
      void this.youtube.runInitialSync(source.id).catch((err) => {
        // eslint-disable-next-line no-console
        console.warn(
          `[news-editorial] initial YouTube sync failed for ${source.id}: ${
            err instanceof Error ? err.message : err
          }`,
        );
      });
    }
    return source;
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
      youtubeAutoImport: boolean;
      youtubePublishToShorts: boolean;
      youtubeUseForReel: boolean;
      contentCategoryId: string | null;
      minRelevanceScore: number | null;
    }>,
  ) {
    return this.sources.update(id, body);
  }

  @Get('sources/:id/delete-preview')
  deleteSourcePreview(@Param('id') id: string) {
    return this.sourceDelete.getDeletePreview(id);
  }

  @Delete('sources/:id')
  deleteSource(@Param('id') id: string) {
    return this.sourceDelete.removeWithContent(id);
  }

  @Get('settings')
  getSettings() {
    return this.settings.getCached();
  }

  @Patch('settings')
  updateSettings(@Body() body: Partial<NewsAutomationSettings>) {
    return this.settings.updateSettings(body);
  }

  @Post('facebook-preview')
  async facebookPreview(@Body() body: { postId?: string }) {
    const postId = body.postId?.trim();
    if (!postId) throw new BadRequestException('Chybí postId.');

    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: {
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
        media: { select: { type: true } },
      },
    });
    if (!post) throw new BadRequestException('Příspěvek nenalezen.');

    const cfg = this.settings.getCached();
    const portalCheck = await verifyPublicPostResolvable(this.prisma, post);
    const portalUrl = portalCheck.ok ? portalCheck.generatedUrl : '';
    const fbPost = post as FacebookDestinationPost;
    const destinationUrl = getFacebookDestinationUrl(fbPost, cfg, portalUrl);
    const valid =
      isValidFacebookDestinationUrl(destinationUrl) &&
      (destinationUrl !== portalUrl || portalCheck.ok);

    const message = buildFacebookPostMessage({
      post: fbPost,
      destinationUrl: valid ? destinationUrl : portalUrl || destinationUrl,
      settings: cfg,
    });

    return {
      message,
      destinationUrl,
      valid,
      status: valid ? 'VALID' : 'INVALID_DESTINATION_URL',
    };
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

  @Post('youtube/test-api')
  testYoutubeApi() {
    return this.youtube.testApiConnection();
  }

  @Post('youtube/sync-all')
  syncAllYoutubeSources() {
    return this.youtube.syncAllActiveSources();
  }

  @Get('system-author')
  systemAuthor() {
    return this.systemUser.getSystemAuthorStatus();
  }

  @Patch('system-author')
  updateSystemAuthor(@Body() body: SystemAuthorProfilePatch) {
    return this.systemUser.updateSystemAuthorProfile(body);
  }

  @Post('system-author/avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: PROFILE_UPLOAD_MAX_BYTES },
    }),
  )
  uploadSystemAuthorAvatar(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Soubor nebyl přijat.');
    return this.systemUser.uploadSystemAuthorAvatar(file);
  }

  @Delete('system-author/avatar')
  clearSystemAuthorAvatar() {
    return this.systemUser.clearSystemAuthorAvatar();
  }

  @Post('backfill/repair-media')
  repairArticleMedia() {
    return this.backfill.repairArticleMedia();
  }

  @Post('sources/:id/youtube-poll-now')
  youtubePollNow(
    @Param('id') id: string,
    @Body() body?: { maxVideos?: number; ignoreRelevance?: boolean },
  ) {
    return this.youtube.pollSourceNow(id, body);
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

  @Post('backfill/youtube-posts')
  backfillYoutubePosts() {
    return this.editorialPosts.repairMissingPosts().then((r) => r.youtube);
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

  @Get('distribution/diagnostics')
  distributionDiagnostics() {
    return this.editorialPosts.getDistributionDiagnostics();
  }

  @Post('distribution/repair')
  repairDistribution() {
    return this.editorialPosts.repairMissingPosts();
  }

  @Post('test-portal-post-feed')
  testPortalPostFeed(@Body() body?: { articleId?: string; youtubeVideoId?: string; postId?: string }) {
    if (body?.postId?.trim()) {
      return this.editorialPosts.testFeedVisibility(body.postId.trim());
    }
    if (body?.articleId?.trim()) {
      return this.editorialPosts.createPostFromArticle(body.articleId.trim()).then(async (res) => ({
        ...res,
        feedQueryFound: res.postId
          ? await this.editorialPosts.testFeedVisibility(res.postId)
          : null,
      }));
    }
    if (body?.youtubeVideoId?.trim()) {
      return this.editorialPosts
        .createPostFromYoutubeVideoId(body.youtubeVideoId.trim(), { forcePublish: true })
        .then(async (res) => ({
          ...res,
          feedQueryFound: res.postId
            ? await this.editorialPosts.testFeedVisibility(res.postId)
            : null,
        }));
    }
    return this.backfill.testPortalPostFeed(body);
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

  @Get('youtube/discovery/settings')
  getYoutubeDiscoverySettings() {
    return this.youtubeDiscovery.getSettings();
  }

  @Patch('youtube/discovery/settings')
  patchYoutubeDiscoverySettings(@Body() body: Record<string, unknown>) {
    return this.youtubeDiscovery.updateSettings(body as Parameters<NewsYoutubeDiscoveryService['updateSettings']>[0]);
  }

  @Get('youtube/discovery/stats')
  getYoutubeDiscoveryStats() {
    return this.youtubeDiscovery.getDiscoveryStats();
  }

  @Get('youtube/discovery/history')
  getYoutubeDiscoveryHistory(@Query('limit') limitRaw?: string) {
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 20;
    return this.youtubeDiscovery.listDiscoveryHistory(
      Number.isFinite(limit) ? limit : 20,
    );
  }

  @Get('youtube/suggestions')
  listYoutubeSuggestions(
    @Query('status') status?: string,
    @Query('categoryId') categoryId?: string,
    @Query('categorySlug') categorySlug?: string,
    @Query('minScore') minScoreRaw?: string,
    @Query('search') search?: string,
    @Query('sort') sort?: string,
    @Query('page') pageRaw?: string,
    @Query('pageSize') pageSizeRaw?: string,
  ) {
    const allowed = ['PENDING', 'APPROVED', 'REJECTED', 'IGNORED'] as const;
    const st = allowed.find((x) => x === status);
    const sortAllowed = ['score', 'newest', 'activity', 'videos'] as const;
    const sortVal = sortAllowed.find((x) => x === sort);
    const page = pageRaw ? Number.parseInt(pageRaw, 10) : 1;
    const pageSize = pageSizeRaw ? Number.parseInt(pageSizeRaw, 10) : 30;
    const minScore = minScoreRaw ? Number.parseInt(minScoreRaw, 10) : undefined;
    return this.youtubeDiscovery.listSuggestions({
      status: st,
      categoryId: categoryId?.trim() || undefined,
      categorySlug: categorySlug?.trim() || undefined,
      minScore: Number.isFinite(minScore) ? minScore : undefined,
      search: search?.trim() || undefined,
      sort: sortVal,
      page: Number.isFinite(page) ? page : 1,
      pageSize: Number.isFinite(pageSize) ? pageSize : 30,
    });
  }

  @Post('youtube/discovery/run')
  runYoutubeDiscovery(@Body() body?: { categorySlug?: string }) {
    return this.youtubeDiscovery.runDiscovery({
      categorySlug: body?.categorySlug?.trim() || undefined,
      triggeredBy: 'admin',
    });
  }

  @Post('youtube/suggestions/bulk-approve')
  bulkApproveYoutubeSuggestions(
    @CurrentUser() user: AuthUser,
    @Body() body: { ids?: string[] },
  ) {
    const ids = (body?.ids ?? []).filter((x) => typeof x === 'string' && x.trim());
    if (!ids.length) throw new BadRequestException('ids je povinné.');
    return this.youtubeDiscovery.approveSuggestions(ids, user.id);
  }

  @Post('youtube/suggestions/:id/approve')
  approveYoutubeSuggestion(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() body?: { categoryId?: string },
  ) {
    return this.youtubeDiscovery.approveSuggestion(id, user.id, body?.categoryId);
  }

  @Post('youtube/suggestions/:id/reject')
  rejectYoutubeSuggestion(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.youtubeDiscovery.rejectSuggestion(id, user.id);
  }

  @Patch('youtube/suggestions/:id')
  patchYoutubeSuggestion(@Param('id') id: string, @Body() body: { categoryId?: string }) {
    if (!body.categoryId) throw new BadRequestException('categoryId je povinné.');
    return this.youtubeDiscovery.patchSuggestionCategory(id, body.categoryId);
  }

  @Get('youtube/posts/seo')
  listYoutubePostsSeo(
    @Query('contentMode') contentMode?: string,
    @Query('minScore') minScoreRaw?: string,
    @Query('indexable') indexableRaw?: string,
    @Query('category') category?: string,
    @Query('location') location?: string,
    @Query('sourceId') sourceId?: string,
    @Query('search') search?: string,
    @Query('page') pageRaw?: string,
    @Query('pageSize') pageSizeRaw?: string,
  ) {
    const modes = ['SHORTS_ONLY', 'POST_AND_SHORTS', 'ARTICLE_FEATURE'] as const;
    const mode = modes.find((m) => m === contentMode);
    const minScore = minScoreRaw ? Number.parseInt(minScoreRaw, 10) : undefined;
    const page = pageRaw ? Number.parseInt(pageRaw, 10) : 1;
    const pageSize = pageSizeRaw ? Number.parseInt(pageSizeRaw, 10) : 30;
    const indexable =
      indexableRaw === 'true' ? true : indexableRaw === 'false' ? false : undefined;
    return this.youtubeSeoGate.listPostsSeo({
      contentMode: mode as EditorialContentMode | undefined,
      minScore: Number.isFinite(minScore) ? minScore : undefined,
      indexable,
      category: category?.trim() || undefined,
      location: location?.trim() || undefined,
      sourceId: sourceId?.trim() || undefined,
      search: search?.trim() || undefined,
      page: Number.isFinite(page) ? page : 1,
      pageSize: Number.isFinite(pageSize) ? pageSize : 30,
    });
  }

  @Get('youtube/posts/:postId/seo')
  getYoutubePostSeo(@Param('postId') postId: string) {
    return this.youtubeSeoGate.getPostSeoDetail(postId);
  }

  @Patch('youtube/posts/:postId/seo')
  patchYoutubePostSeo(
    @Param('postId') postId: string,
    @Body() body: { contentMode?: EditorialContentMode; isIndexable?: boolean },
  ) {
    return this.youtubeSeoGate.patchPostSeo(postId, body);
  }
}
