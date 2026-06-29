import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CreditsModule } from '../credits/credits.module';
import { EmailsModule } from '../emails/emails.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { PortalWorkerAdminController } from './portal-worker-admin.controller';
import { PortalWorkerCommunicationService } from './portal-worker-communication.service';
import { PortalWorkerCrmService } from './portal-worker-crm.service';
import { PortalWorkerController } from './portal-worker.controller';
import { PortalWorkerProfileReminderCronService } from './portal-worker-profile-reminder.cron.service';
import { PortalWorkerReminderCronService } from './portal-worker-reminder.cron.service';
import { PortalWorkerService } from './portal-worker.service';
import { WorkerReferralAuthController } from './worker-referral-auth.controller';

@Module({
  imports: [
    forwardRef(() => AuthModule),
    forwardRef(() => CreditsModule),
    EmailsModule,
    WhatsAppModule,
  ],
  controllers: [
    PortalWorkerAdminController,
    PortalWorkerController,
    WorkerReferralAuthController,
  ],
  providers: [
    PortalWorkerService,
    PortalWorkerCrmService,
    PortalWorkerCommunicationService,
    PortalWorkerReminderCronService,
    PortalWorkerProfileReminderCronService,
  ],
  exports: [PortalWorkerService, PortalWorkerCrmService, PortalWorkerCommunicationService],
})
export class PortalWorkerModule {}
