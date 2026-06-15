import { Module, forwardRef } from '@nestjs/common';
import { CreditsModule } from '../credits/credits.module';
import { BonusCampaignAdminController } from './bonus-campaign-admin.controller';
import { BonusCampaignController } from './bonus-campaign.controller';
import { ReferralController } from './referral.controller';
import { BonusCampaignService } from './bonus-campaign.service';
import { ReferralService } from './referral.service';

@Module({
  imports: [forwardRef(() => CreditsModule)],
  controllers: [BonusCampaignController, BonusCampaignAdminController, ReferralController],
  providers: [BonusCampaignService, ReferralService],
  exports: [BonusCampaignService, ReferralService],
})
export class BonusCampaignModule {}
