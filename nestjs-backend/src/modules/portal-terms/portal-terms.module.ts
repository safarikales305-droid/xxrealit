import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PortalTermsAdminController } from './portal-terms-admin.controller';
import { PortalTermsController } from './portal-terms.controller';
import { PortalTermsService } from './portal-terms.service';

@Module({
  imports: [forwardRef(() => AuthModule)],
  controllers: [PortalTermsController, PortalTermsAdminController],
  providers: [PortalTermsService],
  exports: [PortalTermsService],
})
export class PortalTermsModule {}
