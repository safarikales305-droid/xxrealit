import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/guards/admin.guard';
import { RegistrationGamificationService } from './registration-gamification.service';
import { UpdateRegistrationGamificationDto } from './dto/registration-gamification.dto';

@Controller('admin/registration-gamification')
@UseGuards(JwtAuthGuard, AdminGuard)
export class RegistrationGamificationAdminController {
  constructor(private readonly service: RegistrationGamificationService) {}

  @Get('settings')
  getSettings() {
    return this.service.getAdminSettings();
  }

  @Patch('settings')
  updateSettings(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: UpdateRegistrationGamificationDto,
  ) {
    return this.service.updateSettings(dto);
  }

  @Get('stats')
  getStats() {
    return this.service.getStats();
  }

  @Get('leads')
  listLeads(
    @Query('search') search?: string,
    @Query('visitorType') visitorType?: string,
    @Query('registered') registered?: string,
    @Query('skip') skipRaw?: string,
    @Query('take') takeRaw?: string,
  ) {
    const parseBool = (v?: string): boolean | undefined => {
      if (v === '1' || v === 'true') return true;
      if (v === '0' || v === 'false') return false;
      return undefined;
    };
    const skip = Number(skipRaw);
    const take = Number(takeRaw);
    return this.service.listLeads({
      search: typeof search === 'string' ? search : undefined,
      visitorType: typeof visitorType === 'string' ? visitorType : undefined,
      registered: parseBool(registered),
      skip: Number.isFinite(skip) ? skip : 0,
      take: Number.isFinite(take) ? take : 40,
    });
  }

  @Delete('leads')
  deleteLeads(@Body('ids') ids: string[]) {
    return this.service.deleteLeads(Array.isArray(ids) ? ids.map(String) : []);
  }

  @Get('leads/export-csv')
  async exportCsv(
    @Res() res: Response,
    @Query('search') search?: string,
    @Query('visitorType') visitorType?: string,
    @Query('registered') registered?: string,
  ) {
    const parseBool = (v?: string): boolean | undefined => {
      if (v === '1' || v === 'true') return true;
      if (v === '0' || v === 'false') return false;
      return undefined;
    };
    const body = await this.service.exportLeadsCsv({
      search: typeof search === 'string' ? search : undefined,
      visitorType: typeof visitorType === 'string' ? visitorType : undefined,
      registered: parseBool(registered),
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="gamification-leads.csv"',
    );
    res.send(body);
  }
}
