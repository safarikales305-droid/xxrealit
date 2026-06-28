import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import { AdminGuard } from '../admin/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdatePropertySeoDto, UpdateSeoSettingsDto } from './dto/seo.dto';
import { SeoService } from './seo.service';

@Controller('seo')
export class SeoPublicController {
  constructor(private readonly seo: SeoService) {}

  @Get('settings')
  getPublicSettings() {
    return this.seo.getPublicSettings();
  }

  @Get('sitemap')
  getSitemap(@Query('origin') origin?: string) {
    const base = origin?.trim() || 'https://xxrealit.cz';
    return this.seo.getSitemapEntries(base);
  }

  @Get('properties/by-slug/:slug')
  findBySlug(@Param('slug') slug: string) {
    return this.seo.findPropertyBySlug(slug);
  }
}

@Controller('admin/seo')
@UseGuards(JwtAuthGuard, AdminGuard)
export class SeoAdminController {
  constructor(private readonly seo: SeoService) {}

  @Get('settings')
  getSettings() {
    return this.seo.getSettings();
  }

  @Patch('settings')
  updateSettings(
    @Body(new ValidationPipe({ whitelist: true, transform: true })) dto: UpdateSeoSettingsDto,
  ) {
    return this.seo.updateSettings(dto);
  }

  @Get('health')
  getHealth() {
    return this.seo.getAdminHealth();
  }

  @Post('backfill-slugs')
  backfillSlugs() {
    return this.seo.backfillPropertySlugs();
  }

  @Get('properties/:id/suggest')
  suggest(@Param('id') id: string) {
    return this.seo.suggestPropertySeo(id);
  }

  @Patch('properties/:id')
  updatePropertySeo(
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true, transform: true })) dto: UpdatePropertySeoDto,
  ) {
    return this.seo.updatePropertySeo(id, dto);
  }
}
