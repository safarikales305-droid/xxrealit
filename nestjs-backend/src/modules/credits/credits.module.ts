import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CreditsAdminController } from './credits-admin.controller';
import { CreditsController } from './credits.controller';
import { CreditsExpiryService } from './credits-expiry.service';
import { CreditsService } from './credits.service';

@Module({
  imports: [AuthModule],
  controllers: [CreditsController, CreditsAdminController],
  providers: [CreditsService, CreditsExpiryService],
  exports: [CreditsService],
})
export class CreditsModule {}
