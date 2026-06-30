import { Module } from '@nestjs/common';
import { EmailsModule } from '../emails/emails.module';
import { ImportedBrokerContactsModule } from '../imported-broker-contacts/imported-broker-contact.module';
import { EmailCampaignsAdminController } from './email-campaigns.admin.controller';
import { EmailCampaignsCronService } from './email-campaigns.cron.service';
import { EmailCampaignsService } from './email-campaigns.service';

@Module({
  imports: [EmailsModule, ImportedBrokerContactsModule],
  controllers: [EmailCampaignsAdminController],
  providers: [EmailCampaignsService, EmailCampaignsCronService],
  exports: [EmailCampaignsService],
})
export class EmailCampaignsModule {}
