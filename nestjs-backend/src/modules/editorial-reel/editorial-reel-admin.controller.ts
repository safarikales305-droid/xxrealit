import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AdminGuard } from '../admin/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PropertyMediaCloudinaryService } from '../properties/property-media-cloudinary.service';
import { ContentSourceCategoryService } from './content-source-category.service';
import { EditorialCenterDashboardService } from './editorial-center-dashboard.service';
import { EditorialReelJobService } from './editorial-reel-job.service';
import { EditorialReelSettingsService } from './editorial-reel-settings.service';
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
    private readonly cloudinary: PropertyMediaCloudinaryService,
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
    return this.reelJobs.processQueuedJob(id);
  }

  @Post('reel/jobs/:id/publish')
  publishReelJob(@Param('id') id: string) {
    return this.reelJobs.publishJob(id);
  }

  @Get('reel/templates')
  listTemplates() {
    return this.prisma.editorialReelTemplate.findMany({ orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] });
  }

  @Patch('reel/templates/:id')
  updateTemplate(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.prisma.editorialReelTemplate.update({ where: { id }, data: body });
  }

  @Get('reel/music')
  listMusic() {
    return this.prisma.editorialReelMusicTrack.findMany({ orderBy: [{ isDefault: 'desc' }, { title: 'asc' }] });
  }

  @Post('reel/music')
  @UseInterceptors(FileInterceptor('file'))
  async uploadMusic(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { title?: string; isDefault?: string },
  ) {
    if (!file?.buffer?.length) throw new Error('Soubor hudby chybí.');
    const { url } = await this.cloudinary.uploadShortsMusicBuffer(
      file.buffer,
      file.originalname || 'reel-music.mp3',
      file.mimetype || 'audio/mpeg',
    );
    if (body.isDefault === 'true') {
      await this.prisma.editorialReelMusicTrack.updateMany({ data: { isDefault: false } });
    }
    return this.prisma.editorialReelMusicTrack.create({
      data: {
        title: (body.title ?? file.originalname ?? 'Skladba').trim().slice(0, 200),
        fileKey: url,
        active: true,
        isDefault: body.isDefault === 'true',
      },
    });
  }

  @Delete('reel/music/:id')
  async deleteMusic(@Param('id') id: string) {
    await this.prisma.editorialReelMusicTrack.delete({ where: { id } });
    return { ok: true };
  }
}
