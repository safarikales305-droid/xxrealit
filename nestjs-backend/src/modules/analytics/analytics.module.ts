import { Module } from '@nestjs/common';
import { AnalyticsAdminController } from './analytics-admin.controller';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { PortalAnalyticsAdminService } from './portal-analytics-admin.service';
import { PortalAnalyticsTrackingService } from './portal-analytics-tracking.service';

@Module({
  controllers: [AnalyticsController, AnalyticsAdminController],
  providers: [AnalyticsService, PortalAnalyticsTrackingService, PortalAnalyticsAdminService],
})
export class AnalyticsModule {}
