import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SupportCredentialEncryptionService } from './support-credential-encryption.service';
import { SupportEmailAdminController, SupportTicketInboundController } from './support-email-admin.controller';
import { SupportEmailMailboxService } from './support-email-mailbox.service';
import { SupportTicketInboundCronService } from './support-ticket-inbound.cron.service';
import { SupportTicketInboundService } from './support-ticket-inbound.service';
import { SupportTicketMailService } from './support-ticket-mail.service';
import { SupportTicketsAdminController } from './support-tickets-admin.controller';
import { SupportTicketsController } from './support-tickets.controller';
import { SupportTicketsService } from './support-tickets.service';

@Module({
  imports: [forwardRef(() => AuthModule)],
  controllers: [
    SupportTicketsController,
    SupportTicketsAdminController,
    SupportEmailAdminController,
    SupportTicketInboundController,
  ],
  providers: [
    SupportTicketsService,
    SupportCredentialEncryptionService,
    SupportEmailMailboxService,
    SupportTicketMailService,
    SupportTicketInboundService,
    SupportTicketInboundCronService,
  ],
  exports: [SupportTicketsService, SupportEmailMailboxService],
})
export class SupportTicketsModule {}
