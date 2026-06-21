import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { AdminGuard } from '../admin/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreditsService } from './credits.service';
import { RejectTopUpDto } from './dto/reject-top-up.dto';
import { UpdateCreditSettingsDto } from './dto/update-credit-settings.dto';

@Controller('admin/credits')
@UseGuards(JwtAuthGuard, AdminGuard)
export class CreditsAdminController {
  constructor(private readonly credits: CreditsService) {}

  @Get('top-ups')
  listTopUps() {
    return this.credits.listTopUpsForAdmin();
  }

  @Patch('top-ups/:id/confirm')
  confirm(@Param('id') id: string) {
    return this.credits.confirmTopUp(id);
  }

  @Patch('top-ups/:id/reject')
  reject(
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: RejectTopUpDto,
  ) {
    return this.credits.rejectTopUp(id, dto.blockAccount ?? false);
  }

  @Patch('top-ups/:id/reverse')
  reverse(
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: RejectTopUpDto,
  ) {
    return this.credits.reverseTopUp(id, dto.blockAccount ?? false);
  }

  @Get('settings')
  getSettings() {
    return this.credits.getSettingsForAdmin();
  }

  @Patch('settings')
  updateSettings(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: UpdateCreditSettingsDto,
  ) {
    return this.credits.updateSettings(dto);
  }

  @Patch('users/:userId/verify')
  verifyUserCredit(@Param('userId') userId: string) {
    return this.credits.verifyUserCredit(userId);
  }

  @Patch('users/:userId/unverify')
  unverifyUserCredit(@Param('userId') userId: string) {
    return this.credits.unverifyUserCredit(userId);
  }

  @Post('users/:userId/recalculate')
  recalculateUserCredit(@Param('userId') userId: string) {
    return this.credits.recalculateUserCredit(userId);
  }

  @Post('fix-unauthorized-debts')
  fixUnauthorizedDebts() {
    return this.credits.fixUnauthorizedCreditDebts();
  }
}
