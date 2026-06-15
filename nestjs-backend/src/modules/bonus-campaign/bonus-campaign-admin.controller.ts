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
import { AdminGuard } from '../admin/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BonusCampaignService } from './bonus-campaign.service';
import { CreateBonusCampaignDto } from './dto/create-bonus-campaign.dto';
import { UpdateBonusCampaignDto } from './dto/update-bonus-campaign.dto';
import { ManualBonusGrantDto, ManualBonusRevokeDto } from './dto/manual-bonus.dto';

@Controller('admin/bonus-campaigns')
@UseGuards(JwtAuthGuard, AdminGuard)
export class BonusCampaignAdminController {
  constructor(private readonly bonusCampaigns: BonusCampaignService) {}

  @Get()
  list() {
    return this.bonusCampaigns.listForAdmin();
  }

  @Get('claims')
  listClaims(@Query('limit') limit?: string) {
    const n = limit ? Number.parseInt(limit, 10) : 200;
    return this.bonusCampaigns.listClaimsForAdmin(Number.isFinite(n) ? n : 200);
  }

  @Post('manual-grant')
  manualGrant(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: ManualBonusGrantDto,
  ) {
    return this.bonusCampaigns.manualGrant(dto);
  }

  @Post('manual-revoke')
  manualRevoke(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: ManualBonusRevokeDto,
  ) {
    return this.bonusCampaigns.manualRevoke(dto.claimId);
  }

  @Post()
  create(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: CreateBonusCampaignDto,
  ) {
    return this.bonusCampaigns.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: UpdateBonusCampaignDto,
  ) {
    return this.bonusCampaigns.update(id, dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.bonusCampaigns.delete(id);
  }
}
