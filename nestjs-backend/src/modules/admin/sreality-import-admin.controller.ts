import {
  Body,
  Controller,
  Get,
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
    private readonly aiJobs: AiInfluencerJobService,
  ) {}

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
