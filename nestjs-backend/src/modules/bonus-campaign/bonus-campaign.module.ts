import { Module } from '@nestjs/common';
import { CreditsModule } from '../credits/credits.module';
import { BonusCampaignAdminController } from './bonus-campaign-admin.controller';
import { BonusCampaignController } from './bonus-campaign.controller';
import { BonusCampaignService } from './bonus-campaign.service';

@Module({
  imports: [CreditsModule],
  controllers: [BonusCampaignController, BonusCampaignAdminController],
  providers: [BonusCampaignService],
  exports: [BonusCampaignService],
})
export class BonusCampaignModule {}
