import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { MetaCatalogService } from './meta-catalog.service';

@Controller('public')
export class MetaCatalogPublicController {
  constructor(private readonly service: MetaCatalogService) {}

  @Get('meta-catalog-feed.csv')
  async feedCsv(@Res() res: Response) {
    const body = await this.service.buildCsvFeed();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(body);
  }

  @Get('meta-carousel-listings.json')
  async carouselJson(
    @Query('city') city?: string,
    @Query('propertyType') propertyType?: string,
    @Query('priceMin') priceMin?: string,
    @Query('priceMax') priceMax?: string,
    @Query('ids') idsRaw?: string,
  ) {
    const ids = idsRaw
      ? idsRaw.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;
    return this.service.buildCarouselJson({
      city,
      propertyType,
      priceMin: this.service.parsePrice(priceMin),
      priceMax: this.service.parsePrice(priceMax),
      ids,
    });
  }
}
