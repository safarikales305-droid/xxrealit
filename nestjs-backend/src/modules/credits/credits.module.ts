import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ListingContactUnlockModule } from '../properties/listing-contact-unlock.module';
import { CreditsAdminController } from './credits-admin.controller';
import { CreditsController } from './credits.controller';
import { CreditsExpiryService } from './credits-expiry.service';
import { CreditWalletService } from './credit-wallet.service';
import { CreditsService } from './credits.service';

@Module({
  imports: [
    forwardRef(() => AuthModule),
    forwardRef(() => ListingContactUnlockModule),
  ],
  controllers: [CreditsController, CreditsAdminController],
  providers: [CreditsService, CreditWalletService, CreditsExpiryService],
  exports: [CreditsService, CreditWalletService],
})
export class CreditsModule {}
