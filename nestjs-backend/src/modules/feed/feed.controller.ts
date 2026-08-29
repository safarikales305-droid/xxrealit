import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { parsePublicPropertyListFiltersQuery } from '../properties/parse-public-property-filters.util';
import { FeedService } from './feed.service';
import { ShortsMixedFeedService } from './shorts-mixed-feed.service';

@Controller('feed')
export class FeedController {
  constructor(
    private readonly feedService: FeedService,
    private readonly mixedFeedService: ShortsMixedFeedService,
  ) {}

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

  @Get('shorts/feed')
  @UseGuards(OptionalJwtAuthGuard)
  getMixedShortsFeed(
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
    @Query('cursor') cursor?: string,
    @Query('limit') limitRaw?: string,
    @Query('target') target?: string,
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
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
    return this.mixedFeedService.getFeed({
      viewerId: user?.id,
      filters,
      cursor,
      limit: Number.isFinite(limit) ? limit : undefined,
      target: target?.trim() || undefined,
    });
  }

  @Get('shorts/item/:publicId')
  @UseGuards(OptionalJwtAuthGuard)
  async getShortsFeedItem(
    @CurrentUser() user: AuthUser | null,
    @Param('publicId') publicId: string,
  ) {
    const item = await this.mixedFeedService.resolveItemByPublicId(publicId, user?.id);
    if (!item) throw new NotFoundException('Short položka nenalezena');
    return item;
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
