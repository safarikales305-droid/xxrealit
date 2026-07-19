import { Module } from '@nestjs/common';
import { SeoAdminController, SeoPublicController } from './seo.controller';
import { GoogleIndexingService } from './google-indexing.service';
import { ProgrammaticSeoService } from './programmatic-seo.service';
import { SeoIndexQueueService } from './seo-index-queue.service';
import { SeoService } from './seo.service';

@Module({
  controllers: [SeoPublicController, SeoAdminController],
  providers: [SeoService, ProgrammaticSeoService, SeoIndexQueueService, GoogleIndexingService],
  exports: [SeoService, ProgrammaticSeoService, SeoIndexQueueService],
})
export class SeoModule {}
