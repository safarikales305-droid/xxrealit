import { Controller, ForbiddenException, Post } from '@nestjs/common';
import { HotelbedsConfigService } from './hotelbeds.config';

@Controller('hotelbeds')
export class HotelbedsBookingController {
  constructor(private readonly config: HotelbedsConfigService) {}

  @Post('book')
  book() {
    if (!this.config.bookingEnabled || this.config.environment !== 'production') {
      throw new ForbiddenException({
        success: false,
        errorCode: 'BOOKING_DISABLED_IN_TEST_MODE',
        message: 'Rezervace je v testovacím režimu dočasně vypnutá.',
      });
    }
    throw new ForbiddenException({
      success: false,
      errorCode: 'BOOKING_NOT_CONFIGURED',
      message: 'Rezervace není aktivní.',
    });
  }
}
