import { Module, forwardRef } from '@nestjs/common';
import { MetaCenterModule } from '../meta-center/meta-center.module';
import { MetaCatalogAdminController } from './meta-catalog-admin.controller';
import { MetaCatalogPublicController } from './meta-catalog-public.controller';
import { MetaCatalogFeedService } from './meta-catalog-feed.service';
import { MetaCatalogLogService } from './meta-catalog-log.service';
import { MetaCatalogQualityService } from './meta-catalog-quality.service';
import { MetaCatalogSyncCronService } from './meta-catalog-sync.cron.service';
import { MetaCatalogSyncService } from './meta-catalog-sync.service';
import { MetaCatalogService } from './meta-catalog.service';
import { MetaCatalogImageVerifyService } from './meta-catalog-image-verify.service';

@Module({
  imports: [forwardRef(() => MetaCenterModule)],
  controllers: [MetaCatalogAdminController, MetaCatalogPublicController],
  providers: [
    MetaCatalogService,
    MetaCatalogFeedService,
    MetaCatalogLogService,
    MetaCatalogQualityService,
    MetaCatalogSyncService,
    MetaCatalogSyncCronService,
    MetaCatalogImageVerifyService,
  ],
  exports: [MetaCatalogService, MetaCatalogSyncService],
})
export class MetaCatalogModule {}
