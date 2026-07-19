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
import { RuianVfrController } from './ruian-vfr.controller';
import { RuianVfrService } from './ruian-vfr.service';
import { SeoLocationSyncCronService } from './seo-location-sync.cron.service';
import { SeoPublicListingsService } from './seo-public-listings.service';
import { SeoAdminCenterService } from './seo-admin-center.service';
import { SeoService } from './seo.service';

@Module({
  controllers: [SeoPublicController, SeoAdminController, SeoPublicListingsController, SeoLocationSourcesController, RuianVfrController],
  providers: [
    SeoService,
    ProgrammaticSeoService,
    SeoLocationService,
    SeoLocationSourceService,
    RuianVfrService,
    CsuDataStatService,
    RuianMapService,
    SeoLocationSyncCronService,
    SeoContentService,
    SeoAdminCenterService,
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
