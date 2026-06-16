import { Module } from '@nestjs/common';
import { EmailsModule } from '../emails/emails.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { ActivityLogService } from './activity-log.service';
import { CommunicationController } from './communication.controller';
import { CommunicationEmailService } from './communication-email.service';
import { CommunicationWhatsAppService } from './communication-whatsapp.service';
import { CrmContactsService } from './crm-contacts.service';
import { MarketingCampaignsService } from './marketing-campaigns.service';

@Module({
  imports: [WhatsAppModule, EmailsModule],
  controllers: [CommunicationController],
  providers: [
    ActivityLogService,
    CommunicationWhatsAppService,
    CommunicationEmailService,
    CrmContactsService,
    MarketingCampaignsService,
  ],
  exports: [ActivityLogService],
})
export class CommunicationModule {}
