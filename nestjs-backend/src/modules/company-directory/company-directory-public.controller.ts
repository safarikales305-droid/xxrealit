import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator';
import { CompanyDirectoryService } from './company-directory.service';
import { CompanyClaimService } from './company-claim.service';
import { CompanyReviewService } from './company-review.service';
import { COMPANY_REVIEWS_ENABLED } from './company-directory.constants';

@Controller('company-directory')
export class CompanyDirectoryPublicController {
  constructor(
    private readonly directory: CompanyDirectoryService,
    private readonly claims: CompanyClaimService,
    private readonly reviews: CompanyReviewService,
  ) {}

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

  @Get('public/:slug')
  detail(@Param('slug') slug: string) {
    return this.directory.getPublicBySlug(slug);
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
