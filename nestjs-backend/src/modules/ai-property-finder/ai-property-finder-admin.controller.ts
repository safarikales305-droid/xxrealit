import { Body, Controller, Get, Patch, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../admin/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../../database/prisma.service';
import { AiPropertyFinderService } from './ai-property-finder.service';
import { AiPropertyFinderSettingsService } from './ai-property-finder-settings.service';

@Controller('admin/ai-property-finder')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AiPropertyFinderAdminController {
  constructor(
    private readonly finder: AiPropertyFinderService,
    private readonly settings: AiPropertyFinderSettingsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('stats')
  getStats(@Query('days') days?: string) {
    const d = Number.parseInt(days ?? '30', 10);
    return this.finder.getAdminStats(Number.isFinite(d) ? d : 30);
  }

  @Get('providers')
  getProviders() {
    return { providers: this.finder.getProviderStatuses() };
  }

  @Get('settings')
  getSettings() {
    return this.settings.getSettings();
  }

  @Patch('settings')
  updateSettings(@Body() body: Record<string, unknown>) {
    return this.settings.updateSettings(body as never);
  }

  @Get('sessions')
  async listSessions(@Query('limit') limit?: string) {
    const take = Math.min(100, Math.max(1, Number.parseInt(limit ?? '40', 10) || 40));
    const rows = await this.prisma.aiPropertySearchSession.findMany({
      orderBy: { createdAt: 'desc' },
      take,
    });
    return { items: rows };
  }

  @Get('watches')
  async listWatches(@Query('limit') limit?: string) {
    const take = Math.min(100, Math.max(1, Number.parseInt(limit ?? '40', 10) || 40));
    const rows = await this.prisma.aiPropertySearchWatch.findMany({
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        email: true,
        consent: true,
        notificationEnabled: true,
        createdAt: true,
        criteriaJson: true,
      },
    });
    return { items: rows };
  }
}
