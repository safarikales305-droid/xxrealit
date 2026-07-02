import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/guards/admin.guard';
import {
  CreateLeadPriceDto,
  UpdateLeadPriceDto,
  UpdatePublicPortalStatsDto,
  UpsertPublicPortalMonthlyStatDto,
} from './dto/o-portalu.dto';
import { OPortaluService } from './o-portalu.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class OPortaluAdminController {
  constructor(private readonly oPortalu: OPortaluService) {}

  @Get('o-portalu/stats')
  getStats() {
    return this.oPortalu.getAdminStats();
  }

  @Put('o-portalu/stats')
  updateStats(@Body() body: UpdatePublicPortalStatsDto) {
    return this.oPortalu.updateAdminStats({
      stats: body.stats,
      monthly: body.monthly,
    });
  }

  @Delete('o-portalu/stats/monthly/:id')
  deleteMonthly(@Param('id') id: string) {
    return this.oPortalu.deleteMonthlyStat(id);
  }

  @Get('lead-prices')
  listLeadPrices() {
    return this.oPortalu.listLeadPricesAdmin();
  }

  @Post('lead-prices')
  createLeadPrice(@Body() body: CreateLeadPriceDto) {
    return this.oPortalu.createLeadPrice(body);
  }

  @Put('lead-prices/:id')
  updateLeadPrice(@Param('id') id: string, @Body() body: UpdateLeadPriceDto) {
    return this.oPortalu.updateLeadPrice(id, body);
  }

  @Delete('lead-prices/:id')
  deleteLeadPrice(@Param('id') id: string) {
    return this.oPortalu.deleteLeadPrice(id);
  }
}
