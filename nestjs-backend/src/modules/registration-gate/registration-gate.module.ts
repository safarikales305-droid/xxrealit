import { Module, forwardRef } from '@nestjs/common';
import { PropertiesModule } from '../properties/properties.module';
import { RegistrationGateAdminController } from './registration-gate-admin.controller';
import { RegistrationGateController } from './registration-gate.controller';
import { RegistrationGateService } from './registration-gate.service';

@Module({
  imports: [forwardRef(() => PropertiesModule)],
  controllers: [RegistrationGateController, RegistrationGateAdminController],
  providers: [RegistrationGateService],
  exports: [RegistrationGateService],
})
export class RegistrationGateModule {}
