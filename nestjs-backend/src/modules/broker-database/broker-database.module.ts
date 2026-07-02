import { Module } from '@nestjs/common';
import { ImportedBrokerContactsModule } from '../imported-broker-contacts/imported-broker-contact.module';
import { EmailCampaignsModule } from '../email-campaigns/email-campaigns.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { BrokerDatabaseController } from './broker-database.controller';
import { BrokerDatabaseImportService } from './broker-database-import.service';
import { RealitniEsoParserService } from './realitni-eso-parser.service';

@Module({
  imports: [ImportedBrokerContactsModule, EmailCampaignsModule, WhatsAppModule],
  controllers: [BrokerDatabaseController],
  providers: [BrokerDatabaseImportService, RealitniEsoParserService],
})
export class BrokerDatabaseModule {}
