import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UploadModule } from '../upload/upload.module';
import { PromoProfilesController } from './promo-profiles.controller';
import { PromoProfilesAdminController } from './promo-profiles-admin.controller';
import { PromoProfilesService } from './promo-profiles.service';

@Module({
  imports: [AuthModule, UploadModule],
  controllers: [PromoProfilesController, PromoProfilesAdminController],
  providers: [PromoProfilesService],
  exports: [PromoProfilesService],
})
export class PromoProfilesModule {}
