import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../admin/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ContentSourceCategoryService } from './content-source-category.service';
import { EditorialCenterDashboardService } from './editorial-center-dashboard.service';
import { EditorialReelJobService } from './editorial-reel-job.service';
import { EditorialReelSettingsService } from './editorial-reel-settings.service';
import { ShortsMusicService } from '../shorts-music/shorts-music.service';
import { YouTubeOAuthService } from '../social/youtube/youtube-oauth.service';
import { YouTubePublishJobService } from '../social/youtube/youtube-publish-job.service';
import { PrismaService } from '../../database/prisma.service';

@Controller('admin/editorial-center')
@UseGuards(JwtAuthGuard, AdminGuard)
export class EditorialReelAdminController {
  constructor(
    private readonly dashboard: EditorialCenterDashboardService,
    private readonly categories: ContentSourceCategoryService,
    private readonly reelSettings: EditorialReelSettingsService,
    private readonly reelJobs: EditorialReelJobService,
    private readonly prisma: PrismaService,
    private readonly shortsMusic: ShortsMusicService,
    private readonly youtubeOAuth: YouTubeOAuthService,
    private readonly youtubePublish: YouTubePublishJobService,
  ) {}

  @Get('dashboard')
  getDashboard() {
    return this.dashboard.getDashboard();
  }

  @Get('categories')
  listCategories() {
    return this.categories.list(true);
  }

  @Post('categories')
  createCategory(@Body() body: { slug: string; label: string; sortOrder?: number }) {
    return this.categories.create(body);
  }

  @Patch('categories/:id')
  updateCategory(
    @Param('id') id: string,
    @Body() body: { label?: string; sortOrder?: number; active?: boolean; slug?: string },
  ) {
    return this.categories.update(id, body);
  }

  @Get('reel/settings')
  getReelSettings() {
    return this.reelSettings.getSettings();
  }

  @Patch('reel/settings')
  updateReelSettings(@Body() body: Record<string, unknown>) {
    return this.reelSettings.updateSettings(body);
  }

  @Get('reel/jobs')
  listReelJobs() {
    return this.reelJobs.listJobs();
  }

  @Get('reel/jobs/:id')
  getReelJob(@Param('id') id: string) {
    return this.reelJobs.getJob(id);
  }

  @Post('reel/jobs')
  createReelJob(@Body() body: { postIds: string[]; title?: string; templateId?: string; categoryId?: string }) {
    return this.reelJobs.createManualJob(body);
  }

  @Post('reel/jobs/:id/render')
  renderReelJob(@Param('id') id: string) {
    return this.reelJobs.retryRender(id);
  }

  @Post('reel/jobs/:id/publish')
  publishReelJob(@Param('id') id: string) {
    return this.reelJobs.publishToFacebookOnly(id);
  }

  @Post('reel/jobs/:id/publish/facebook')
  publishReelFacebook(@Param('id') id: string) {
    return this.reelJobs.publishToFacebookOnly(id);
  }

  @Post('reel/jobs/:id/publish/youtube')
  publishReelYoutube(@Param('id') id: string) {
    return this.reelJobs.publishToYoutubeOnly(id);
  }

  @Post('reel/jobs/:id/publish/youtube/retry')
  retryReelYoutube(@Param('id') id: string) {
    return this.youtubePublish.retry(id);
  }

  @Get('youtube/status')
  getYoutubeStatus() {
    return this.youtubeOAuth.getConnectionStatus();
  }

  @Get('youtube/publish-summary')
  getYoutubePublishSummary() {
    return this.youtubePublish.getPublishSummary();
  }

  @Delete('reel/jobs/:id')
  async deleteReelJob(@Param('id') id: string) {
    await this.prisma.editorialReelJob.delete({ where: { id } });
    return { ok: true };
  }

