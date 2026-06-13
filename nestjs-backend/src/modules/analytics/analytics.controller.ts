import { Body, Controller, Post } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Post('visit')
  trackVisit() {
    return this.analytics.trackVisit();
  }

  @Post('facebook-event')
  trackFacebookEvent(@Body() body: { event?: string; meta?: Record<string, unknown> }) {
    return this.analytics.trackFacebookEvent(body?.event ?? 'unknown', body?.meta);
  }
}
