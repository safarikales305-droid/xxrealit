import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../admin/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateAnalyticsSettingsDto } from './dto/track-pageview.dto';
import { PortalAnalyticsAdminService } from './portal-analytics-admin.service';

@Controller('admin/analytics')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AnalyticsAdminController {
  constructor(private readonly admin: PortalAnalyticsAdminService) {}

  @Get('realtime')
  getRealtime() {
    return this.admin.getRealtime();
  }

  @Get('summary')
  getSummary(
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.admin.getSummary({ period, from, to });
  }

  @Get('sessions')
  getSessions(
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('path') path?: string,
    @Query('country') country?: string,
    @Query('city') city?: string,
    @Query('referrer') referrer?: string,
    @Query('loggedIn') loggedIn?: string,
    @Query('deviceType') deviceType?: string,
    @Query('limit') limit?: string,
  ) {
    return this.admin.getSessions({
      period,
      from,
      to,
      path,
      country,
      city,
      referrer,
      loggedIn,
      deviceType,
      limit,
    });
  }

  @Get('sessions/:id')
  getSessionDetail(@Param('id') id: string) {
    return this.admin.getSessionDetail(id);
  }

  @Get('visitors')
  getVisitors(
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('path') path?: string,
    @Query('country') country?: string,
    @Query('city') city?: string,
    @Query('referrer') referrer?: string,
    @Query('loggedIn') loggedIn?: string,
    @Query('deviceType') deviceType?: string,
  ) {
    return this.admin.getVisitors({
      period,
      from,
      to,
      path,
      country,
      city,
      referrer,
      loggedIn,
      deviceType,
    });
  }

  @Get('locations')
  getLocations(
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.admin.getLocations({ period, from, to });
  }

  @Get('settings')
  getSettings() {
    return this.admin.getSettings();
  }

  @Patch('settings')
  updateSettings(@Body() dto: UpdateAnalyticsSettingsDto) {
    return this.admin.updateSettings(dto);
  }
}
