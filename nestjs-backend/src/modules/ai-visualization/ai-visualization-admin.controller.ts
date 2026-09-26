import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../admin/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AiVisualizationService } from './ai-visualization.service';
import { AiVisualizationSettingsService } from './ai-visualization-settings.service';
import { DEFAULT_AI_VISUALIZATION_SETTINGS } from './ai-visualization.types';

@Controller('admin/ai-visualization')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AiVisualizationAdminController {
  constructor(
    private readonly viz: AiVisualizationService,
    private readonly settings: AiVisualizationSettingsService,
  ) {}

  @Get('stats')
  getStats() {
    return this.viz.getAdminStats(30);
  }

  @Get('stats/today')
  async getToday() {
    const all = await this.viz.getAdminStats(1);
    return all;
  }

  @Get('settings')
  getSettings() {
    return this.settings.getSettings();
  }

  @Patch('settings')
  updateSettings(@Body() body: Partial<typeof DEFAULT_AI_VISUALIZATION_SETTINGS>) {
    return this.settings.updateSettings(body);
  }
}
