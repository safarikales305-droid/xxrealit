import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/guards/admin.guard';
import { RegistrationGamificationService } from './registration-gamification.service';
import { UpdateGameLeadStatusDto } from './dto/game-lead.dto';

@Controller('admin/game-leads')
@UseGuards(JwtAuthGuard, AdminGuard)
export class GameLeadsAdminController {
  constructor(private readonly service: RegistrationGamificationService) {}

  @Get('stats')
  getStats() {
    return this.service.getGameLeadStats();
  }

  @Get()
  listLeads(
    @Query('search') search?: string,
    @Query('visitorType') visitorType?: string,
    @Query('status') status?: string,
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
      status: typeof status === 'string' ? status : undefined,
      registered: parseBool(registered),
      skip: Number.isFinite(skip) ? skip : 0,
      take: Number.isFinite(take) ? take : 40,
    });
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: UpdateGameLeadStatusDto,
  ) {
    return this.service.updateLeadStatus(id, dto.status);
  }

  @Post('mark-seen')
  markSeen() {
    return this.service.markNewLeadsAsSeen();
  }
}
