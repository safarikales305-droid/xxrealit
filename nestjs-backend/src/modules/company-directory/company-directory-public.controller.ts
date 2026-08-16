import { Body, Controller, Get, HttpCode, Logger, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator';
import { CompanyDirectoryService } from './company-directory.service';
import { CompanyClaimService } from './company-claim.service';
import { CompanyReviewService } from './company-review.service';
import { CompanyEngagementFacadeService, CompanyLeadService } from './company-lead.service';
import { CompanyEngagementCampaignService } from './company-engagement-campaign.service';
import { PublicProfileDirectoryService } from './public-profile-directory.service';
import { CompanyImportService } from './company-import.service';
import { COMPANY_REVIEWS_ENABLED } from './company-directory.constants';
import { CompanyEngagementEventType } from '@prisma/client';
import type { Request } from 'express';

@Controller('company-directory')
export class CompanyDirectoryPublicController {
  private readonly log = new Logger(CompanyDirectoryPublicController.name);

  constructor(
    private readonly directory: CompanyDirectoryService,
    private readonly claims: CompanyClaimService,
    private readonly reviews: CompanyReviewService,
    private readonly engagement: CompanyEngagementFacadeService,
    private readonly leads: CompanyLeadService,
    private readonly campaigns: CompanyEngagementCampaignService,
    private readonly profileDirectory: PublicProfileDirectoryService,
    private readonly importService: CompanyImportService,
  ) {}

  @Get('public/directory')
  listProfileDirectory(@Query() query: Record<string, string | undefined>) {
    return this.profileDirectory.list(query);
  }

  @Get('public/directory/stats')
  profileDirectoryStats() {
    return this.profileDirectory.getStats();
  }

  @Get('public')
  list(@Query() query: Record<string, string | undefined>) {
    return this.directory.listPublic(query);
  }

  @Get('public/featured')
  featured(@Query('category') category?: string, @Query('limit') limit?: string) {
    return this.directory.getFeaturedProfiles({
      category,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('public/companies/search')
  searchCompaniesForReview(@Query('q') q?: string, @Query('limit') limit?: string) {
    return this.directory.searchForReview(q ?? '', limit ? Number(limit) : 10);
  }

  @Post('public/companies/ares-search')
  searchAresCompanies(@Body() body: { q: string; limit?: number }) {
    return this.directory.searchAresForReview(body.q ?? '', body.limit ?? 15);
  }

  @Post('public/companies/from-ares')
  importCompanyFromAres(@Body() body: { ico: string; category?: string }) {
    return this.importService.upsertPublicFromAres(
      body.ico,
      body.category as import('@prisma/client').CompanyDirectoryCategory | undefined,
    );
  }

  @Get('public/:slug')
  async detail(@Param('slug') slug: string, @Req() req: Request) {
    const data = await this.directory.getPublicBySlug(slug);
    if (data?.company?.id) {
      const sessionId =
        typeof req.headers['x-session-id'] === 'string'
          ? req.headers['x-session-id']
          : undefined;
      await this.engagement.trackPublicEvent({
        companyId: data.company.id,
        type: CompanyEngagementEventType.PROFILE_VIEW,
        sessionId,
      });
    }
    return data;
  }

  @Post('public/events')
  trackEvent(
    @Body()
    body: {
      companyId: string;
      type: CompanyEngagementEventType;
      sessionId?: string;
      userId?: string;
    },
  ) {
    return this.engagement.trackPublicEvent({
      companyId: body.companyId,
      type: body.type,
      userId: body.userId,
      sessionId: body.sessionId,
    });
  }

  @Post('public/leads')
  createLead(
    @Body()
    body: {
      companyId: string;
      name: string;
      email: string;
      phone?: string;
      message?: string;
      consent: boolean;
      userId?: string;
    },
  ) {
    return this.leads.createLead({
      ...body,
      userId: body.userId,
    });
  }

  @Post('public/unsubscribe')
  unsubscribe(@Body() body: { token: string }) {
    return this.campaigns.processOptOut(body.token);
  }

  @Post('public/claim')
  claim(
    @Body()
    body: {
      companyId?: string;
      slug?: string;
      ico: string;
      contactName: string;
      contactEmail: string;
      contactPhone?: string;
    },
  ) {
    return this.claims.submitClaim(body);
  }

  @Post('public/report')
  report(
    @Body()
    body: {
      companyId: string;
      reason: string;
      reporterUserId?: string;
    },
  ) {
    return this.directory.createProfileReport(body);
  }

  @Get('public/:slug/reviews')
  listReviews(@Param('slug') slug: string) {
    return this.directory.getPublicReviewsBySlug(slug);
  }

  @Post('public/reviews')
  @HttpCode(201)
  createReview(
    @Body()
    body: {
      companyId?: string;
      companySlug?: string;
      rating: number;
      sentiment?: string;
      title?: string;
      body: string;
      authorEmail: string;
      authorDisplayName?: string;
      authorPhone?: string;
      submittedBusinessEmail?: string;
      confirmedExperience: boolean;
      media?: Array<{ type: 'IMAGE' | 'VIDEO'; url: string; thumbnailUrl?: string; mimeType?: string }>;
    },
  ) {
    if (!COMPANY_REVIEWS_ENABLED) {
      return { error: 'Recenze jsou vypnuté.' };
    }
    this.log.log(
      JSON.stringify({
        event: 'PUBLIC_REVIEW_POST',
        route: 'POST /company-directory/public/reviews',
        companyId: body.companyId ?? null,
        companySlug: body.companySlug ?? null,
        rating: body.rating,
        hasMedia: (body.media?.length ?? 0) > 0,
        mediaCount: body.media?.length ?? 0,
      }),
    );
    return this.reviews.createReview(body);
  }

  @Post('public/reviews/verify')
  verifyReview(@Body() body: { token: string }) {
    return this.reviews.verifyReviewEmail(body.token);
  }

  @UseGuards(JwtAuthGuard)
  @Post('public/reviews/:id/response')
  respondToReview(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() body: { body: string },
  ) {
    return this.reviews.submitCompanyResponse({
      reviewId: id,
      userId: user.id,
      body: body.body,
    });
  }
}
