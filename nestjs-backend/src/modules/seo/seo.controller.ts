import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import { SeoIndexStatus } from '@prisma/client';
import { AdminGuard } from '../admin/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdatePropertySeoDto, UpdateSeoSettingsDto } from './dto/seo.dto';
import { ProgrammaticSeoService } from './programmatic-seo.service';
import { SeoIndexQueueService } from './seo-index-queue.service';
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
}
