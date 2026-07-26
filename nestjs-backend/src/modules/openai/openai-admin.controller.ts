import { Body, Controller, Get, Logger, Param, Patch, Post, Put, Req, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../admin/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateAiSettingsDto } from './dto/update-ai-settings.dto';
import { SeoAiApplyDto, SeoAiRejectDto } from './dto/seo-ai.dto';
import { OpenAiSeoService } from './openai-seo.service';
import { OpenAiService } from './openai.service';
import { OpenAiSettingsService } from './openai-settings.service';

@Controller('admin/ai/openai')
@UseGuards(JwtAuthGuard, AdminGuard)
export class OpenAiAdminController {
  private readonly log = new Logger(OpenAiAdminController.name);

  constructor(
    private readonly openai: OpenAiService,
    private readonly settings: OpenAiSettingsService,
  ) {}

  @Get('status')
  async getStatus() {
    const started = Date.now();
    const status = await this.openai.getStatus();
    this.log.log(`GET /admin/ai/openai/status → 200 (${Date.now() - started}ms)`);
    return status;
  }

  @Get('settings')
  async getSettings() {
    const started = Date.now();
    const data = await this.openai.getSettingsView();
    this.log.log(`GET /admin/ai/openai/settings → 200 (${Date.now() - started}ms)`);
    return data;
  }

  @Patch('settings')
  @Put('settings')
  updateSettings(@Body() body: UpdateAiSettingsDto) {
    this.log.log('PUT/PATCH /admin/ai/openai/settings');
    return this.settings.update(body);
  }

  @Post('test')
  async testConnection(@Req() req: { user?: { id?: string; sub?: string } }) {
    const started = Date.now();
    const userId = req.user?.id ?? req.user?.sub;
    const result = await this.openai.testConnection(userId);
    this.log.log(
      `POST /admin/ai/openai/test → success=${result.success} code=${result.code ?? 'ok'} (${Date.now() - started}ms)`,
    );
    return result;
  }

  @Get('usage')
  getUsage() {
    return this.openai.getUsageSummary();
  }
}

@Controller('admin/ai/seo')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AiSeoAdminController {
  constructor(private readonly seoAi: OpenAiSeoService) {}

  @Post('improve/:contentId')
  improve(
    @Param('contentId') contentId: string,
    @Req() req: { user?: { id?: string; sub?: string } },
  ) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.seoAi.improveSeoContent(contentId, userId);
  }

  @Post('apply')
  apply(@Body() body: SeoAiApplyDto, @Req() req: { user?: { id?: string; sub?: string } }) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.seoAi.applyGeneration(body.generationId, userId);
  }

  @Post('reject')
  reject(@Body() body: SeoAiRejectDto) {
    return this.seoAi.rejectGeneration(body.generationId);
  }

  @Get('generation/:generationId')
  getGeneration(@Param('generationId') generationId: string) {
    return this.seoAi.getGeneration(generationId);
  }
}
