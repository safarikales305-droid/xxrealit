import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PortalPresentationAdminController } from './portal-presentation-admin.controller';
import { PortalPresentationController } from './portal-presentation.controller';
import { PortalPresentationService } from './portal-presentation.service';

@Module({
  imports: [forwardRef(() => AuthModule)],
  controllers: [PortalPresentationController, PortalPresentationAdminController],
  providers: [PortalPresentationService],
  exports: [PortalPresentationService],
})
export class PortalPresentationModule {}
