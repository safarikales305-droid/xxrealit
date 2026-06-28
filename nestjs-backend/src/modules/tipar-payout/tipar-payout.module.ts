import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CreditsModule } from '../credits/credits.module';
import { EmailsModule } from '../emails/emails.module';
import { TiparPayoutAdminController, TiparPayoutController } from './tipar-payout.controller';
import { TiparPayoutService } from './tipar-payout.service';

@Module({
  imports: [AuthModule, CreditsModule, EmailsModule],
  controllers: [TiparPayoutController, TiparPayoutAdminController],
  providers: [TiparPayoutService],
  exports: [TiparPayoutService],
})
export class TiparPayoutModule {}
