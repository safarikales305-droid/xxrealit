import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import type { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { RegistrationRequirementsService } from './registration-requirements.service';

@Controller('registration-requirements')
export class RegistrationRequirementsController {
  constructor(private readonly requirements: RegistrationRequirementsService) {}

  @UseGuards(JwtAuthGuard)
  @Get('status')
  async status(@Request() req: { user: AuthUser }) {
    return this.requirements.getStatusForUser(
      req.user.id,
      req.user.role as UserRole,
    );
  }
}
