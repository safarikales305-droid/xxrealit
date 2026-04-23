import { Module } from '@nestjs/common';
import { ApifyImportService } from './apify-import.service';
import { ApifyImportController } from './apify-import.controller';
import { ApifyImportQueueService } from './apify-import-queue.service';
import { ImportedBrokerContactsModule } from '../imported-broker-contacts/imported-broker-contact.module';
import { PropertiesModule } from '../properties/properties.module';
import { UploadModule } from '../upload/upload.module';
import { ImportImageService } from './import-image.service';
import { Century21DetailPlaywrightService } from './century21-detail-playwright.service';
import { Century21ListService } from './century21-list.service';
import { Century21ParserService } from './century21-parser.service';
import { ImportSyncService } from './import-sync.service';
import { RealityCzSoapClientService } from './reality-cz-soap-client.service';
import { RealityCzSoapImporter } from './reality-cz-soap-importer.service';
import { RealityCzScraperImporter } from './reality-cz-scraper-importer.service';
import { Century21ScraperImporter } from './century21-scraper-importer.service';

@Module({
  imports: [PropertiesModule, UploadModule, ImportedBrokerContactsModule],
  controllers: [ApifyImportController],
  providers: [
    ImportSyncService,
    ApifyImportService,
    ApifyImportQueueService,
    ImportImageService,
    RealityCzSoapClientService,
    RealityCzSoapImporter,
    RealityCzScraperImporter,
    Century21DetailPlaywrightService,
    Century21ListService,
    Century21ParserService,
    Century21ScraperImporter,
  ],
  exports: [ImportSyncService, ImportImageService, ImportedBrokerContactsModule],
})
export class ImportsModule {}

