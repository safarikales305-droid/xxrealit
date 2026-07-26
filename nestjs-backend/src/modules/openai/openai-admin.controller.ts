import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
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
  constructor(
    private readonly openai: OpenAiService,
    private readonly settings: OpenAiSettingsService,
    private readonly seoAi: OpenAiSeoService,
  ) {}

  @Get('status')
  getStatus() {
    return this.openai.getStatus();
  }

  @Get('settings')
  getSettings() {
    return this.openai.getSettingsView();
  }

  @Patch('settings')
  updateSettings(@Body() body: UpdateAiSettingsDto) {
    return this.settings.update(body);
  }

  @Post('test')
  testConnection(@Req() req: { user?: { id?: string; sub?: string } }) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.openai.testConnection(userId);
  }

  @Get('usage')
  getUsage() {
    return this.openai.getUsageSummary();
  }
}

@Controller('admin/ai/seo')
@UseGuards(JwtAuthGuard, AdminGuard)
export class OpenAiSeoAdminController {
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
