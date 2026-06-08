import { Controller, Get } from '@nestjs/common';
import { RegistrationGateService } from './registration-gate.service';

@Controller('registration-gate')
export class RegistrationGateController {
  constructor(private readonly registrationGate: RegistrationGateService) {}

  @Get('settings')
  getPublicSettings() {
    return this.registrationGate.getPublicSettings();
  }
}
