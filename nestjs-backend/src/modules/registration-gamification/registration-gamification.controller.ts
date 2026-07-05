import {
  Body,
  Controller,
  Get,
  Post,
  ValidationPipe,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { RegistrationGamificationService } from './registration-gamification.service';
import {
  CheckGamificationEmailDto,
  RecordGamificationEventDto,
  SubmitGamificationLeadDto,
} from './dto/registration-gamification.dto';

@Controller('registration-gamification')
export class RegistrationGamificationController {
  constructor(private readonly service: RegistrationGamificationService) {}

  @Get('settings')
  getPublicSettings() {
    return this.service.getPublicSettings();
  }

  @Post('check-email')
  checkEmail(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: CheckGamificationEmailDto,
  ) {
    return this.service.checkEmail(dto.email);
  }

  @Post('submit-lead')
  submitLead(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: SubmitGamificationLeadDto,
    @Req() req: Request,
  ) {
    return this.service.submitLead(dto, req);
  }

  @Post('event')
  recordEvent(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: RecordGamificationEventDto,
  ) {
    return this.service.recordEvent(dto);
  }
}
