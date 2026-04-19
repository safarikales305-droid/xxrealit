import { Module } from '@nestjs/common';
import { ImportedBrokerContactsModule } from '../imported-broker-contacts/imported-broker-contact.module';
import { PropertiesModule } from '../properties/properties.module';
import { UploadModule } from '../upload/upload.module';
import { ImportImageService } from './import-image.service';
import { ImportSyncService } from './import-sync.service';
import { RealityCzSoapClientService } from './reality-cz-soap-client.service';
import { RealityCzSoapImporter } from './reality-cz-soap-importer.service';
import { RealityCzScraperImporter } from './reality-cz-scraper-importer.service';

@Module({
  imports: [PropertiesModule, UploadModule, ImportedBrokerContactsModule],
  providers: [
    ImportSyncService,
    ImportImageService,
    RealityCzSoapClientService,
    RealityCzSoapImporter,
    RealityCzScraperImporter,
  ],
  exports: [ImportSyncService, ImportedBrokerContactsModule],
})
export class ImportsModule {}

