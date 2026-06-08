import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BonusCampaignModule } from '../bonus-campaign/bonus-campaign.module';
import { RegistrationGateModule } from '../registration-gate/registration-gate.module';
import { PropertiesModule } from '../properties/properties.module';
import { TiparController } from './tipar.controller';
import { TipsController } from './tips.controller';
import { TiparService } from './tipar.service';

@Module({
  imports: [AuthModule, PropertiesModule, BonusCampaignModule, RegistrationGateModule],
  controllers: [TiparController, TipsController],
  providers: [TiparService],
  exports: [TiparService],
})
export class TiparModule {}
