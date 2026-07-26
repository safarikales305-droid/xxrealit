import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, UseGuards, ValidationPipe } from '@nestjs/common';
import { SeoContentStatus, SeoIndexStatus } from '@prisma/client';
import { AdminGuard } from '../admin/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdatePropertySeoDto, UpdateSeoSettingsDto } from './dto/seo.dto';
import { ProgrammaticSeoService } from './programmatic-seo.service';
import { SeoAdminCenterService } from './seo-admin-center.service';
import { SeoContentService, type SeoContentUpdateInput } from './seo-content.service';
import { SeoIndexQueueService } from './seo-index-queue.service';
import { SeoLocationService } from './seo-location.service';
import type { SeoLocationImportRow } from './seo-location.util';
import { SeoGenerationJobService } from './seo-generation-job.service';
import { SeoService, type SitemapKind } from './seo.service';

@Controller('seo')
export class SeoPublicController {
  constructor(
    private readonly seo: SeoService,
    private readonly programmaticSeo: ProgrammaticSeoService,
  ) {}

  @Get('settings')
  getPublicSettings() {
    return this.seo.getPublicSettings();
  }

  @Get('sitemap')
  getSitemap(@Query('origin') origin?: string) {
    const base = origin?.trim() || 'https://www.xxrealit.cz';
    return this.seo.getSitemapEntries(base);
  }

  @Get('sitemap/:kind')
  getSitemapByKind(@Param('kind') kind: string, @Query('origin') origin?: string) {
    const base = origin?.trim() || 'https://www.xxrealit.cz';
    return this.seo.getSitemapEntriesByKind(kind as SitemapKind, base);
  }

  @Get('programmatic/:intent/:location')
  getProgrammaticPage(
    @Param('intent') intent: string,
    @Param('location') location: string,
    @Query('limit') limit?: string,
  ) {
    const n = limit ? Number.parseInt(limit, 10) : 24;
    return this.programmaticSeo.resolvePageWithListings(intent, location, Number.isFinite(n) ? n : 24);
  }

  @Get('properties/by-slug/:slug')
  findBySlug(@Param('slug') slug: string) {
    return this.seo.findPropertyBySlug(slug);
  }

  @Get('posts/by-slug/:slug')
  findPostBySlug(@Param('slug') slug: string) {
    return this.seo.findPostBySlug(slug);
  }

  @Get('posts/:id/og-meta')
  getPostOgMeta(@Param('id') id: string) {
    return this.seo.getPostOgMeta(id);
  }
}

@Controller('admin/seo')
@UseGuards(JwtAuthGuard, AdminGuard)
export class SeoAdminController {
  constructor(
    private readonly seo: SeoService,
    private readonly indexQueue: SeoIndexQueueService,
    private readonly locations: SeoLocationService,
    private readonly content: SeoContentService,
    private readonly adminCenter: SeoAdminCenterService,
    private readonly generationJobs: SeoGenerationJobService,
    private readonly programmaticSeo: ProgrammaticSeoService,
  ) {}

  @Get('settings')
  getSettings() {
    return this.seo.getSettings();
  }

  @Patch('settings')
  updateSettings(
    @Body(new ValidationPipe({ whitelist: true, transform: true })) dto: UpdateSeoSettingsDto,
  ) {
    return this.seo.updateSettings(dto);
  }

  @Get('health')
  getHealth() {
    return this.seo.getAdminHealth();
  }

  @Post('backfill-slugs')
  backfillSlugs() {
    return this.seo.backfillPropertySlugs();
  }

  @Post('backfill-post-slugs')
  backfillPostSlugs() {
    return this.seo.backfillPostSlugs();
  }

  @Get('indexation')
  listIndexation(
    @Query('q') q?: string,
    @Query('status') status?: SeoIndexStatus,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.indexQueue.listAdmin({
      q,
      status,
      limit: limit ? Number.parseInt(limit, 10) : undefined,
      offset: offset ? Number.parseInt(offset, 10) : undefined,
    });
  }

  @Post('indexation/:id/reindex')
  requestReindex(@Param('id') id: string) {
    return this.indexQueue.requestReindex(id);
  }

  @Post('indexation/process-pending')
  processPending(@Query('limit') limit?: string) {
    return this.indexQueue.processPendingBatch(limit ? Number.parseInt(limit, 10) : 10);
  }

  @Get('properties/:id/suggest')
  suggest(@Param('id') id: string) {
    return this.seo.suggestPropertySeo(id);
  }

