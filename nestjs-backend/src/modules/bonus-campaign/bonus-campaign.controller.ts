import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { BonusCampaignService } from './bonus-campaign.service';

@Controller('bonus-campaign')
export class BonusCampaignController {
  constructor(private readonly bonusCampaigns: BonusCampaignService) {}

  @Get('active')
  getActive() {
    return this.bonusCampaigns.getActiveForPublic();
  }

  @UseGuards(JwtAuthGuard)
  @Get('active-for-me')
  listForMe(@Request() req: { user: AuthUser }) {
    return this.bonusCampaigns.listActiveForUser(req.user.id);
  }
}
