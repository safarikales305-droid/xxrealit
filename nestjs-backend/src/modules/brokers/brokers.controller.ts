import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { parseBearerUserId } from '../auth/auth-token.util';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BrokersService } from './brokers.service';
import { UpsertBrokerReviewDto } from './dto/upsert-broker-review.dto';

@Controller('brokers')
export class BrokersController {
  constructor(
    private readonly brokersService: BrokersService,
    private readonly jwt: JwtService,
  ) {}

  @Get('public')
  listPublic() {
    return this.brokersService.listPublicDirectory();
  }

  @Get('by-slug/:slug')
  getBySlug(
    @Param('slug') slug: string,
    @Headers('authorization') auth?: string,
  ) {
    const viewerId = parseBearerUserId(this.jwt, auth);
    return this.brokersService.getPublicBySlug(slug, viewerId);
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
