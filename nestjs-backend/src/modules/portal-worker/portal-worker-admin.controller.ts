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

@Controller('admin/portal-workers')
@UseGuards(JwtAuthGuard, AdminGuard)
export class PortalWorkerAdminController {
  constructor(private readonly portalWorker: PortalWorkerService) {}

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
}
