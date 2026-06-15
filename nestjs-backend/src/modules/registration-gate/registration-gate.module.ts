import { Module, forwardRef } from '@nestjs/common';
import { PropertiesModule } from '../properties/properties.module';
import { RegistrationGateAdminController } from './registration-gate-admin.controller';
import { RegistrationGateController } from './registration-gate.controller';
import { RegistrationGateService } from './registration-gate.service';
import { RegistrationRequirementsAdminController } from './registration-requirements-admin.controller';
import { RegistrationRequirementsController } from './registration-requirements.controller';
import { RegistrationRequirementsService } from './registration-requirements.service';

@Module({
  imports: [forwardRef(() => PropertiesModule)],
  controllers: [
    RegistrationGateController,
    RegistrationGateAdminController,
    RegistrationRequirementsController,
    RegistrationRequirementsAdminController,
  ],
  providers: [RegistrationGateService, RegistrationRequirementsService],
  exports: [RegistrationGateService, RegistrationRequirementsService],
})
export class RegistrationGateModule {}
