import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Logger,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CompanyDirectoryCategory } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/guards/admin.guard';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator';
import { AresService } from './ares.service';
import { CompanyClaimService } from './company-claim.service';
import { CompanyContactDiscoveryService } from './company-contact-discovery.service';
import { CompanyDirectoryService } from './company-directory.service';
import { CompanyEmailService } from './company-email.service';
import { CompanyGoogleEnrichmentService } from './company-google-enrichment.service';
import { CompanyImportService } from './company-import.service';
import { CompanyReviewService } from './company-review.service';
import { CompanyEngagementCampaignService } from './company-engagement-campaign.service';
import { CompanyDirectorySettingsService } from './company-directory-settings.service';
import { CompanyContentEnrichmentService } from './company-content-enrichment.service';
import { CompanySeoService } from './company-seo.service';
import { CompanySocialPublishService } from './company-social-publish.service';
import {
  FACEBOOK_POSTS_PER_DAY_MAX,
  FACEBOOK_POSTS_PER_DAY_MIN,
} from './company-directory-settings.types';
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
  private readonly log = new Logger(CompanyDirectoryAdminController.name);

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
    private readonly automationSettings: CompanyDirectorySettingsService,
    private readonly enrichment: CompanyContentEnrichmentService,
    private readonly seo: CompanySeoService,
    private readonly socialPublish: CompanySocialPublishService,
  ) {}

  @Get('dashboard')
  dashboard() {
    return this.directory.getAdminDashboard();
  }

  @Get('metrics')
  async metrics() {
    const contactDiscovery = await this.contactDiscovery.getDiagnostics();
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
      contactDiscovery,
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
  discoverContact(@Param('id') id: string, @Body() body?: { force?: boolean }) {
    return this.contactDiscovery.discoverForCompany(id, { force: body?.force });
  }

  @Get('contact/discovery/:itemId')
  getContactDiscoveryItem(@Param('itemId') itemId: string) {
    return this.contactDiscovery.getDiscoveryItem(itemId);
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
      filter?: {
        category?: CompanyDirectoryCategory;
        region?: string;
        city?: string;
        q?: string;
        ico?: string;
        verified?: string;
        active?: string;
        minRating?: string;
        hasGoogle?: string;
        hasEmail?: string;
        claimed?: string;
        hasReviews?: string;
        noReviews?: string;
        contactDiscoveryState?: string;
      };
    },
  ) {
    this.log.log(
      JSON.stringify({
        event: 'CONTACT_BATCH_START_REQUEST',
        route: 'POST /admin/company-directory/contact/batches/start',
        bodyKeys: Object.keys(body ?? {}),
        companyIdsCount: body?.companyIds?.length ?? 0,
        hasFilter: !!body?.filter,
        filter: body?.filter
          ? {
              category: body.filter.category ?? null,
              region: body.filter.region ?? null,
              city: body.filter.city ?? null,
              q: body.filter.q ? '[set]' : null,
              hasGoogle: body.filter.hasGoogle ?? null,
              hasEmail: body.filter.hasEmail ?? null,
            }
          : null,
        limit: body?.limit ?? null,
        force: body?.force ?? false,
      }),
    );
    try {
      return this.contactDiscovery.startBatch(body);
    } catch (err) {
      const message = err instanceof HttpException ? err.message : 'Unknown error';
      this.log.warn(
        JSON.stringify({
          event: 'CONTACT_BATCH_START_REJECTED',
          message,
          status: err instanceof HttpException ? err.getStatus() : 500,
        }),
      );
      throw err;
    }
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
    @CurrentUser() admin: AuthUser,
    @Body() body: { action: 'approve' | 'reject'; adminNote?: string; forcePrimaryEmail?: boolean },
  ) {
    return this.claims.reviewClaim(id, body.action, body.adminNote, admin.id, {
      forcePrimaryEmail: body.forcePrimaryEmail,
    });
  }

  @Patch('reviews/:id/moderate')
  moderateReview(
    @Param('id') id: string,
    @CurrentUser() admin: AuthUser,
    @Body()
    body: {
      action: 'approve' | 'reject' | 'hide' | 'remove' | 'reject_changes';
      note?: string;
      removalReason?: string;
    },
  ) {
    return this.reviews.moderateReview(id, body.action, admin.id, body.note, body.removalReason);
  }

  @Get('reviews/:id')
  getReviewDetail(@Param('id') id: string) {
    return this.reviews.getAdminReviewDetail(id);
  }

  @Patch('reviews/:id')
  updateReview(
    @Param('id') id: string,
    @CurrentUser() admin: AuthUser,
    @Body()
    body: {
      rating?: number;
      sentiment?: string;
      title?: string;
      body?: string;
      keepPublished?: boolean;
    },
  ) {
    return this.reviews.updateReviewAsAdmin(id, admin.id, body);
  }

  @Get('reviews')
  listReviews(@Query('status') status?: string) {
    return this.reviews.listAdminReviews(status);
  }

  @Delete('reviews/media/:mediaId')
  deleteReviewMedia(
    @Param('mediaId') mediaId: string,
    @CurrentUser() admin: AuthUser,
    @Body() body?: { reason?: string },
  ) {
    return this.reviews.deleteReviewMedia(mediaId, admin.id, body?.reason);
  }

  @Post('reviews/backfill-authors')
  backfillAuthors() {
    return this.reviews.backfillReviewAuthors();
  }

  @Get('settings/automation')
  getAutomationSettings() {
    return this.automationSettings.getSettings();
  }

  @Patch('settings/automation')
  updateAutomationSettings(
    @Body()
    body: {
      seo?: Record<string, unknown>;
      facebook?: Record<string, unknown>;
      email?: Record<string, unknown>;
    },
  ) {
    if (body.facebook?.postsPerDay != null) {
      const n = Number(body.facebook.postsPerDay);
      if (!Number.isFinite(n) || n < FACEBOOK_POSTS_PER_DAY_MIN || n > FACEBOOK_POSTS_PER_DAY_MAX) {
        throw new HttpException(
          `Počet příspěvků denně musí být ${FACEBOOK_POSTS_PER_DAY_MIN}–${FACEBOOK_POSTS_PER_DAY_MAX}.`,
          400,
        );
      }
    }
    return this.automationSettings.updateSettings(
      body as Partial<import('./company-directory-settings.types').CompanyDirectoryAutomationSettings>,
    );
  }

  @Get('settings/seo/stats')
  seoStats() {
    return this.automationSettings.getSeoStats();
  }

  @Get('settings/facebook/stats')
  facebookStats() {
    return this.automationSettings.getFacebookStats();
  }

  @Get('social/queue')
  socialQueue(@Query() query: Record<string, string | undefined>) {
    return this.socialPublish.listQueue({
      status: query.status,
      page: Number(query.page ?? 1) || 1,
      pageSize: Number(query.pageSize ?? 50) || 50,
    });
  }

  @Post('social/queue/:id/publish')
  publishSocialNow(@Param('id') id: string) {
    return this.socialPublish.publishItem(id);
  }

  @Post('social/queue/:id/skip')
  skipSocial(@Param('id') id: string, @Body() body?: { reason?: string }) {
    return this.socialPublish.skipQueueItem(id, body?.reason ?? 'admin_skip');
  }

  @Delete('companies/:id/social-queue')
  removeSocialQueue(@Param('id') companyId: string) {
    return this.socialPublish.removeFromQueue(companyId);
  }

  @Post('companies/:id/social-queue')
  addSocialQueue(@Param('id') companyId: string) {
    return this.socialPublish.enqueueManual(companyId);
  }

  @Get('companies/:id/social-preview')
  socialPreview(@Param('id') companyId: string) {
    return this.socialPublish.previewForCompany(companyId);
  }

  @Get('companies/:id/email-preview')
  async emailPreview(@Param('id') companyId: string, @Query('template') template?: string) {
    const detail = await this.directory.getAdminCompanyDetail(companyId);
    const company = detail.company as Record<string, unknown>;
    const base = process.env.FRONTEND_URL ?? 'https://www.xxrealit.cz';
    return {
      template: template ?? 'company_activation_step_1',
      placeholders: {
        companyName: company.name,
        city: company.city ?? '',
        profileUrl: `${base}/firmy/${company.slug}`,
        claimUrl: `${base}/firmy/${company.slug}#prevzit-profil`,
        reviewCount: String(company.xxrealitReviewCount ?? 0),
        rating: String(company.xxrealitRatingAverage ?? ''),
        website: company.website ?? '',
        shortDescription: company.shortDescription ?? '',
      },
    };
  }

  @Post('companies/:id/enrichment/run')
  runEnrichment(@Param('id') companyId: string) {
    return this.enrichment.manualEnrich(companyId);
  }

  @Post('companies/:id/seo/evaluate')
  evaluateSeo(@Param('id') companyId: string) {
    return this.seo.evaluateCompany(companyId);
  }

  @Post('social/automation/resume')
  resumeSocialAutomation() {
    this.socialPublish.resumeAutomation();
    return { ok: true };
  }
}
