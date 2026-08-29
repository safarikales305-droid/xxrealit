import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/guards/admin.guard';
import { ShortsFeedSettingsService } from './shorts-feed-settings.service';
import type { ShortsFeedSettings } from './shorts-feed-settings.types';

@Controller('admin/shorts-feed')
@UseGuards(JwtAuthGuard, AdminGuard)
export class ShortsFeedAdminController {
  constructor(private readonly settings: ShortsFeedSettingsService) {}

  @Get('settings')
  getSettings(): Promise<ShortsFeedSettings> {
    return this.settings.getSettings();
  }

  @Patch('settings')
  updateSettings(@Body() body: Partial<ShortsFeedSettings>): Promise<ShortsFeedSettings> {
    return this.settings.updateSettings(body);
  }
}
