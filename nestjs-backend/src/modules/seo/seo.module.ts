import { Module } from '@nestjs/common';
import { SeoAdminController, SeoPublicController } from './seo.controller';
import { GoogleIndexingService } from './google-indexing.service';
import { SeoIndexQueueService } from './seo-index-queue.service';
import { SeoService } from './seo.service';

@Module({
  controllers: [SeoPublicController, SeoAdminController],
  providers: [SeoService, SeoIndexQueueService, GoogleIndexingService],
  exports: [SeoService, SeoIndexQueueService],
})
export class SeoModule {}
