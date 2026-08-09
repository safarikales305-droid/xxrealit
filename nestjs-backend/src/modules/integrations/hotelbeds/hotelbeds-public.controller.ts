import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { parseCatalogQueryParam } from './hotelbeds-content-api-status.util';
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
    @Query('category') category?: string,
    @Query('wifi') wifi?: string,
    @Query('parking') parking?: string,
    @Query('breakfast') breakfast?: string,
    @Query('wellness') wellness?: string,
    @Query('pool') pool?: string,
    @Query('pets') pets?: string,
    @Query('accessible') accessible?: string,
    @Query('ratingMin') ratingMin?: string,
    @Query('catalog') catalog?: string,
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
      category,
      wifi: wifi === '1' || wifi === 'true',
      parking: parking === '1' || parking === 'true',
      breakfast: breakfast === '1' || breakfast === 'true',
      wellness: wellness === '1' || wellness === 'true',
      pool: pool === '1' || pool === 'true',
      pets: pets === '1' || pets === 'true',
      accessible: accessible === '1' || accessible === 'true',
      ratingMin: Number(ratingMin) || undefined,
      catalog: parseCatalogQueryParam(catalog),
    });
  }

  @Get('image')
  async image(
    @Query('hotelId') hotelId: string,
    @Query('index') index: string,
    @Query('size') size: string | undefined,
    @Res() res: Response,
  ) {
    await this.publicService.streamHotelImage(res, Number(hotelId), Number(index), size);
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
