import { Module } from '@nestjs/common';
import { BrokersModule } from '../brokers/brokers.module';
import { EmailsModule } from '../emails/emails.module';
import { SocialModule } from '../social/social.module';
import { AresService } from './ares.service';
import { CompanyAuditService } from './company-audit.service';
import { CompanyClaimService } from './company-claim.service';
import { CompanyContactDiscoveryService } from './company-contact-discovery.service';
import { CompanyDirectoryAdminController } from './company-directory-admin.controller';
import { CompanyDirectoryPublicController } from './company-directory-public.controller';
import { CompanyReviewMediaController } from './company-review-media.controller';
import { CompanyDirectoryService } from './company-directory.service';
import { CompanyEmailService } from './company-email.service';
import { CompanyGoogleEnrichmentService } from './company-google-enrichment.service';
import { CompanyImportService } from './company-import.service';
import { CompanyReviewService } from './company-review.service';
import { CompanyEngagementEventService } from './company-engagement-event.service';
import { CompanyEngagementCampaignService } from './company-engagement-campaign.service';
import { CompanyEmailQueueService } from './company-email-queue.service';
import { CompanyLeadService, CompanyEngagementFacadeService } from './company-lead.service';
import { PublicProfileDirectoryService } from './public-profile-directory.service';
import { COMPANY_REPUTATION_PROVIDER } from './company-reputation.provider';
import { GooglePlacesReputationProvider } from './google-places-reputation.provider';

@Module({
  imports: [BrokersModule, EmailsModule, SocialModule],
  controllers: [CompanyDirectoryPublicController, CompanyDirectoryAdminController, CompanyReviewMediaController],
  providers: [
    AresService,
    CompanyDirectoryService,
    CompanyImportService,
    CompanyClaimService,
    CompanyAuditService,
    CompanyEmailService,
    CompanyGoogleEnrichmentService,
    CompanyContactDiscoveryService,
    CompanyReviewService,
    CompanyEngagementEventService,
    CompanyEngagementCampaignService,
    CompanyEmailQueueService,
    CompanyLeadService,
    CompanyEngagementFacadeService,
    PublicProfileDirectoryService,
    GooglePlacesReputationProvider,
    {
      provide: COMPANY_REPUTATION_PROVIDER,
      useExisting: GooglePlacesReputationProvider,
    },
  ],
  exports: [CompanyDirectoryService, AresService, CompanyImportService, CompanyReviewService],
})
export class CompanyDirectoryModule {}
