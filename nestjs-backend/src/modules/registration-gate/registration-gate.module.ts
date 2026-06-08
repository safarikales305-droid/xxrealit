import { Module } from '@nestjs/common';
import { PropertiesModule } from '../properties/properties.module';
import { RegistrationGateAdminController } from './registration-gate-admin.controller';
import { RegistrationGateController } from './registration-gate.controller';
import { RegistrationGateService } from './registration-gate.service';

@Module({
  imports: [PropertiesModule],
  controllers: [RegistrationGateController, RegistrationGateAdminController],
  providers: [RegistrationGateService],
  exports: [RegistrationGateService],
})
export class RegistrationGateModule {}
