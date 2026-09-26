import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AiPropertyFinderEventName } from '@prisma/client';
import { AiPropertyFinderService } from './ai-property-finder.service';
import { AiPropertyFinderSettingsService } from './ai-property-finder-settings.service';

@Controller('public/ai-property-finder')
export class AiPropertyFinderPublicController {
  constructor(
    private readonly finder: AiPropertyFinderService,
    private readonly settings: AiPropertyFinderSettingsService,
  ) {}

  @Get('config')
  async getConfig() {
    return this.finder.getPublicConfig();
  }

  @Post('session')
  @HttpCode(HttpStatus.CREATED)
  createSession(
    @Body()
    body: {
      visitorId?: string;
      sourcePage?: string;
      seoContext?: {
        intentSlug: string;
        locationSlug: string;
        locationName: string;
        intentLabel: string;
        path: string;
      };
    },
  ) {
    const seoContext = body.seoContext ? this.finder.buildSeoContext(body.seoContext) : null;
    return this.finder.createSession({
      visitorId: body.visitorId,
      sourcePage: body.sourcePage,
      seoContext,
    });
  }

  @Post('search')
  @HttpCode(HttpStatus.OK)
  async search(
    @Body()
    body: {
      sessionId?: string;
      visitorId?: string;
      query: string;
      seoContext?: {
        intentSlug: string;
        locationSlug: string;
        locationName: string;
        intentLabel: string;
        path: string;
      };
    },
  ) {
    const seoContext = body.seoContext ? this.finder.buildSeoContext(body.seoContext) : null;
    return this.finder.search({
      sessionId: body.sessionId,
      visitorId: body.visitorId,
      query: body.query,
      seoContext,
    });
  }

  @Post('refine')
  refine(
    @Body()
    body: {
      sessionId: string;
      message: string;
      seoContext?: {
        intentSlug: string;
        locationSlug: string;
        locationName: string;
        intentLabel: string;
        path: string;
      };
    },
  ) {
    const seoContext = body.seoContext ? this.finder.buildSeoContext(body.seoContext) : null;
    return this.finder.refine({
      sessionId: body.sessionId,
      message: body.message,
      seoContext,
    });
  }

  @Post('watch')
  @HttpCode(HttpStatus.CREATED)
  createWatch(
    @Body()
    body: {
      email: string;
      consent: boolean;
      sessionId?: string;
      criteria: Record<string, unknown>;
    },
  ) {
    return this.finder.createWatch({
      email: body.email,
      consent: body.consent,
      sessionId: body.sessionId,
      criteria: body.criteria as never,
    });
  }

  @Post('event')
  @HttpCode(HttpStatus.ACCEPTED)
  trackEvent(
    @Body()
    body: {
      eventName: AiPropertyFinderEventName;
      visitorId?: string;
      sessionId?: string;
      meta?: Record<string, unknown>;
    },
  ) {
    return this.finder.trackEvent(body);
  }
}
