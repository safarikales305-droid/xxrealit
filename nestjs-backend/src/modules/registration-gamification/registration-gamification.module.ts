import { Module } from '@nestjs/common';
import { ImportedBrokerContactsModule } from '../imported-broker-contacts/imported-broker-contact.module';
import { RegistrationGamificationAdminController } from './registration-gamification-admin.controller';
import { RegistrationGamificationController } from './registration-gamification.controller';
import { RegistrationGamificationService } from './registration-gamification.service';

@Module({
  imports: [ImportedBrokerContactsModule],
  controllers: [RegistrationGamificationController, RegistrationGamificationAdminController],
  providers: [RegistrationGamificationService],
  exports: [RegistrationGamificationService],
})
export class RegistrationGamificationModule {}