  @Get('reel/pending')
  async getPendingVideos() {
    const row = await this.prisma.appSetting.findUnique({ where: { key: 'editorial_reel_pending' } });
    const raw = row?.valueJson as { postIds?: string[]; since?: string } | undefined;
    const postIds = raw?.postIds?.filter((x) => typeof x === 'string') ?? [];
    const cfg = await this.reelSettings.getSettings();
    const posts = postIds.length
      ? await this.prisma.post.findMany({
          where: { id: { in: postIds } },
          select: {
            id: true,
            title: true,
            youtubeThumbnailUrl: true,
            youtubeVideoId: true,
          },
        })
      : [];
    return {
      count: postIds.length,
      threshold: cfg.videosPerReel,
      minVideos: cfg.minVideos,
      since: raw?.since ?? null,
      posts,
    };
  }

  @Get('reel/templates')
  listTemplates() {
    return this.prisma.editorialReelTemplate.findMany({
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      include: { musicTrack: { select: { id: true, title: true } } },
    });
  }

  @Post('reel/templates')
  createTemplate(@Body() body: Record<string, unknown>) {
    return this.prisma.editorialReelTemplate.create({
      data: {
        name: String(body.name ?? 'Nová šablona').trim().slice(0, 200),
        introSec: Number(body.introSec) || 2,
        segmentSec: Number(body.segmentSec) || 4,
        outroSec: Number(body.outroSec) || 3,
        videosPerReel: Number(body.videosPerReel) || 5,
        transition: (body.transition as 'FADE' | 'ZOOM' | 'SLIDE' | 'CROSSFADE') ?? 'FADE',
        showLogo: body.showLogo !== false,
        showVideoTitle: body.showVideoTitle !== false,
        showChannelTitle: body.showChannelTitle !== false,
        showCategory: body.showCategory !== false,
        ctaText: String(body.ctaText ?? 'Další videa najdete na XXREALIT.cz'),
        introText: body.introText ? String(body.introText) : null,
        musicTrackId: typeof body.musicTrackId === 'string' ? body.musicTrackId : null,
        isDefault: body.isDefault === true,
      },
    });
  }

  @Post('reel/templates/:id/duplicate')
  async duplicateTemplate(@Param('id') id: string) {
    const src = await this.prisma.editorialReelTemplate.findUnique({ where: { id } });
    if (!src) throw new Error('Šablona nenalezena.');
    const { id: _id, createdAt, updatedAt, ...data } = src;
    return this.prisma.editorialReelTemplate.create({
      data: { ...data, name: `${src.name} (kopie)`, isDefault: false },
    });
  }

  @Post('reel/templates/:id/set-default')
  async setDefaultTemplate(@Param('id') id: string) {
    await this.prisma.editorialReelTemplate.updateMany({ data: { isDefault: false } });
    return this.prisma.editorialReelTemplate.update({
      where: { id },
      data: { isDefault: true },
    });
  }

  @Delete('reel/templates/:id')
  async deleteTemplate(@Param('id') id: string) {
    const tpl = await this.prisma.editorialReelTemplate.findUnique({ where: { id } });
    if (tpl?.isDefault) throw new Error('Výchozí šablonu nelze smazat — nejdříve nastavte jinou jako výchozí.');
    await this.prisma.editorialReelTemplate.delete({ where: { id } });
    return { ok: true };
  }

  @Post('reel/templates/:id/test-render')
  async testRenderTemplate(@Param('id') id: string) {
    const posts = await this.prisma.post.findMany({
      where: { type: 'YOUTUBE_VIDEO', publishedAt: { not: null }, hiddenFromShorts: false },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: { id: true },
    });
    if (posts.length < 2) throw new Error('Pro testovací render jsou potřeba alespoň 2 YouTube videa.');
    const prevAutoPublish = (await this.reelSettings.getSettings()).autoPublish;
    await this.reelSettings.updateSettings({ autoPublish: false });
    try {
      const job = await this.reelJobs.createManualJob({
        postIds: posts.map((p) => p.id),
        title: 'Testovací náhled šablony',
        templateId: id,
      });
      await this.reelJobs.processQueuedJob(job.id);
      return this.reelJobs.getJob(job.id);
    } finally {
      await this.reelSettings.updateSettings({ autoPublish: prevAutoPublish });
    }
  }

  @Patch('reel/templates/:id')
  updateTemplate(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.prisma.editorialReelTemplate.update({ where: { id }, data: body });
  }

  @Get('reel/music')
  listMusic() {
    return this.shortsMusic.listActiveForPicker();
  }
}
