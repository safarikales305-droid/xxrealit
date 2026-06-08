import { Module } from '@nestjs/common';
import { BonusCampaignAdminController } from './bonus-campaign-admin.controller';
import { BonusCampaignController } from './bonus-campaign.controller';
import { BonusCampaignService } from './bonus-campaign.service';

@Module({
  controllers: [BonusCampaignController, BonusCampaignAdminController],
  providers: [BonusCampaignService],
  exports: [BonusCampaignService],
})
export class BonusCampaignModule {}
