import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PropertiesModule } from '../properties/properties.module';
import { CreditsAdminController } from './credits-admin.controller';
import { CreditsController } from './credits.controller';
import { CreditsExpiryService } from './credits-expiry.service';
import { CreditWalletService } from './credit-wallet.service';
import { CreditsService } from './credits.service';

@Module({
  imports: [forwardRef(() => AuthModule), forwardRef(() => PropertiesModule)],
  controllers: [CreditsController, CreditsAdminController],
  providers: [CreditsService, CreditWalletService, CreditsExpiryService],
  exports: [CreditsService, CreditWalletService],
})
export class CreditsModule {}
