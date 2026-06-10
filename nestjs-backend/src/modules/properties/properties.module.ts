import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { EmailsModule } from '../emails/emails.module';
import { MessagesModule } from '../messages/messages.module';
import { ContactMonetizationAdminController } from './contact-monetization-admin.controller';
import { ContactMonetizationService } from './contact-monetization.service';
import { ListingsController } from './listings.controller';
import { ListingContactUnlockService } from './listing-contact-unlock.service';
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

@Module({
  imports: [
    ShareModule,
    forwardRef(() => CreditsModule),
    BonusCampaignModule,
    forwardRef(() => RegistrationGateModule),
    forwardRef(() => MessagesModule),
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
    ContactMonetizationAdminController,
    SeedController,
    ShortsListingController,
  ],
  providers: [
    ContactMonetizationService,
    ListingContactUnlockService,
    PropertiesService,
    PropertyMediaCloudinaryService,
    ListingPhotoWatermarkService,
    ListingWatermarkSettingsService,
    ListingShortsFromPhotosService,
    ShortsListingService,
    VideoOgThumbnailService,
    FacebookShareImageService,
  ],
  exports: [
    ContactMonetizationService,
    ListingContactUnlockService,
    PropertiesService,
    PropertyMediaCloudinaryService,
    ListingWatermarkSettingsService,
    ListingShortsFromPhotosService,
    ShortsListingService,
    VideoOgThumbnailService,
    FacebookShareImageService,
  ],
})
export class PropertiesModule {}
