import { Module } from '@nestjs/common';
import { AccommodationAdminController } from './accommodation-admin.controller';
import { AccommodationAdminService } from './accommodation-admin.service';
import { AccommodationController } from './accommodation.controller';
import { AccommodationHeroService } from './accommodation-hero.service';
import { AccommodationService } from './accommodation.service';
import { AccommodationSyncJobService } from './accommodation-sync-job.service';
import { AccommodationProviderRegistry } from './providers/accommodation-provider.registry';
import { BookingAccommodationProvider } from './providers/booking/booking-accommodation.provider';
import { DemoAccommodationProvider } from './providers/demo/demo-accommodation.provider';

@Module({
  controllers: [AccommodationController, AccommodationAdminController],
  providers: [
    AccommodationService,
    AccommodationAdminService,
    AccommodationHeroService,
    AccommodationSyncJobService,
    DemoAccommodationProvider,
    BookingAccommodationProvider,
    AccommodationProviderRegistry,
  ],
  exports: [AccommodationService, AccommodationHeroService],
})
export class AccommodationModule {}
