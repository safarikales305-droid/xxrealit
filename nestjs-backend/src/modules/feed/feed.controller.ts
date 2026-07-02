import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { parsePublicPropertyListFiltersQuery } from '../properties/parse-public-property-filters.util';
import { FeedService } from './feed.service';

@Controller('feed')
export class FeedController {
  constructor(private readonly feedService: FeedService) {}

  @Get('shorts')
  @UseGuards(OptionalJwtAuthGuard)
  shorts(
    @CurrentUser() user: AuthUser | null,
    @Query('city') city?: string,
    @Query('cities') cities?: string,
    @Query('location') location?: string,
    @Query('propertyTypeKey') propertyTypeKey?: string,
    @Query('importCategoryKey') importCategoryKey?: string,
    @Query('sourcePortalKey') sourcePortalKey?: string,
    @Query('priceMin') priceMinRaw?: string,
    @Query('priceMax') priceMaxRaw?: string,
    @Query('tipsOnly') tipsOnlyRaw?: string,
  ) {
    const filters = parsePublicPropertyListFiltersQuery({
      city,
      cities,
      location,
      propertyTypeKey,
      importCategoryKey,
      sourcePortalKey,
      priceMinRaw,
      priceMaxRaw,
      tipsOnlyRaw,
    });
    return this.feedService.listShorts(user?.id, filters);
  }

  @Get('posts')
  posts() {
    return this.feedService.listPosts();
  }

  @Get('properties')
  properties() {
    return this.feedService.listProperties();
  }

  @UseGuards(JwtAuthGuard)
  @Get('personalized')
  personalized(@CurrentUser() user: AuthUser) {
    return this.feedService.getPersonalizedForUser(user.id);
  }
}
