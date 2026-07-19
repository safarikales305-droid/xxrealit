import { Controller, Get, Query } from '@nestjs/common';
import { SeoPublicListingsService } from './seo-public-listings.service';

@Controller('public')
export class SeoPublicListingsController {
  constructor(private readonly listings: SeoPublicListingsService) {}

  @Get('seo-listings')
  getSeoListings(
    @Query('intent') intent?: string,
    @Query('location') location?: string,
    @Query('locationId') locationId?: string,
    @Query('propertyTypeKey') propertyTypeKey?: string,
    @Query('offerType') offerType?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.listings.getListings({
      intent: intent?.trim() || undefined,
      location: location?.trim() || undefined,
      locationId: locationId?.trim() || undefined,
      propertyTypeKey: propertyTypeKey?.trim() || undefined,
      offerType: offerType?.trim() || undefined,
      page: page ? Number.parseInt(page, 10) : 1,
      limit: limit ? Number.parseInt(limit, 10) : 24,
    });
  }
}
