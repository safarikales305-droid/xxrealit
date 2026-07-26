import { Module } from '@nestjs/common';
import { SeoAdminController, SeoPublicController } from './seo.controller';
import { GoogleIndexingService } from './google-indexing.service';
import { ProgrammaticSeoService } from './programmatic-seo.service';
import { SeoContentService } from './seo-content.service';
import { SeoIndexQueueService } from './seo-index-queue.service';
import { SeoLocationService } from './seo-location.service';
import { SeoLocationSourcesController } from './seo-location-sources.controller';
import { SeoLocationSourceService } from './seo-location-source.service';
import { SeoPublicListingsController } from './seo-public-listings.controller';
import { CsuDataStatService } from './csu-datastat.service';
import { RuianMapService } from './ruian-map.service';
import { RuianImportJobService } from './ruian-import-job.service';
import { RuianVfrController } from './ruian-vfr.controller';
import { RuianVfrService } from './ruian-vfr.service';
import { SeoLocationSyncCronService } from './seo-location-sync.cron.service';
import { SeoPublicListingsService } from './seo-public-listings.service';
import { SeoAdminCenterService } from './seo-admin-center.service';
import { SeoGenerationJobService } from './seo-generation-job.service';
import { SeoIndexabilityService } from './seo-indexability.service';
import { SeoService } from './seo.service';

@Module({
  controllers: [SeoPublicController, SeoAdminController, SeoPublicListingsController, SeoLocationSourcesController, RuianVfrController],
  providers: [
    SeoService,
    ProgrammaticSeoService,
    SeoLocationService,
    SeoLocationSourceService,
    RuianVfrService,
    RuianImportJobService,
    CsuDataStatService,
    RuianMapService,
    SeoLocationSyncCronService,
    SeoContentService,
    SeoAdminCenterService,
    SeoGenerationJobService,
    SeoIndexabilityService,
    SeoPublicListingsService,
    SeoIndexQueueService,
    GoogleIndexingService,
  ],
  exports: [
    SeoService,
    ProgrammaticSeoService,
    SeoLocationService,
    SeoIndexQueueService,
    SeoPublicListingsService,
  ],
})
export class SeoModule {}
