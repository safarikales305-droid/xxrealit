import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PropertiesController } from './properties.controller';
import { PropertiesService } from './properties.service';
import { ListingShortsFromPhotosService } from './listing-shorts-from-photos.service';
import { PropertyMediaCloudinaryService } from './property-media-cloudinary.service';
import { SeedController } from './seed.controller';
import { ShortsListingController } from './shorts-listing.controller';
import { ShortsListingService } from './shorts-listing.service';

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
    ListingShortsFromPhotosService,
    ShortsListingService,
  ],
  exports: [PropertiesService, PropertyMediaCloudinaryService, ShortsListingService],
})
export class PropertiesModule {}
