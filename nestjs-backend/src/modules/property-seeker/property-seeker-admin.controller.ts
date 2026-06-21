import { Controller, Get, Header, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AdminGuard } from '../admin/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PropertySeekerService } from './property-seeker.service';

@Controller('admin/property-seekers')
@UseGuards(JwtAuthGuard, AdminGuard)
export class PropertySeekerAdminController {
  constructor(private readonly propertySeeker: PropertySeekerService) {}

  @Get()
  list() {
    return this.propertySeeker.listForAdmin();
  }

  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async export(@Res() res: Response) {
    const csv = await this.propertySeeker.exportCsv();
    res.setHeader('Content-Disposition', 'attachment; filename="property-seekers.csv"');
    res.send(csv);
  }
}
