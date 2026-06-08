import { Controller, Get } from '@nestjs/common';
import { BonusCampaignService } from './bonus-campaign.service';

@Controller('bonus-campaign')
export class BonusCampaignController {
  constructor(private readonly bonusCampaigns: BonusCampaignService) {}

  @Get('active')
  getActive() {
    return this.bonusCampaigns.getActiveForPublic();
  }
}
