import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { EmailsModule } from '../emails/emails.module';
import { MessagesModule } from '../messages/messages.module';
import { ContactMonetizationAdminController } from './contact-monetization-admin.controller';
import { ListingsController } from './listings.controller';
import { ListingsPrefillService } from './listings-prefill.service';
import { SrealityPlaywrightService } from './sreality-playwright.service';
import { PropertiesController } from './properties.controller';
import { PropertiesService } from './properties.service';
import { ListingShortsFromPhotosService } from './listing-shorts-from-photos.service';
import { PropertyMediaCloudinaryService } from './property-media-cloudinary.service';
import { ListingPhotoWatermarkService } from './listing-photo-watermark.service';
import { ListingWatermarkSettingsService } from './listing-watermark-settings.service';
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

@Module({
  imports: [
    ShareModule,
    forwardRef(() => SocialModule),
    forwardRef(() => CreditsModule),
    forwardRef(() => BonusCampaignModule),
    forwardRef(() => RegistrationGateModule),
    forwardRef(() => MessagesModule),
    ListingContactUnlockModule,
    SeoModule,
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
    ListingsPrefillService,
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
    ListingShortsFromPhotosService,
    ShortsListingService,
    ListingsPrefillService,
    VideoOgThumbnailService,
    FacebookShareImageService,
  ],
})
export class PropertiesModule {}
