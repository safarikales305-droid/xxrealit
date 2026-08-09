import { Controller, Get, Param, Query } from '@nestjs/common';
import { HotelbedsPublicService } from './hotelbeds-public.service';

@Controller('hotelbeds/public')
export class HotelbedsPublicController {
  constructor(private readonly publicService: HotelbedsPublicService) {}

  @Get('config')
  config() {
    return this.publicService.getPublicConfig();
  }

  @Get('search')
  search(
    @Query('destination') destination?: string,
    @Query('checkIn') checkIn?: string,
    @Query('checkOut') checkOut?: string,
    @Query('adults') adults?: string,
    @Query('children') children?: string,
    @Query('rooms') rooms?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('starsMin') starsMin?: string,
    @Query('priceMax') priceMax?: string,
  ) {
    return this.publicService.search({
      destination,
      checkIn,
      checkOut,
      adults: Number(adults) || undefined,
      children: Number(children) || undefined,
      rooms: Number(rooms) || undefined,
      page: Number(page) || undefined,
      limit: Number(limit) || undefined,
      starsMin: Number(starsMin) || undefined,
      priceMax: Number(priceMax) || undefined,
    });
  }

  @Get('hotels/:slug')
  detail(
    @Param('slug') slug: string,
    @Query('checkIn') checkIn?: string,
    @Query('checkOut') checkOut?: string,
    @Query('adults') adults?: string,
    @Query('rooms') rooms?: string,
  ) {
    return this.publicService.getBySlug(slug, {
      checkIn,
      checkOut,
      adults: Number(adults) || undefined,
      rooms: Number(rooms) || undefined,
    });
  }

  @Get('hotels/:slug/similar')
  similar(
    @Param('slug') slug: string,
    @Query('checkIn') checkIn?: string,
    @Query('checkOut') checkOut?: string,
    @Query('adults') adults?: string,
    @Query('rooms') rooms?: string,
  ) {
    return this.publicService.getSimilar(slug, {
      checkIn,
      checkOut,
      adults: Number(adults) || undefined,
      rooms: Number(rooms) || undefined,
    });
  }
}
