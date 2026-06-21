import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { WebPushModule } from '../web-push/web-push.module';
import {
  MarketingPopupAdminController,
  MarketingPopupController,
  PwaPushCampaignAdminController,
} from './marketing-onboarding.controller';
import { MarketingPopupService } from './marketing-popup.service';
import { PwaPushCampaignService } from './pwa-push-campaign.service';
import { PwaPushCampaignCronService } from './pwa-push-campaign.cron.service';

@Module({
  imports: [UsersModule, WebPushModule],
  controllers: [
    MarketingPopupAdminController,
    PwaPushCampaignAdminController,
    MarketingPopupController,
  ],
  providers: [MarketingPopupService, PwaPushCampaignService, PwaPushCampaignCronService],
  exports: [MarketingPopupService, PwaPushCampaignService],
})
export class MarketingOnboardingModule {}
