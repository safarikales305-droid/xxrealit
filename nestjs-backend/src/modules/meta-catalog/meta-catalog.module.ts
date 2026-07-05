import { Module } from '@nestjs/common';
import { MetaCatalogAdminController } from './meta-catalog-admin.controller';
import { MetaCatalogPublicController } from './meta-catalog-public.controller';
import { MetaCatalogService } from './meta-catalog.service';

@Module({
  controllers: [MetaCatalogAdminController, MetaCatalogPublicController],
  providers: [MetaCatalogService],
  exports: [MetaCatalogService],
})
export class MetaCatalogModule {}
