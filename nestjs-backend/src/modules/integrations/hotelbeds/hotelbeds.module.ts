import { Module } from '@nestjs/common';
import { HotelbedsAdminController } from './hotelbeds-admin.controller';
import { HotelbedsConfigService } from './hotelbeds.config';
import { HotelbedsSignatureService } from './hotelbeds-signature.service';
import { HotelbedsService } from './hotelbeds.service';

@Module({
  controllers: [HotelbedsAdminController],
  providers: [HotelbedsConfigService, HotelbedsSignatureService, HotelbedsService],
  exports: [HotelbedsService, HotelbedsConfigService],
})
export class HotelbedsModule {}
