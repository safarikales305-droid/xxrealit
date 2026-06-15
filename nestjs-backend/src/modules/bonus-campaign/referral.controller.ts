import { Body, Controller, Get, Post, Request, UseGuards, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { ReferralService } from './referral.service';
import { CreateReferralInviteDto } from './dto/create-referral-invite.dto';
import { BonusCampaignService } from './bonus-campaign.service';

@Controller('referral')
export class ReferralController {
  constructor(
    private readonly referral: ReferralService,
    private readonly bonusCampaigns: BonusCampaignService,
    private readonly config: ConfigService,
  ) {}

  private siteBase(): string {
    return (
      this.config.get<string>('PUBLIC_SITE_URL')?.trim() ||
      this.config.get<string>('FRONTEND_URL')?.trim() ||
      'https://www.xxrealit.cz'
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@Request() req: { user: AuthUser }) {
    return this.referral.getReferralInfo(req.user.id, this.siteBase());
  }

  @UseGuards(JwtAuthGuard)
  @Post('invites')
  async createInvite(
    @Request() req: { user: AuthUser },
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: CreateReferralInviteDto,
  ) {
    await this.referral.logInvite(req.user.id, dto.channel, dto.target ?? null);
    void this.bonusCampaigns.evaluateMarketingBonuses(req.user.id, dto.channel === 'EMAIL' ? 'INVITE_EMAIL' : 'INVITE_WHATSAPP');
    return { ok: true };
  }
}
