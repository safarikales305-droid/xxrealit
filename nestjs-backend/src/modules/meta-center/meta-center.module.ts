import { Module } from '@nestjs/common';
import { MetaCatalogModule } from '../meta-catalog/meta-catalog.module';
import { SocialModule } from '../social/social.module';
import { MetaCenterAdminController } from './meta-center-admin.controller';
import { MetaCenterPublicController } from './meta-center-public.controller';
import { MetaCenterService } from './meta-center.service';

@Module({
  imports: [MetaCatalogModule, SocialModule],
  controllers: [MetaCenterAdminController, MetaCenterPublicController],
  providers: [MetaCenterService],
  exports: [MetaCenterService],
})
export class MetaCenterModule {}
