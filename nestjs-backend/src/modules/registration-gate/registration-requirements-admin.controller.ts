import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import type { UserRole } from '@prisma/client';
import { AdminGuard } from '../admin/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateRegistrationRequirementDto } from './dto/update-registration-requirement.dto';
import { RegistrationRequirementsService } from './registration-requirements.service';

@Controller('admin/registration-requirements')
@UseGuards(JwtAuthGuard, AdminGuard)
export class RegistrationRequirementsAdminController {
  constructor(private readonly requirements: RegistrationRequirementsService) {}

  @Get()
  list() {
    return this.requirements.listForAdmin();
  }

  @Patch(':role')
  update(
    @Param('role') role: UserRole,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: UpdateRegistrationRequirementDto,
  ) {
    return this.requirements.updateForRole(role, dto);
  }
}
