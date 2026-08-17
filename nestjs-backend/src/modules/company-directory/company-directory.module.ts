import { Module, forwardRef } from '@nestjs/common';
import { BrokersModule } from '../brokers/brokers.module';
import { EmailsModule } from '../emails/emails.module';
import { SocialModule } from '../social/social.module';
import { AiSalesModule } from '../ai-sales/ai-sales.module';
import { OpenAiModule } from '../openai/openai.module';
import { AuthModule } from '../auth/auth.module';
import { AresService } from './ares.service';
import { CompanyAuditService } from './company-audit.service';
import { CompanyClaimService } from './company-claim.service';
import { CompanyContactDiscoveryService } from './company-contact-discovery.service';
import { CompanyContactDiscoveryPipelineService } from './company-contact-discovery-pipeline.service';
import { CompanyContactPersistenceService } from './company-contact-persistence.service';
import { CompanyContentEnrichmentService } from './company-content-enrichment.service';
import { CompanyDirectoryAdminController } from './company-directory-admin.controller';
import { CompanyDirectoryPublicController } from './company-directory-public.controller';
import { CompanyReviewMediaController } from './company-review-media.controller';
import { CompanyDirectoryService } from './company-directory.service';
import { CompanyDirectorySettingsService } from './company-directory-settings.service';
import { CompanyEmailService } from './company-email.service';
import { CompanyEventsService } from './company-events.service';
import { CompanyGoogleEnrichmentService } from './company-google-enrichment.service';
import { CompanyImportService } from './company-import.service';
import { CompanyReviewMediaStorageService } from './company-review-media-storage.service';
import { CompanyReviewService } from './company-review.service';
import { CompanyEngagementEventService } from './company-engagement-event.service';
import { CompanyEngagementCampaignService } from './company-engagement-campaign.service';
import { CompanyEmailQueueService } from './company-email-queue.service';
import { CompanyLeadService, CompanyEngagementFacadeService } from './company-lead.service';
import { CompanySeoService } from './company-seo.service';
import { CompanySocialPublishService } from './company-social-publish.service';
import { CompanySeoAdminController } from './company-seo-admin.controller';
import { CompanySeoPageService } from './company-seo-page.service';
import { CompanySeoGenerationJobService } from './company-seo-generation-job.service';
import { CompanyPortalFeedService } from './company-portal-feed.service';
import { CompanyApprovedEmailService } from './company-approved-email.service';
import { CompanyReviewSocialCardService } from './company-review-social-card.service';
import { PublicProfileDirectoryService } from './public-profile-directory.service';
import { COMPANY_REPUTATION_PROVIDER } from './company-reputation.provider';
import { GooglePlacesReputationProvider } from './google-places-reputation.provider';
import { AresQueryPartitionService } from './ares-query-partition.service';

@Module({
  imports: [
    BrokersModule,
    EmailsModule,
    SocialModule,
    AiSalesModule,
    OpenAiModule,
    forwardRef(() => AuthModule),
  ],
  controllers: [CompanyDirectoryPublicController, CompanyDirectoryAdminController, CompanyReviewMediaController, CompanySeoAdminController],
  providers: [
    AresService,
    CompanyDirectoryService,
    CompanyDirectorySettingsService,
    CompanyImportService,
    CompanyClaimService,
    CompanyAuditService,
    CompanyEmailService,
    CompanyGoogleEnrichmentService,
    CompanyContactDiscoveryService,
    CompanyContactDiscoveryPipelineService,
    CompanyContactPersistenceService,
    CompanyContentEnrichmentService,
    CompanyEventsService,
    CompanySeoService,
    CompanySeoPageService,
    CompanySeoGenerationJobService,
    CompanyPortalFeedService,
    CompanySocialPublishService,
    CompanyApprovedEmailService,
    CompanyReviewSocialCardService,
    CompanyReviewMediaStorageService,
    CompanyReviewService,
    CompanyEngagementEventService,
    CompanyEngagementCampaignService,
    CompanyEmailQueueService,
    CompanyLeadService,
    CompanyEngagementFacadeService,
    PublicProfileDirectoryService,
    AresQueryPartitionService,
    GooglePlacesReputationProvider,
    {
      provide: COMPANY_REPUTATION_PROVIDER,
      useExisting: GooglePlacesReputationProvider,
    },
  ],
  exports: [
    CompanyDirectoryService,
    CompanyDirectorySettingsService,
    CompanySeoService,
    AresService,
    CompanyImportService,
    CompanyReviewService,
  ],
})
export class CompanyDirectoryModule {}
