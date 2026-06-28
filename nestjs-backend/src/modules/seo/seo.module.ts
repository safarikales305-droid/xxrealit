import { Module } from '@nestjs/common';
import { SeoAdminController, SeoPublicController } from './seo.controller';
import { SeoService } from './seo.service';

@Module({
  controllers: [SeoPublicController, SeoAdminController],
  providers: [SeoService],
  exports: [SeoService],
})
export class SeoModule {}
