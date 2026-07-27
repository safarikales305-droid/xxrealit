import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../admin/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { SeoAiGenerateInput } from './seo-ai-layout.types';
import { SeoAiGenerationJobService, type SeoAiJobSettings } from './seo-ai-generation-job.service';
import { SeoAiGenerationService } from './seo-ai-generation.service';
import { SeoAiPromptSeedService } from './seo-ai-prompt.seed.service';

@Controller('admin/seo/ai')
@UseGuards(JwtAuthGuard, AdminGuard)
export class SeoAiAdminController {
  constructor(
    private readonly generation: SeoAiGenerationService,
    private readonly jobs: SeoAiGenerationJobService,
    private readonly promptSeed: SeoAiPromptSeedService,
  ) {}

  private userId(req: { user?: { id?: string; sub?: string } }) {
    return req.user?.id ?? req.user?.sub;
  }

  @Post('generate-test')
  generateTest(@Body() body: SeoAiGenerateInput, @Req() req: { user?: { id?: string; sub?: string } }) {
    return this.generation.generateTestPage(body, this.userId(req));
  }

  @Post('jobs/estimate')
  estimateJob(@Body() body: SeoAiJobSettings) {
    return this.jobs.estimateJob(body);
  }

  @Post('jobs')
  createJob(@Body() body: SeoAiJobSettings, @Req() req: { user?: { id?: string; sub?: string } }) {
    return this.jobs.createJob(body, this.userId(req));
  }

  @Get('jobs')
  listJobs() {
    return this.jobs.listJobs();
  }

  @Get('jobs/active')
  getActiveJob() {
    return this.jobs.getActiveJob();
  }

  @Get('jobs/:id')
  getJob(@Param('id') id: string) {
    return this.jobs.getJob(id);
  }

  @Post('jobs/:id/pause')
  pauseJob(@Param('id') id: string) {
    return this.jobs.pauseJob(id);
  }

  @Post('jobs/:id/resume')
  resumeJob(@Param('id') id: string) {
    return this.jobs.resumeJob(id);
  }

  @Post('jobs/:id/cancel')
  cancelJob(@Param('id') id: string) {
    return this.jobs.cancelJob(id);
  }

  @Get('pages/:id/preview')
  getPreview(@Param('id') id: string) {
    return this.generation.getAiPreview(id);
  }

  @Post('pages/:id/regenerate')
  regeneratePage(@Param('id') id: string, @Req() req: { user?: { id?: string; sub?: string } }) {
    return this.generation.regeneratePage(id, this.userId(req));
  }

  @Post('seed-prompts')
  seedPrompts() {
    return this.promptSeed.seedPromptsIfMissing();
  }
}
