import { Controller, Get, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { FeedService } from './feed.service';

@Controller('feed')
export class FeedController {
  constructor(private readonly feedService: FeedService) {}

  @Get('shorts')
  @UseGuards(OptionalJwtAuthGuard)
  shorts(@CurrentUser() user: AuthUser | null) {
    return this.feedService.listShorts(user?.id);
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
