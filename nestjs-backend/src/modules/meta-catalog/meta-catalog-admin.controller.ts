import {
  Body,
  Controller,
  Get,
  Patch,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/guards/admin.guard';
import { UpdateMetaCatalogSettingDto } from './dto/meta-catalog.dto';
import { MetaCatalogService } from './meta-catalog.service';

@Controller('admin/meta-catalog')
@UseGuards(JwtAuthGuard, AdminGuard)
export class MetaCatalogAdminController {
  constructor(private readonly service: MetaCatalogService) {}

  @Get('settings')
  getSettings() {
    return this.service.getAdminSettings();
  }

  @Patch('settings')
  updateSettings(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: UpdateMetaCatalogSettingDto,
  ) {
    return this.service.updateSettings(dto);
  }

  @Get('preview-count')
  previewCount(
    @Query('city') city?: string,
    @Query('propertyType') propertyType?: string,
    @Query('priceMin') priceMin?: string,
    @Query('priceMax') priceMax?: string,
  ) {
    return this.service.previewCount({
      city,
      propertyType,
      priceMin: this.service.parsePrice(priceMin),
      priceMax: this.service.parsePrice(priceMax),
    });
  }

  @Get('listings')
  listListings(
    @Query('city') city?: string,
    @Query('propertyType') propertyType?: string,
    @Query('priceMin') priceMin?: string,
    @Query('priceMax') priceMax?: string,
    @Query('search') search?: string,
    @Query('take') takeRaw?: string,
  ) {
    const take = Number(takeRaw);
    return this.service.listAdminListings({
      city,
      propertyType,
      priceMin: this.service.parsePrice(priceMin),
      priceMax: this.service.parsePrice(priceMax),
      search,
      take: Number.isFinite(take) ? take : 50,
    });
  }

  @Get('carousel-export')
  carouselExport(
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
