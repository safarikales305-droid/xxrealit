import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import { TiparPayoutStatus } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/guards/admin.guard';
import { CreateTiparPayoutRequestDto, UpdateTiparPayoutStatusDto } from './dto/tipar-payout.dto';
import { TiparPayoutService } from './tipar-payout.service';

@Controller('tipar/payouts')
@UseGuards(JwtAuthGuard)
export class TiparPayoutController {
  constructor(private readonly payouts: TiparPayoutService) {}

  @Get('summary')
  summary(@CurrentUser() user: AuthUser) {
    return this.payouts.getSummary(user.id);
  }

  @Get('history')
  history(@CurrentUser() user: AuthUser) {
    return this.payouts.listHistory(user.id);
  }

  @Post('request')
  request(
    @CurrentUser() user: AuthUser,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: CreateTiparPayoutRequestDto,
  ) {
    return this.payouts.createRequest(user.id, dto);
  }
}

@Controller('admin/tipar-payouts')
@UseGuards(JwtAuthGuard, AdminGuard)
export class TiparPayoutAdminController {
  constructor(private readonly payouts: TiparPayoutService) {}

  @Get()
  list(@Query('status') status?: TiparPayoutStatus) {
    return this.payouts.listAdmin(status);
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: UpdateTiparPayoutStatusDto,
  ) {
    return this.payouts.updateStatus(user.id, id, dto);
  }
}
