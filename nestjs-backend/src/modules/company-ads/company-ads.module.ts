import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CompanyAdsController } from './company-ads.controller';
import { CompanyAdsService } from './company-ads.service';

@Module({
  imports: [AuthModule],
  controllers: [CompanyAdsController],
  providers: [CompanyAdsService],
  exports: [CompanyAdsService],
})
export class CompanyAdsModule {}
