import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../admin/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AiVisualizationService } from './ai-visualization.service';
import { AiVisualizationSettingsService } from './ai-visualization-settings.service';
import { DEFAULT_AI_VISUALIZATION_SETTINGS } from './ai-visualization.types';

import { AiRenovationService } from './ai-renovation.service';
import { AiVisualizationMarketingService } from './ai-visualization-marketing.service';

@Controller('admin/ai-visualization')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AiVisualizationAdminController {
  constructor(
    private readonly viz: AiVisualizationService,
    private readonly settings: AiVisualizationSettingsService,
    private readonly renovation: AiRenovationService,
    private readonly marketing: AiVisualizationMarketingService,
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

  @Get('renovation-requests')
  listRenovationRequests() {
    return this.renovation.listAdminRequests(100);
  }

  @Get('marketing-reels')
  listMarketingReels() {
    return this.marketing.listAdmin(100);
  }

  @Get('marketing-reels/stats')
  marketingReelStats() {
    return this.marketing.adminStats();
  }

  @Post('marketing-reels/:id/action')
  marketingReelAction(@Param('id') id: string, @Body('action') action: 'publish_now' | 'retry' | 'skip') {
    return this.marketing.adminAction(id, action);
  }
}
