import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import { AdminGuard } from '../admin/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PortalWorkerService } from './portal-worker.service';
import { UpdateWorkerCommissionSettingsDto } from './dto/update-worker-commission-settings.dto';
import { UpdateWorkerProfileAdminDto } from './dto/worker-crm.dto';
import { PortalWorkerCrmService } from './portal-worker-crm.service';

@Controller('admin/portal-workers')
@UseGuards(JwtAuthGuard, AdminGuard)
export class PortalWorkerAdminController {
  constructor(
    private readonly portalWorker: PortalWorkerService,
    private readonly crm: PortalWorkerCrmService,
  ) {}

  @Get()
  list() {
    return this.portalWorker.listWorkersForAdmin();
  }

  @Post(':userId/approve')
  approve(@Param('userId') userId: string) {
    return this.portalWorker.setWorkerStatus(userId, 'approve');
  }

  @Post(':userId/reject')
  reject(@Param('userId') userId: string) {
    return this.portalWorker.setWorkerStatus(userId, 'reject');
  }

  @Post(':userId/suspend')
  suspend(@Param('userId') userId: string) {
    return this.portalWorker.setWorkerStatus(userId, 'suspend');
  }

  @Post(':userId/activate')
  activate(@Param('userId') userId: string) {
    return this.portalWorker.setWorkerStatus(userId, 'activate');
  }

  @Get('commissions')
  listCommissions(@Query('workerId') workerId?: string, @Query('status') status?: string) {
    return this.portalWorker.listCommissionsForAdmin({ workerId, status });
  }

  @Get('commissions/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  exportCommissions(
    @Res() res: Response,
    @Query('workerId') workerId?: string,
    @Query('status') status?: string,
  ) {
    return this.portalWorker.exportCommissionsCsv({ workerId, status }).then((csv) => {
      res.setHeader('Content-Disposition', 'attachment; filename="worker-commissions.csv"');
      res.send(csv);
    });
  }

  @Post('commissions/:id/mark-paid')
  markPaid(@Param('id') id: string) {
    return this.portalWorker.markCommissionPaid(id);
  }

  @Get('commission-settings')
  getSettings() {
    return this.portalWorker.getCommissionSettings();
  }

  @Patch('commission-settings')
  updateSettings(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: UpdateWorkerCommissionSettingsDto,
  ) {
    return this.portalWorker.updateCommissionSettings(dto);
  }

  @Get('commission-overview')
  commissionOverview() {
    return this.crm.listWorkersCommissionOverview();
  }

  @Get('commission-overview/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  exportCommissionOverview(@Res() res: Response) {
    return this.crm.exportWorkersCommissionCsv().then((csv) => {
      res.setHeader('Content-Disposition', 'attachment; filename="workers-commission-overview.csv"');
      res.send(csv);
    });
  }

  @Get('crm/clients')
  listCrmClients(
    @Query('workerId') workerId?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
  ) {
    return this.crm.listAllClientsAdmin({ workerId, status, q });
  }

  @Get(':userId/detail')
  getWorkerDetail(@Param('userId') userId: string) {
    return this.crm.getWorkerDetailAdmin(userId);
  }

  @Get(':userId/profile')
  getWorkerProfile(@Param('userId') userId: string) {
    return this.crm.getWorkerDetailAdmin(userId);
  }

  @Patch(':userId/profile')
  updateWorkerProfile(
    @Param('userId') userId: string,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: UpdateWorkerProfileAdminDto,
  ) {
    return this.crm.updateWorkerProfileAdmin(userId, dto);
  }
}
