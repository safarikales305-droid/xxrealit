import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CompanyDirectoryCategory } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/guards/admin.guard';
import { AresService } from './ares.service';
import { CompanyClaimService } from './company-claim.service';
import { CompanyContactDiscoveryService } from './company-contact-discovery.service';
import { CompanyDirectoryService } from './company-directory.service';
import { CompanyEmailService } from './company-email.service';
import { CompanyGoogleEnrichmentService } from './company-google-enrichment.service';
import { CompanyImportService } from './company-import.service';
import { CompanyReviewService } from './company-review.service';
import {
  ARES_IMPORT_BATCH_SIZE,
  ARES_IMPORT_DELAY_MS,
  ARES_IMPORT_ENABLED,
  CZECH_REGIONS,
  COMPANY_CONTACT_DISCOVERY_ENABLED,
  COMPANY_OUTREACH_ENABLED,
  COMPANY_REVIEWS_ENABLED,
  GOOGLE_COMPANY_ENRICHMENT_ENABLED,
} from './company-directory.constants';

@Controller('admin/company-directory')
@UseGuards(JwtAuthGuard, AdminGuard)
export class CompanyDirectoryAdminController {
  constructor(
    private readonly directory: CompanyDirectoryService,
    private readonly importService: CompanyImportService,
    private readonly claims: CompanyClaimService,
    private readonly ares: AresService,
    private readonly google: CompanyGoogleEnrichmentService,
    private readonly contactDiscovery: CompanyContactDiscoveryService,
    private readonly email: CompanyEmailService,
    private readonly reviews: CompanyReviewService,
  ) {}

  @Get('dashboard')
  dashboard() {
    return this.directory.getAdminDashboard();
  }

  @Get('metrics')
  metrics() {
    return {
      ares: this.ares.getMetrics(),
      flags: {
        directory: this.directory.isEnabled(),
        aresImport: ARES_IMPORT_ENABLED,
        googleEnrichment: GOOGLE_COMPANY_ENRICHMENT_ENABLED,
        contactDiscovery: COMPANY_CONTACT_DISCOVERY_ENABLED,
        outreach: COMPANY_OUTREACH_ENABLED,
        reviews: COMPANY_REVIEWS_ENABLED,
      },
      defaults: {
        batchSize: ARES_IMPORT_BATCH_SIZE,
        delayMs: ARES_IMPORT_DELAY_MS,
      },
      regions: CZECH_REGIONS,
      categories: Object.values(CompanyDirectoryCategory),
    };
  }

  @Get('companies')
  listCompanies(@Query() query: Record<string, string | undefined>) {
    return this.directory.listAdminCompanies(query);
  }

  @Get('companies/:id')
  getCompany(@Param('id') id: string) {
    return this.directory.getAdminCompanyDetail(id);
  }

  @Get('import/jobs')
  listImportJobs() {
    return this.importService.listJobs();
  }

  @Get('import/jobs/:id')
  getImportJob(@Param('id') id: string) {
    return this.importService.getJob(id);
  }

  @Get('import/jobs/:id/items')
  getImportJobItems(@Param('id') id: string) {
    return this.importService.getJobItems(id);
  }

  @Post('import/start')
  startImport(
    @Body()
    body: {
      category?: CompanyDirectoryCategory;
      region?: string;
      district?: string;
      city?: string;
      batchSize?: number;
      delayMs?: number;
      importMode?: 'SEARCH' | 'ICO_LIST';
      icoList?: string[];
    },
  ) {
    return this.importService.startImport(body);
  }

  @Post('import/jobs/:id/pause')
  pauseImport(@Param('id') id: string) {
    return this.importService.pauseJob(id);
  }

  @Post('import/jobs/:id/resume')
  resumeImport(@Param('id') id: string) {
    return this.importService.resumeJob(id);
  }

  @Post('import/jobs/:id/stop')
  stopImport(@Param('id') id: string) {
    return this.importService.stopJob(id);
  }

  @Get('google/jobs')
  listGoogleJobs() {
    return this.google.listJobs();
  }

  @Post('google/start')
  startGoogle(
    @Body()
    body: {
      companyIds?: string[];
      category?: string;
      region?: string;
      city?: string;
      batchSize?: number;
      delayMs?: number;
      limit?: number;
    },
  ) {
    return this.google.startJob(body);
  }

  @Post('google/jobs/:id/pause')
  pauseGoogle(@Param('id') id: string) {
    return this.google.pauseJob(id);
  }

  @Post('google/jobs/:id/resume')
  resumeGoogle(@Param('id') id: string) {
    return this.google.resumeJob(id);
  }

  @Post('companies/:id/google/match')
  matchGoogle(@Param('id') id: string) {
    return this.google.matchSingleCompany(id);
  }

  @Post('companies/:id/contact/discover')
  discoverContact(@Param('id') id: string) {
    return this.contactDiscovery.discoverForCompany(id);
  }

  @Post('contact/batches/start')
  startContactBatch(@Body() body: { companyIds?: string[]; limit?: number }) {
    return this.contactDiscovery.startBatch(body);
  }

  @Get('contact/batches')
  listContactBatches() {
    return this.contactDiscovery.listBatches();
  }

  @Patch('contacts/:id/confirm')
  confirmContact(@Param('id') id: string) {
    return this.contactDiscovery.confirmContact(id);
  }

  @Patch('contacts/:id/reject')
  rejectContact(@Param('id') id: string) {
    return this.contactDiscovery.rejectContact(id);
  }

  @Post('companies/:id/email')
  sendEmail(
    @Param('id') id: string,
    @Body()
    body: { recipient: string; subject: string; template?: string; body: string },
  ) {
    return this.email.sendAdminEmail({
      companyId: id,
      recipient: body.recipient,
      subject: body.subject,
      template: body.template ?? 'custom_message',
      body: body.body,
    });
  }

  @Get('claims')
  listClaims(@Query('status') status?: string) {
    return this.claims.listClaims(status);
  }

  @Patch('claims/:id')
  reviewClaim(
    @Param('id') id: string,
    @Body() body: { action: 'approve' | 'reject'; adminNote?: string },
  ) {
    return this.claims.reviewClaim(id, body.action, body.adminNote);
  }

  @Patch('reviews/:id/moderate')
  moderateReview(
    @Param('id') id: string,
    @Body() body: { action: 'approve' | 'reject' | 'hide'; note?: string },
  ) {
    return this.reviews.moderateReview(id, body.action, undefined, body.note);
  }
}
