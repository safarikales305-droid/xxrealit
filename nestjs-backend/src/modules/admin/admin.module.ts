import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminController } from './admin.controller';
import { AdminSeedService } from './admin-seed.service';
import { AdminService } from './admin.service';
import { AgentProfileModule } from '../agent-profile/agent-profile.module';
import { ImportsModule } from '../imports/imports.module';
import { PropertiesModule } from '../properties/properties.module';
import { TiparModule } from '../tipar/tipar.module';
import { ShareModule } from '../share/share.module';
import { ProfessionalVerificationModule } from '../professional-verification/professional-verification.module';
@Module({
  imports: [
    AuthModule,
    AgentProfileModule,
    ProfessionalVerificationModule,
    ImportsModule,
    PropertiesModule,
    TiparModule,
    ShareModule,
  ],
  controllers: [AdminController],
  providers: [AdminService, AdminSeedService],
})
export class AdminModule {}
