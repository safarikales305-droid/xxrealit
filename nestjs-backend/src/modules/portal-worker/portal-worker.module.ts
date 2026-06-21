import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EmailsModule } from '../emails/emails.module';
import { PortalWorkerAdminController } from './portal-worker-admin.controller';
import { PortalWorkerController } from './portal-worker.controller';
import { PortalWorkerService } from './portal-worker.service';
import { WorkerReferralAuthController } from './worker-referral-auth.controller';

@Module({
  imports: [forwardRef(() => AuthModule), EmailsModule],
  controllers: [
    PortalWorkerAdminController,
    PortalWorkerController,
    WorkerReferralAuthController,
  ],
  providers: [PortalWorkerService],
  exports: [PortalWorkerService],
})
export class PortalWorkerModule {}
