import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CompanyDirectoryService } from './company-directory.service';
import { CompanyClaimService } from './company-claim.service';

@Controller('company-directory')
export class CompanyDirectoryPublicController {
  constructor(
    private readonly directory: CompanyDirectoryService,
    private readonly claims: CompanyClaimService,
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
}
