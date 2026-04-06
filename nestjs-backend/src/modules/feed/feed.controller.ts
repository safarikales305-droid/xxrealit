import { Controller, Get, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FeedService } from './feed.service';

@Controller('feed')
export class FeedController {
  constructor(private readonly feedService: FeedService) {}

  @Get('shorts')
  shorts() {
    return this.feedService.listShorts();
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
