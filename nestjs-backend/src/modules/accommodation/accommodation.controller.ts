import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { AccommodationService } from './accommodation.service';

@Controller('accommodations')
export class AccommodationController {
  constructor(private readonly accommodations: AccommodationService) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  list(
    @CurrentUser() user: AuthUser | null,
    @Query('q') q?: string,
    @Query('city') city?: string,
    @Query('category') category?: string,
    @Query('locationSlug') locationSlug?: string,
    @Query('priceMin') priceMin?: string,
    @Query('priceMax') priceMax?: string,
    @Query('ratingMin') ratingMin?: string,
    @Query('starsMin') starsMin?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('wifi') wifi?: string,
    @Query('parking') parking?: string,
    @Query('breakfast') breakfast?: string,
    @Query('wellness') wellness?: string,
    @Query('pool') pool?: string,
    @Query('pets') pets?: string,
    @Query('accessible') accessible?: string,
  ) {
    return this.accommodations.list(
      {
        query: q,
        city,
        category,
        locationSlug,
        priceMin: Number(priceMin) || undefined,
        priceMax: Number(priceMax) || undefined,
        ratingMin: Number(ratingMin) || undefined,
        starsMin: Number(starsMin) || undefined,
        page: Number(page) || 1,
        limit: Number(limit) || 20,
        wifi: wifi === '1' || wifi === 'true',
        parking: parking === '1' || parking === 'true',
        breakfast: breakfast === '1' || breakfast === 'true',
        wellness: wellness === '1' || wellness === 'true',
        pool: pool === '1' || pool === 'true',
        pets: pets === '1' || pets === 'true',
        accessible: accessible === '1' || accessible === 'true',
      },
      user?.id,
    );
  }

  @Get('map-markers')
  mapMarkers(
    @Query('q') q?: string,
    @Query('category') category?: string,
    @Query('city') city?: string,
  ) {
    return this.accommodations.getMapMarkers({ query: q, category, city });
  }

  @Get('favorites')
  @UseGuards(JwtAuthGuard)
  favorites(@CurrentUser() user: AuthUser) {
    return this.accommodations.listFavorites(user.id);
  }

  @Get(':slug')
  @UseGuards(OptionalJwtAuthGuard)
  detail(@Param('slug') slug: string, @CurrentUser() user: AuthUser | null) {
    return this.accommodations.getBySlug(slug, user?.id);
  }

  @Get(':slug/similar')
  similar(@Param('slug') slug: string) {
    return this.accommodations.getSimilar(slug);
  }

  @Get(':slug/availability')
  availability(
    @Param('slug') slug: string,
    @Query('checkIn') checkIn: string,
    @Query('checkOut') checkOut: string,
    @Query('guests') guests?: string,
  ) {
    return this.accommodations.checkAvailability(
      slug,
      checkIn,
      checkOut,
      Number(guests) || undefined,
    );
  }

  @Post(':id/favorite')
  @UseGuards(JwtAuthGuard)
  favorite(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.accommodations.toggleFavorite(user.id, id);
  }
}
