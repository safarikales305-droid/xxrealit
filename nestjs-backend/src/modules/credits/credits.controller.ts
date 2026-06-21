import { Body, Controller, Get, Post, UseGuards, ValidationPipe } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { assertPropertySeekerCannotTopUp } from '../auth/assert-property-seeker';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreditsService } from './credits.service';
import { TopUpCreditDto } from './dto/top-up.dto';

@Controller('credits')
@UseGuards(JwtAuthGuard)
export class CreditsController {
  constructor(private readonly credits: CreditsService) {}

  @Get('balance')
  getBalance(@CurrentUser() user: AuthUser) {
    return this.credits.getBalance(user.id);
  }

  @Get('history')
  getHistory(@CurrentUser() user: AuthUser) {
    return this.credits.getHistory(user.id);
  }

  @Post('top-up')
  topUp(
    @CurrentUser() user: AuthUser,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: TopUpCreditDto,
  ) {
    assertPropertySeekerCannotTopUp(user);
    return this.credits.topUp(user.id, dto.amount);
  }
}
