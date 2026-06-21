import { Body, Controller, Get, Param, Post, ValidationPipe } from '@nestjs/common';
import { CompleteWorkerReferralDto } from './dto/complete-worker-referral.dto';
import { PortalWorkerService } from './portal-worker.service';

@Controller('auth/worker-referral')
export class WorkerReferralAuthController {
  constructor(private readonly portalWorker: PortalWorkerService) {}

  @Get(':token')
  getByToken(@Param('token') token: string) {
    return this.portalWorker.getPreregistrationByToken(token);
  }

  @Post('complete')
  complete(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: CompleteWorkerReferralDto,
  ) {
    return this.portalWorker.completePreregistration(dto.token, dto.password, dto.name);
  }
}
