import { Body, Controller, Get, HttpCode, HttpStatus, Ip, Param, Post } from '@nestjs/common';
import { AiPropertyFinderEventName } from '@prisma/client';
import { AiPropertyFinderService } from './ai-property-finder.service';
import { AiPropertyFinderSettingsService } from './ai-property-finder-settings.service';

@Controller('public/ai-property-finder')
export class AiPropertyFinderPublicController {
  constructor(
    private readonly finder: AiPropertyFinderService,
    private readonly settings: AiPropertyFinderSettingsService,
  ) {}

  private clientKey(ip: string, visitorId?: string): string {
    return `${ip}:${visitorId ?? 'anon'}`.slice(0, 120);
  }

  @Get('config')
  async getConfig() {
    return this.finder.getPublicConfig();
  }

  @Get('session/:sessionId')
  getSession(@Param('sessionId') sessionId: string) {
    return this.finder.getSessionPublic(sessionId);
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

  @Post('parse-query')
  @HttpCode(HttpStatus.OK)
  parseQuery(
    @Body()
    body: {
      query: string;
      sessionId?: string;
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
    return this.finder.parseQueryOnly({ query: body.query, seoContext });
  }

  @Post('capture-lead')
  @HttpCode(HttpStatus.OK)
  captureLead(
    @Ip() ip: string,
    @Body()
    body: {
      sessionId: string;
      email: string;
      query: string;
      marketingConsent?: boolean;
      visitorId?: string;
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
    return this.finder.captureLead({
      sessionId: body.sessionId,
      email: body.email,
      query: body.query,
      marketingConsent: body.marketingConsent,
      visitorId: body.visitorId,
      seoContext,
      clientKey: this.clientKey(ip, body.visitorId),
    });
  }

  @Post('search')
  @HttpCode(HttpStatus.OK)
  async search(
    @Ip() ip: string,
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
      clientKey: this.clientKey(ip, body.visitorId),
    });
  }

  @Get('result/:sessionId/:resultId')
  getResult(@Param('sessionId') sessionId: string, @Param('resultId') resultId: string) {
    return this.finder.getResultDetail(sessionId, decodeURIComponent(resultId));
  }

  @Post('refine')
  refine(
    @Ip() ip: string,
    @Body()
    body: {
      sessionId: string;
      message: string;
      visitorId?: string;
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
      clientKey: this.clientKey(ip, body.visitorId),
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
