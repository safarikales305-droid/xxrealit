import {
  Body,
  Controller,
  Delete,
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
import { CompanyEngagementCampaignService } from './company-engagement-campaign.service';
import {
  ARES_IMPORT_BATCH_SIZE,
  ARES_IMPORT_DELAY_MS,
  ARES_IMPORT_ENABLED,
  CZECH_REGIONS,
  COMPANY_CONTACT_DISCOVERY_ENABLED,
  COMPANY_ENGAGEMENT_CAMPAIGNS_ENABLED,
  COMPANY_INTEREST_NOTIFICATIONS_ENABLED,
  COMPANY_MONTHLY_NURTURE_ENABLED,
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
    private readonly campaigns: CompanyEngagementCampaignService,
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
        engagementCampaigns: COMPANY_ENGAGEMENT_CAMPAIGNS_ENABLED,
        interestNotifications: COMPANY_INTEREST_NOTIFICATIONS_ENABLED,
        monthlyNurture: COMPANY_MONTHLY_NURTURE_ENABLED,
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
      limit?: number;
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

  @Post('import/jobs/:id/resplit')
  resplitImport(@Param('id') id: string) {
    return this.importService.resumeWithResplit(id);
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

  @Get('companies/:id/contact')
  getContactDetail(@Param('id') id: string) {
    return this.contactDiscovery.getContactDetail(id);
  }

  @Post('companies/:id/campaign/start')
  startCampaign(@Param('id') id: string) {
    return this.campaigns.startCampaign(id);
  }

  @Get('companies/:id/campaign')
  getCampaign(@Param('id') id: string) {
    return this.campaigns.getCampaignDetail(id);
  }

  @Post('companies/:id/campaign/pause')
  pauseCampaign(@Param('id') id: string) {
    return this.campaigns.pauseCampaign(id);
  }

  @Post('companies/:id/campaign/resume')
  resumeCampaign(@Param('id') id: string) {
    return this.campaigns.resumeCampaign(id);
  }

  @Post('companies/:id/campaign/stop')
  stopCampaign(@Param('id') id: string) {
    return this.campaigns.stopCampaign(id);
  }

  @Post('campaigns/bulk-start')
  bulkStartCampaign(@Body() body: { companyIds: string[] }) {
    return this.campaigns.startBulkCampaign(body.companyIds ?? []);
  }

  @Get('engagement/dashboard')
  engagementDashboard() {
    return this.directory.getEngagementDashboard();
  }

  @Post('contact/batches/start')
  startContactBatch(
    @Body()
    body: {
      companyIds?: string[];
      limit?: number;
      label?: string;
      force?: boolean;
      filter?: { category?: CompanyDirectoryCategory; region?: string; city?: string; q?: string };
    },
  ) {
    return this.contactDiscovery.startBatch(body);
  }

  @Get('contact/batches')
  listContactBatches() {
    return this.contactDiscovery.listBatches();
  }

  @Get('contact/batches/:id')
  getContactBatch(@Param('id') id: string) {
    return this.contactDiscovery.getBatch(id);
  }

  @Post('contact/batches/:id/pause')
  pauseContactBatch(@Param('id') id: string) {
    return this.contactDiscovery.pauseBatch(id);
  }

  @Post('contact/batches/:id/resume')
  resumeContactBatch(@Param('id') id: string) {
    return this.contactDiscovery.resumeBatch(id);
  }

  @Post('contact/batches/:id/stop')
  stopContactBatch(@Param('id') id: string) {
    return this.contactDiscovery.stopBatch(id);
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

  @Get('reviews')
  listReviews(@Query('status') status?: string) {
    return this.reviews.listAdminReviews(status);
  }

  @Delete('reviews/media/:mediaId')
  deleteReviewMedia(@Param('mediaId') mediaId: string) {
    return this.reviews.deleteReviewMedia(mediaId);
  }
}
