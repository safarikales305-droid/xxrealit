import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PortalTestingAdminController } from './portal-testing-admin.controller';
import { PortalTestingService } from './portal-testing.service';

@Module({
  imports: [forwardRef(() => AuthModule)],
  controllers: [PortalTestingAdminController],
  providers: [PortalTestingService],
  exports: [PortalTestingService],
})
export class PortalTestingModule {}
