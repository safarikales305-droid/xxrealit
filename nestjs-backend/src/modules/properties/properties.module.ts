import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { EmailsModule } from '../emails/emails.module';
import { MessagesModule } from '../messages/messages.module';
import { ContactMonetizationAdminController } from './contact-monetization-admin.controller';
import { ListingsController } from './listings.controller';
import { ListingsPrefillService } from './listings-prefill.service';
import { SrealityImportService } from './sreality-import.service';
import { SrealityListingTextRewriteService } from './sreality-listing-text-rewrite.service';
import { SrealityPlaywrightService } from './sreality-playwright.service';
import { PropertiesController } from './properties.controller';
import { PropertiesService } from './properties.service';
import { ListingShortsFromPhotosService } from './listing-shorts-from-photos.service';
import { PropertyMediaCloudinaryService } from './property-media-cloudinary.service';
import { ListingPhotoWatermarkService } from './listing-photo-watermark.service';
import { ListingWatermarkSettingsService } from './listing-watermark-settings.service';
import { ListingApprovalSettingsService } from './listing-approval-settings.service';
import { PropertySocialPublishSummaryService } from './property-social-publish-summary.service';
import { SeedController } from './seed.controller';
import { ShortsListingController } from './shorts-listing.controller';
import { ShortsListingService } from './shorts-listing.service';
import { FacebookShareImageService } from './facebook-share-image.service';
import { VideoOgThumbnailService } from './video-og-thumbnail.service';
import { ShareModule } from '../share/share.module';
import { BonusCampaignModule } from '../bonus-campaign/bonus-campaign.module';
import { CreditsModule } from '../credits/credits.module';
import { RegistrationGateModule } from '../registration-gate/registration-gate.module';
import { AdvertiserListingLeadsController } from './advertiser-listing-leads.controller';
import { ListingContactUnlockModule } from './listing-contact-unlock.module';
import { SeoModule } from '../seo/seo.module';
import { SocialModule } from '../social/social.module';
import { TikTokModule } from '../social/tiktok/tiktok.module';
import { ImportedBrokerContactsModule } from '../imported-broker-contacts/imported-broker-contact.module';
import { OpenAiModule } from '../openai/openai.module';

@Module({
  imports: [
    ShareModule,
    TikTokModule,
    forwardRef(() => SocialModule),
    forwardRef(() => CreditsModule),
    forwardRef(() => BonusCampaignModule),
    forwardRef(() => RegistrationGateModule),
    forwardRef(() => MessagesModule),
    ListingContactUnlockModule,
    SeoModule,
    ImportedBrokerContactsModule,
    OpenAiModule,
    EmailsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') ?? 'dev-jwt-secret-change-me',
      }),
    }),
  ],
  controllers: [
    PropertiesController,
    ListingsController,
    AdvertiserListingLeadsController,
    ContactMonetizationAdminController,
    SeedController,
    ShortsListingController,
  ],
  providers: [
    PropertiesService,
    PropertyMediaCloudinaryService,
    ListingPhotoWatermarkService,
    ListingWatermarkSettingsService,
    ListingApprovalSettingsService,
    PropertySocialPublishSummaryService,
    ListingsPrefillService,
    SrealityImportService,
    SrealityListingTextRewriteService,
    SrealityPlaywrightService,
    ListingShortsFromPhotosService,
    ShortsListingService,
    VideoOgThumbnailService,
    FacebookShareImageService,
  ],
  exports: [
    ListingContactUnlockModule,
    PropertiesService,
    PropertyMediaCloudinaryService,
    ListingWatermarkSettingsService,
    ListingApprovalSettingsService,
    PropertySocialPublishSummaryService,
    ListingShortsFromPhotosService,
    ShortsListingService,
    ListingsPrefillService,
    SrealityImportService,
    VideoOgThumbnailService,
    FacebookShareImageService,
  ],
})
export class PropertiesModule {}
