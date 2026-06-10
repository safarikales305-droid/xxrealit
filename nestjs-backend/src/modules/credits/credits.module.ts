import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CreditsAdminController } from './credits-admin.controller';
import { CreditsController } from './credits.controller';
import { CreditsExpiryService } from './credits-expiry.service';
import { CreditWalletService } from './credit-wallet.service';
import { CreditsService } from './credits.service';

@Module({
  imports: [AuthModule],
  controllers: [CreditsController, CreditsAdminController],
  providers: [CreditsService, CreditWalletService, CreditsExpiryService],
  exports: [CreditsService, CreditWalletService],
})
export class CreditsModule {}
