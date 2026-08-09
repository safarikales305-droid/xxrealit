import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../../admin/guards/admin.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { HotelbedsConfigService } from './hotelbeds.config';
import { HotelbedsService } from './hotelbeds.service';

@Controller('admin/integrations/hotelbeds')
@UseGuards(JwtAuthGuard, AdminGuard)
export class HotelbedsAdminController {
  constructor(
    private readonly hotelbeds: HotelbedsService,
    private readonly config: HotelbedsConfigService,
  ) {}

  @Get('status')
  status() {
    return this.config.publicStatus();
  }

  @Post('test')
  testConnection() {
    return this.hotelbeds.testConnection();
  }

  @Post('test-search')
  testSearch() {
    return this.hotelbeds.testSearchHotels();
  }
}
