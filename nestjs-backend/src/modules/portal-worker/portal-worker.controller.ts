import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateClientPreregistrationDto } from './dto/create-client-preregistration.dto';
import { PortalWorkerService } from './portal-worker.service';

@Controller('portal-worker')
@UseGuards(JwtAuthGuard)
export class PortalWorkerController {
  constructor(private readonly portalWorker: PortalWorkerService) {}

  @Get('me/dashboard')
  dashboard(@CurrentUser() user: AuthUser) {
    return this.portalWorker.getWorkerDashboard(user.id);
  }

  @Post('client-preregistrations')
  createPreregistration(
    @CurrentUser() user: AuthUser,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: CreateClientPreregistrationDto,
  ) {
    return this.portalWorker.createClientPreregistration(user.id, dto);
  }
}
