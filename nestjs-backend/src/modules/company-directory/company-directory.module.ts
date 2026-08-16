import { Module } from '@nestjs/common';
import { BrokersModule } from '../brokers/brokers.module';
import { AresService } from './ares.service';
import { CompanyClaimService } from './company-claim.service';
import { CompanyDirectoryAdminController } from './company-directory-admin.controller';
import { CompanyDirectoryPublicController } from './company-directory-public.controller';
import { CompanyDirectoryService } from './company-directory.service';
import { CompanyImportService } from './company-import.service';
import { GooglePlacesReputationProvider } from './google-places-reputation.provider';
import { COMPANY_REPUTATION_PROVIDER } from './company-reputation.provider';

@Module({
  imports: [BrokersModule],
  controllers: [CompanyDirectoryPublicController, CompanyDirectoryAdminController],
  providers: [
    AresService,
    CompanyDirectoryService,
    CompanyImportService,
    CompanyClaimService,
    GooglePlacesReputationProvider,
    {
      provide: COMPANY_REPUTATION_PROVIDER,
      useExisting: GooglePlacesReputationProvider,
    },
  ],
  exports: [CompanyDirectoryService, AresService, CompanyImportService],
})
export class CompanyDirectoryModule {}
