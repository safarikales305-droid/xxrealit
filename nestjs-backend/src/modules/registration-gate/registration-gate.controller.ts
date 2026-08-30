import { Body, Controller, Get, Post, Query, Req, ValidationPipe } from '@nestjs/common';
import type { Request } from 'express';
import { RegistrationGateService } from './registration-gate.service';
import { ShortsSignupAnalyticsService } from './shorts-signup-analytics.service';
import { TrackShortsSignupEventDto } from './dto/shorts-signup.dto';

@Controller('registration-gate')
export class RegistrationGateController {
  constructor(
    private readonly registrationGate: RegistrationGateService,
    private readonly shortsSignupAnalytics: ShortsSignupAnalyticsService,
  ) {}

  @Get('settings')
  getPublicSettings() {
    return this.registrationGate.getPublicSettings();
  }

  @Get('email-signup-settings')
  getEmailSignupSettings() {
    return this.registrationGate.getEmailSignupPublicSettings();
  }

  @Post('shorts-signup/event')
  trackEvent(
    @Body(new ValidationPipe({ whitelist: true, transform: true })) dto: TrackShortsSignupEventDto,
    @Req() req: Request,
  ) {
    const ua = req.headers['user-agent'] ?? '';
    if (typeof ua === 'string' && /bot|crawl|spider|slurp|facebookexternalhit/i.test(ua)) {
      return { ok: true, skipped: true };
    }
    return this.shortsSignupAnalytics.track(dto);
  }
}
