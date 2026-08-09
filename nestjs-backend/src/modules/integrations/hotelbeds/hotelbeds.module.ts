import { Module } from '@nestjs/common';
import { HotelbedsAdminController } from './hotelbeds-admin.controller';
import { HotelbedsBookingController } from './hotelbeds-booking.controller';
import { HotelbedsCacheService } from './hotelbeds-cache.service';
import { HotelbedsCurrencyService } from './hotelbeds-currency.service';
import { HotelbedsHttpService } from './hotelbeds-http.service';
import { HotelbedsMetricsService } from './hotelbeds-metrics.service';
import { HotelbedsPublicController } from './hotelbeds-public.controller';
import { HotelbedsPublicService } from './hotelbeds-public.service';
import { HotelbedsRateLimiterService } from './hotelbeds-rate-limiter.service';
import { HotelbedsConfigService } from './hotelbeds.config';
import { HotelbedsSignatureService } from './hotelbeds-signature.service';
import { HotelbedsService } from './hotelbeds.service';

@Module({
  controllers: [HotelbedsAdminController, HotelbedsPublicController, HotelbedsBookingController],
  providers: [
    HotelbedsConfigService,
    HotelbedsSignatureService,
    HotelbedsRateLimiterService,
    HotelbedsCacheService,
    HotelbedsMetricsService,
    HotelbedsCurrencyService,
    HotelbedsHttpService,
    HotelbedsService,
    HotelbedsPublicService,
  ],
  exports: [HotelbedsService, HotelbedsConfigService, HotelbedsPublicService],
})
export class HotelbedsModule {}
