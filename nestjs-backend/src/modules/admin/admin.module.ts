import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminController } from './admin.controller';
import { AdminSeedService } from './admin-seed.service';
import { AdminService } from './admin.service';
import { AgentProfileModule } from '../agent-profile/agent-profile.module';
import { ImportsModule } from '../imports/imports.module';

@Module({
  imports: [AuthModule, AgentProfileModule, ImportsModule],
  controllers: [AdminController],
  providers: [AdminService, AdminSeedService],
})
export class AdminModule {}