  @Patch('properties/:id')
  updatePropertySeo(
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true, transform: true })) dto: UpdatePropertySeoDto,
  ) {
    return this.seo.updatePropertySeo(id, dto);
  }

  @Get('locations/import-runs')
  listLocationImports() {
    return this.locations.listImportRuns();
  }

  @Post('locations/import')
  importLocations(@Body() body: { rows: SeoLocationImportRow[]; source?: string }) {
    return this.locations.importLocations(body.rows ?? [], body.source);
  }

  @Get('content')
  listSeoContent(@Query('q') q?: string, @Query('status') status?: SeoContentStatus) {
    return this.content.listAdmin(q, status);
  }

  @Post('content/generate')
  generateSeoContent(
    @Body() body: { intentSlug: string; locationSlug: string; useAi?: boolean; publish?: boolean },
    @Req() req: { user?: { id?: string; sub?: string } },
  ) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.content.generateDraft({ ...body, publish: body.publish ?? false }, userId);
  }

  @Post('generate')
  generateTestPage(
    @Body()
    body: {
      intentSlug?: string;
      locationSlug?: string;
      offerType?: string;
      propertyType?: string;
    },
    @Req() req: { user?: { id?: string; sub?: string } },
  ) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.generationJobs.generateTest(body, userId);
  }

  @Post('generate-batch')
  generateBatch(
    @Body()
    body: {
      limit?: number;
      batchSize?: number;
      intentSlug?: string;
      regionId?: string;
      districtId?: string;
      onlyMissing?: boolean;
      onlyWithListings?: boolean;
    },
    @Req() req: { user?: { id?: string; sub?: string } },
  ) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.generationJobs.enqueueBatch('BATCH', {
      limit: body.limit ?? 100,
      batchSize: body.batchSize,
      filters: body,
      createdById: userId,
    });
  }

  @Post('generate-all')
  generateAll(
    @Body() body: { batchSize?: number; qualityTiers?: Array<'HIGH' | 'MEDIUM' | 'LOW'> },
    @Req() req: { user?: { id?: string; sub?: string } },
  ) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.generationJobs.enqueueBatch('ALL', {
      batchSize: body.batchSize,
      filters: body.qualityTiers?.length ? { qualityTiers: body.qualityTiers } : {},
      createdById: userId,
    });
  }

  @Post('regenerate-drafts')
  regenerateDrafts(
    @Body() body: { limit?: number; batchSize?: number },
    @Req() req: { user?: { id?: string; sub?: string } },
  ) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.generationJobs.enqueueBatch('REGENERATE_DRAFTS', {
      limit: body.limit,
      batchSize: body.batchSize,
      createdById: userId,
    });
  }

  @Post('regenerate-errors')
  regenerateErrors(
    @Body() body: { limit?: number; batchSize?: number },
    @Req() req: { user?: { id?: string; sub?: string } },
  ) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.generationJobs.enqueueBatch('REGENERATE_ERRORS', {
      limit: body.limit,
      batchSize: body.batchSize,
      createdById: userId,
    });
  }

  @Post('pause')
  pauseGeneration(@Body() body: { jobId?: string }) {
    return this.generationJobs.pauseJob(body.jobId);
  }

  @Post('resume')
  resumeGeneration(@Body() body: { jobId?: string }) {
    return this.generationJobs.resumeJob(body.jobId);
  }

  @Post('cancel')
  cancelGeneration(@Body() body: { jobId?: string }) {
    return this.generationJobs.cancelJob(body.jobId);
  }

  @Get('progress')
  getGenerationProgress() {
    return this.generationJobs.getProgress();
  }

  @Get('jobs')
  listGenerationJobs(@Query('limit') limit?: string) {
    return this.generationJobs.listJobs(limit ? Number.parseInt(limit, 10) : 20);
  }

  @Get('jobs/:jobId/results')
  getJobResults(@Param('jobId') jobId: string) {
    return this.generationJobs.getJobResults(jobId);
  }

  @Get('jobs/:jobId/skipped')
  getJobSkipped(@Param('jobId') jobId: string, @Query('limit') limit?: string) {
    return this.generationJobs.getJobSkipped(jobId, limit ? Number.parseInt(limit, 10) : 200);
  }

  @Get('pages/:id')
  getSeoPage(@Param('id') id: string) {
    return this.content.getById(id);
  }

  @Get('pages/:id/preview')
  getSeoPagePreview(@Param('id') id: string, @Query('limit') limit?: string) {
    const n = limit ? Number.parseInt(limit, 10) : 24;
    return this.programmaticSeo.resolvePageByContentId(id, Number.isFinite(n) ? n : 24);
  }

  @Post('pages/:id/regenerate')
  regenerateSeoPage(@Param('id') id: string, @Req() req: { user?: { id?: string; sub?: string } }) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.content.regenerateById(id, userId);
  }

  @Put('pages/:id')
  updateSeoPage(
    @Param('id') id: string,
    @Body() body: SeoContentUpdateInput,
    @Req() req: { user?: { id?: string; sub?: string } },
  ) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.content.updateContent(id, body, userId);
  }

  @Post('pages/:id/publish')
  publishSeoPage(@Param('id') id: string, @Req() req: { user?: { id?: string; sub?: string } }) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.content.updateStatus(id, SeoContentStatus.PUBLISHED, userId);
  }

  @Post('pages/:id/unpublish')
  unpublishSeoPage(@Param('id') id: string, @Req() req: { user?: { id?: string; sub?: string } }) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.content.updateStatus(id, SeoContentStatus.DRAFT, userId);
  }

  @Delete('pages/:id')
  deleteSeoPage(@Param('id') id: string) {
    return this.content.deleteContent(id);
  }

  @Get('stats')
  getGenerationStats() {
    return this.generationJobs.getStats();
  }

  @Patch('content/:id/status')
  updateSeoContentStatus(
    @Param('id') id: string,
    @Body() body: { status: SeoContentStatus },
    @Req() req: { user?: { id?: string; sub?: string } },
  ) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.content.updateStatus(id, body.status, userId);
  }

  @Get('content/:id')
  getSeoContent(@Param('id') id: string) {
    return this.content.getById(id);
  }

  @Patch('content/:id')
  updateSeoContent(
    @Param('id') id: string,
    @Body() body: SeoContentUpdateInput,
    @Req() req: { user?: { id?: string; sub?: string } },
  ) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.content.updateContent(id, body, userId);
  }

  @Get('content/:id/versions')
  listSeoContentVersions(@Param('id') id: string) {
    return this.content.listVersions(id);
  }

  @Get('dashboard')
  getDashboard() {
    return this.adminCenter.getDashboard();
  }

  @Get('pages')
  listSeoPages(
    @Query('q') q?: string,
    @Query('regionId') regionId?: string,
    @Query('districtId') districtId?: string,
    @Query('locationId') locationId?: string,
    @Query('intentSlug') intentSlug?: string,
    @Query('propertyType') propertyType?: string,
    @Query('transaction') transaction?: string,
    @Query('indexed') indexed?: 'yes' | 'no',
    @Query('missingTitle') missingTitle?: string,
    @Query('missingDescription') missingDescription?: string,
    @Query('lowScore') lowScore?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sortBy') sortBy?: 'url' | 'title' | 'score' | 'listings' | 'updated',
    @Query('sortDir') sortDir?: 'asc' | 'desc',
  ) {
    return this.adminCenter.listPages({
      q,
      regionId,
      districtId,
      locationId,
      intentSlug,
      propertyType,
      transaction,
      indexed,
      missingTitle: missingTitle === '1' || missingTitle === 'true',
      missingDescription: missingDescription === '1' || missingDescription === 'true',
      lowScore: lowScore === '1' || lowScore === 'true',
      page: page ? Number.parseInt(page, 10) : undefined,
      pageSize: pageSize ? Number.parseInt(pageSize, 10) : undefined,
      sortBy,
      sortDir,
    });
  }

  @Get('locations')
  listSeoLocations(
    @Query('kind') kind?: string,
    @Query('q') q?: string,
    @Query('regionId') regionId?: string,
    @Query('dataSource') dataSource?: string,
    @Query('active') active?: 'yes' | 'no',
    @Query('missingGps') missingGps?: string,
    @Query('withoutSeoPage') withoutSeoPage?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.adminCenter.listLocations({
      kind: kind as never,
      q,
      regionId,
      dataSource,
      active,
      missingGps: missingGps === '1' || missingGps === 'true',
      withoutSeoPage: withoutSeoPage === '1' || withoutSeoPage === 'true',
      page: page ? Number.parseInt(page, 10) : undefined,
      pageSize: pageSize ? Number.parseInt(pageSize, 10) : undefined,
    });
  }

  @Get('redirects')
  listRedirects() {
    return this.adminCenter.listRedirects();
  }

  @Post('redirects')
  createRedirect(@Body() body: { fromPath: string; toPath: string; reason?: string }) {
    return this.adminCenter.createRedirect(body.fromPath, body.toPath, body.reason);
  }

  @Post('redirects/:id/delete')
  deleteRedirect(@Param('id') id: string) {
    return this.adminCenter.deleteRedirect(id);
  }

  @Get('search-console')
  getSearchConsole() {
    return this.adminCenter.getSearchConsoleStats();
  }

  @Post('audit/run')
  runAudit() {
    return this.adminCenter.runAudit();
  }

  @Get('history')
  listChangeHistory(@Query('limit') limit?: string) {
    return this.adminCenter.listChangeHistory(limit ? Number.parseInt(limit, 10) : 50);
  }
}
