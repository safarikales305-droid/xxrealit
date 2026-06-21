import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/guards/admin.guard';
import { UsersService } from '../users/users.service';
import { CreateMarketingPopupDto } from './dto/create-marketing-popup.dto';
import { UpdateMarketingPopupDto } from './dto/update-marketing-popup.dto';
import {
  CreatePwaPushCampaignDto,
  UpdatePwaPushCampaignDto,
} from './dto/pwa-push-campaign.dto';
import { MarketingPopupService } from './marketing-popup.service';
import { PwaPushCampaignService } from './pwa-push-campaign.service';

@Controller('admin/marketing-popups')
@UseGuards(JwtAuthGuard, AdminGuard)
export class MarketingPopupAdminController {
  constructor(private readonly popups: MarketingPopupService) {}

  @Get()
  list() {
    return this.popups.listAdmin();
  }

  @Post()
  create(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: CreateMarketingPopupDto,
  ) {
    return this.popups.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: UpdateMarketingPopupDto,
  ) {
    return this.popups.update(id, dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.popups.delete(id);
  }
}

@Controller('admin/pwa-push-campaigns')
@UseGuards(JwtAuthGuard, AdminGuard)
export class PwaPushCampaignAdminController {
  constructor(private readonly campaigns: PwaPushCampaignService) {}

  @Get()
  list() {
    return this.campaigns.listAdmin();
  }

  @Post()
  create(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: CreatePwaPushCampaignDto,
  ) {
    return this.campaigns.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: UpdatePwaPushCampaignDto,
  ) {
    return this.campaigns.update(id, dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.campaigns.delete(id);
  }

  @Post(':id/send')
  sendNow(@Param('id') id: string) {
    return this.campaigns.sendNow(id);
  }
}

@Controller('marketing-popups')
@UseGuards(JwtAuthGuard)
export class MarketingPopupController {
  constructor(
    private readonly popups: MarketingPopupService,
    private readonly users: UsersService,
  ) {}

  @Get('eligible')
  async eligible(
    @CurrentUser() user: AuthUser,
    @Query('justRegistered') justRegistered?: string,
    @Query('justLoggedIn') justLoggedIn?: string,
    @Query('isPwaInstalled') isPwaInstalled?: string,
  ) {
    const me = await this.users.getMeProfile(user.id);
    if (!me) return [];
    const checklist = me.profileRequirements?.checklist ?? [];
    const profileComplete = checklist.every((item) => item.satisfied);
    return this.popups.listEligible({
      role: String(me.role ?? user.role),
      emailVerified: Boolean(me.emailVerified),
      whatsappVerified: Boolean(me.whatsappVerified),
      isTipar: Boolean(me.isTipar),
      profileComplete,
      isPwaInstalled: isPwaInstalled === '1' || isPwaInstalled === 'true',
      justRegistered: justRegistered === '1' || justRegistered === 'true',
      justLoggedIn: justLoggedIn === '1' || justLoggedIn === 'true',
    });
  }
}
