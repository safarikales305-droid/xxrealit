import { Body, Controller, Post, Req, ValidationPipe } from '@nestjs/common';
import type { Request } from 'express';
import { AnalyticsService } from './analytics.service';
import { TrackPageviewDto } from './dto/track-pageview.dto';
import { PortalAnalyticsTrackingService } from './portal-analytics-tracking.service';

@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly portalTracking: PortalAnalyticsTrackingService,
  ) {}

  @Post('visit')
  trackVisit() {
    return this.analytics.trackVisit();
  }

  @Post('pageview')
  trackPageview(
    @Body(new ValidationPipe({ whitelist: true, transform: true })) dto: TrackPageviewDto,
    @Req() req: Request,
  ) {
    return this.portalTracking.recordPageview(dto, {
      userAgent: req.headers['user-agent'],
      headers: req.headers as Record<string, string | string[] | undefined>,
    });
  }

  @Post('facebook-event')
  trackFacebookEvent(@Body() body: { event?: string; meta?: Record<string, unknown> }) {
    return this.analytics.trackFacebookEvent(body?.event ?? 'unknown', body?.meta);
  }
}
