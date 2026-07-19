import { Module } from '@nestjs/common';
import { SeoAdminController, SeoPublicController } from './seo.controller';
import { GoogleIndexingService } from './google-indexing.service';
import { ProgrammaticSeoService } from './programmatic-seo.service';
import { SeoContentService } from './seo-content.service';
import { SeoIndexQueueService } from './seo-index-queue.service';
import { SeoLocationService } from './seo-location.service';
import { SeoPublicListingsController } from './seo-public-listings.controller';
import { SeoPublicListingsService } from './seo-public-listings.service';
import { SeoAdminCenterService } from './seo-admin-center.service';
import { SeoService } from './seo.service';

@Module({
  controllers: [SeoPublicController, SeoAdminController, SeoPublicListingsController],
  providers: [
    SeoService,
    ProgrammaticSeoService,
    SeoLocationService,
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
