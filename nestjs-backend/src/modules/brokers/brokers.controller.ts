import { Body, Controller, Get, Param, Post, UseGuards, ValidationPipe } from '@nestjs/common';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BrokersService } from './brokers.service';
import { UpsertBrokerReviewDto } from './dto/upsert-broker-review.dto';

@Controller('brokers')
export class BrokersController {
  constructor(private readonly brokersService: BrokersService) {}

  @UseGuards(JwtAuthGuard)
  @Get('public')
  listPublic() {
    return this.brokersService.listPublicDirectory();
  }

  @UseGuards(JwtAuthGuard)
  @Get('by-slug/:slug')
  getBySlug(@CurrentUser() user: AuthUser, @Param('slug') slug: string) {
    return this.brokersService.getPublicBySlug(slug, user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':brokerId/reviews')
  upsertReview(
    @CurrentUser() user: AuthUser,
    @Param('brokerId') brokerId: string,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: UpsertBrokerReviewDto,
  ) {
    return this.brokersService.upsertReview(brokerId, user.id, dto);
  }
}
