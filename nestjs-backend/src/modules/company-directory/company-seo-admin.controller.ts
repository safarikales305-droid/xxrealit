import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/guards/admin.guard';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator';
import { CompanySeoGenerationJobType } from '@prisma/client';
import { CompanySeoPageService } from './company-seo-page.service';
import { CompanySeoGenerationJobService } from './company-seo-generation-job.service';
import type { CompanySeoGenerationFilters } from './company-seo-page.types';

@Controller('admin/seo/companies')
@UseGuards(JwtAuthGuard, AdminGuard)
export class CompanySeoAdminController {
  constructor(
    private readonly seoPages: CompanySeoPageService,
    private readonly jobs: CompanySeoGenerationJobService,
  ) {}

  @Get('stats')
  stats() {
    return this.jobs.getStats();
  }

  @Get('progress')
  progress() {
    return this.jobs.getProgress();
  }

  @Get('jobs')
  listJobs(@Query('limit') limit?: string) {
    return this.jobs.listJobs(limit ? Number(limit) : 20);
  }

  @Get('jobs/:jobId/items')
  jobItems(@Param('jobId') jobId: string) {
    return this.jobs.getJobItems(jobId);
  }

  @Get('pages')
  listPages(@Query() query: Record<string, string | undefined>) {
    return this.seoPages.listAdmin(query);
  }

  @Get('pages/by-company/:companyId')
  byCompany(@Param('companyId') companyId: string) {
    return this.seoPages.getByCompanyId(companyId);
  }

  @Get('pages/:id/preview')
  preview(@Param('id') id: string) {
    return this.seoPages.getPreview(id);
  }

  @Post('regenerate/dry-run')
  regenerateDryRun(@Body() body: { filters?: CompanySeoGenerationFilters }) {
    return this.jobs.dryRun(body.filters);
  }

  @Post('regenerate')
  regenerate(
    @CurrentUser() admin: AuthUser,
    @Body()
    body: {
      filters?: CompanySeoGenerationFilters;
      dryRun?: boolean;
      confirmAll?: boolean;
    },
  ) {
    const scope = body.filters?.scope ?? 'all';
    if (scope === 'all' && !body.confirmAll && !body.dryRun) {
      return {
        error: 'CONFIRMATION_REQUIRED',
        message:
          'Bude zkontrolováno a případně přegenerováno SEO všech firem. Firemní data, recenze, claimy a ověřené kontakty nebudou odstraněny.',
      };
    }
    return this.jobs.startJob({
      type: CompanySeoGenerationJobType.BULK_ALL,
      filters: body.filters,
      createdById: admin.id,
      dryRun: body.dryRun,
    });
  }

  @Post('generate-test')
  generateTest(@CurrentUser() admin: AuthUser) {
    return this.jobs.startJob({
      type: CompanySeoGenerationJobType.TEST,
      createdById: admin.id,
      forceUpdate: false,
    });
  }

  @Post('generate-batch')
  generateBatch(
    @CurrentUser() admin: AuthUser,
    @Body() body: { count?: 10 | 100; filters?: CompanySeoGenerationFilters; forceUpdate?: boolean },
  ) {
    const count = body.count === 100 ? 100 : 10;
    return this.jobs.startJob({
      type: count === 100 ? CompanySeoGenerationJobType.BATCH_100 : CompanySeoGenerationJobType.BATCH_10,
      filters: body.filters,
      createdById: admin.id,
      forceUpdate: body.forceUpdate,
    });
  }

  @Post('generate-filter')
  generateFilter(
    @CurrentUser() admin: AuthUser,
    @Body() body: { filters?: CompanySeoGenerationFilters; forceUpdate?: boolean },
  ) {
    return this.jobs.startJob({
      type: CompanySeoGenerationJobType.FILTER,
      filters: body.filters,
      createdById: admin.id,
      forceUpdate: body.forceUpdate,
    });
  }

  @Post('companies/:companyId/generate')
  async generateOne(
    @Param('companyId') companyId: string,
    @Body() body?: { forceUpdate?: boolean },
  ) {
    const existing = await this.seoPages.getByCompanyId(companyId);
    const result = await this.seoPages.generateForCompany(companyId, {
      forceUpdate: body?.forceUpdate ?? Boolean(existing),
    });
    return { existing, result };
  }

  @Post('jobs/pause')
  pause() {
    return this.jobs.pauseJob();
  }

  @Post('jobs/resume')
  resume() {
    return this.jobs.resumeJob();
  }

  @Post('jobs/cancel')
  cancel() {
    return this.jobs.cancelJob();
  }

  @Post('jobs/recover')
  recover(@Body() body?: { jobId?: string }) {
    return this.jobs.recoverStaleJob(body?.jobId);
  }

  @Post('companies/:companyId/seo/evaluate')
  evaluate(@Param('companyId') companyId: string) {
    return this.seoPages.generateForCompany(companyId, { forceUpdate: true });
  }
}
