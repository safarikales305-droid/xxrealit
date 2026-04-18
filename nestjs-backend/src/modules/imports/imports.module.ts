import { Module } from '@nestjs/common';
import { ImportSyncService } from './import-sync.service';
import { RealityCzSoapClientService } from './reality-cz-soap-client.service';
import { RealityCzSoapImporter } from './reality-cz-soap-importer.service';
import { RealityCzScraperImporter } from './reality-cz-scraper-importer.service';

@Module({
  providers: [
    ImportSyncService,
    RealityCzSoapClientService,
    RealityCzSoapImporter,
    RealityCzScraperImporter,
  ],
  exports: [ImportSyncService],
})
export class ImportsModule {}

