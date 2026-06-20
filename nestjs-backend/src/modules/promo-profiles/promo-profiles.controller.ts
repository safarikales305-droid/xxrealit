import { Controller, Get, Query } from '@nestjs/common';
import { PromoProfilesService } from './promo-profiles.service';

@Controller('promo-profiles')
export class PromoProfilesController {
  constructor(private readonly promoProfiles: PromoProfilesService) {}

  @Get('public')
  listPublic(@Query('limit') limit?: string) {
    const parsed = Number(limit);
    const take = Number.isFinite(parsed) ? parsed : 48;
    return this.promoProfiles.listPublic(take);
  }
}
