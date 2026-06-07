import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PropertiesController } from './properties.controller';
import { PropertiesService } from './properties.service';
import { ListingShortsFromPhotosService } from './listing-shorts-from-photos.service';
import { PropertyMediaCloudinaryService } from './property-media-cloudinary.service';
import { ListingPhotoWatermarkService } from './listing-photo-watermark.service';
import { ListingWatermarkSettingsService } from './listing-watermark-settings.service';
import { SeedController } from './seed.controller';
import { ShortsListingController } from './shorts-listing.controller';
import { ShortsListingService } from './shorts-listing.service';
import { VideoOgThumbnailService } from './video-og-thumbnail.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') ?? 'dev-jwt-secret-change-me',
      }),
    }),
  ],
  controllers: [PropertiesController, SeedController, ShortsListingController],
  providers: [
    PropertiesService,
    PropertyMediaCloudinaryService,
    ListingPhotoWatermarkService,
    ListingWatermarkSettingsService,
    ListingShortsFromPhotosService,
    ShortsListingService,
    VideoOgThumbnailService,
  ],
  exports: [
    PropertiesService,
    PropertyMediaCloudinaryService,
    ListingWatermarkSettingsService,
    ListingShortsFromPhotosService,
    ShortsListingService,
    VideoOgThumbnailService,
  ],
})
export class PropertiesModule {}
