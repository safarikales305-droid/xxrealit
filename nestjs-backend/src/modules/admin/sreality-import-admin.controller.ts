import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from './guards/admin.guard';
import { SrealityImportService } from '../properties/sreality-import.service';
import { SrealityImportJobService } from '../properties/sreality-import-job.service';
import {
  SrealityImportPreviewDto,
  SrealityImportPublishDto,
  SrealityImportRefreshDto,
} from './dto/sreality-import.dto';
import { AiInfluencerJobService } from '../ai-influencer/ai-influencer-job.service';

@Controller('admin/sreality-import')
@UseGuards(JwtAuthGuard, AdminGuard)
export class SrealityImportAdminController {
  constructor(
    private readonly srealityImport: SrealityImportService,
    private readonly srealityJobs: SrealityImportJobService,
    private readonly aiJobs: AiInfluencerJobService,
  ) {}

  @Post('jobs')
  @HttpCode(HttpStatus.ACCEPTED)
  createJob(
    @CurrentUser() user: AuthUser,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: SrealityImportPreviewDto,
  ) {
    return this.srealityJobs.createJob(user.id, dto.sourceUrl);
  }

  @Get('jobs/active')
  getActiveJob(@CurrentUser() user: AuthUser) {
    return this.srealityJobs.getActiveJob(user.id);
  }

  @Get('jobs')
  listJobs(@CurrentUser() user: AuthUser) {
    return this.srealityJobs.listJobs(user.id);
  }

  @Get('jobs/:id')
  getJob(@Param('id') id: string) {
    return this.srealityJobs.getJob(id);
  }

  @Get('jobs/:id/preview')
  async getJobPreview(@Param('id') id: string) {
    const job = await this.srealityJobs.getJob(id);
    if (!job.draftId) return { preview: null };
    const preview = await this.srealityImport.getPreviewFromDraft(job.draftId);
    return { preview, job };
  }

  @Post('jobs/:id/cancel')
  cancelJob(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.srealityJobs.cancelJob(id, user.id);
  }

  @Post('jobs/:id/retry')
  retryJob(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body?: { fromStage?: string },
  ) {
    return this.srealityJobs.retryJob(id, user.id, body?.fromStage);
  }

  @Delete('jobs/:id')
  deleteJob(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.srealityJobs.deleteJob(id, user.id);
  }

  /** @deprecated Sync preview — prefer POST /jobs */
  @Post('preview')
  preview(
    @CurrentUser() user: AuthUser,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: SrealityImportPreviewDto,
  ) {
    return this.srealityImport.createImportPreview(user.id, dto.sourceUrl);
  }

  @Get('draft/:id')
  getDraft(@Param('id') id: string) {
    return this.srealityImport.getDraft(id);
  }

  @Patch('draft/:id')
  updateDraft(
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: SrealityImportPublishDto,
  ) {
    return this.srealityImport.updateDraft(id, dto);
  }

  @Post('draft/:id/publish')
  async publish(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: SrealityImportPublishDto,
  ) {
    const result = await this.srealityImport.publishDraft(user.id, id, dto);
    let aiReelJobId: string | null = null;
    if (result.createAiReel) {
      const job = await this.aiJobs.createJobFromProperty(result.propertyId, {
        publishFacebook: dto.settings?.publishFacebook,
        publishInstagram: dto.settings?.publishInstagram,
        publishYoutube: dto.settings?.publishYoutube,
        publishPortal: dto.settings?.publishShorts,
      });
      aiReelJobId = job.id;
    }
    return { ...result, aiReelJobId };
  }

  @Post('browser-test')
  browserTest() {
    return this.srealityImport.runBrowserHealthCheck();
  }

  @Post('test-first-image')
  testFirstImage(@Body() body: { sourceUrl?: string; imageUrl?: string }) {
    if (!body?.sourceUrl?.trim()) {
      throw new BadRequestException('Chybí sourceUrl.');
    }
    return this.srealityImport.testFirstGalleryImage(body.sourceUrl.trim(), body.imageUrl?.trim());
  }

  @Post('refresh-diff')
  refreshDiff(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: SrealityImportRefreshDto,
  ) {
    return this.srealityImport.compareRefresh(dto.propertyId, dto.sourceUrl);
  }

  @Post('property/:id/mark-unavailable')
  markUnavailable(@Param('id') id: string) {
    return this.srealityImport.markSourceUnavailable(id);
  }
}
