import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CreditsModule } from '../credits/credits.module';
import { EmailsModule } from '../emails/emails.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { PortalWorkerAdminController } from './portal-worker-admin.controller';
import { PortalWorkerCrmService } from './portal-worker-crm.service';
import { PortalWorkerController } from './portal-worker.controller';
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
  providers: [PortalWorkerService, PortalWorkerCrmService, PortalWorkerReminderCronService],
  exports: [PortalWorkerService, PortalWorkerCrmService],
})
export class PortalWorkerModule {}
