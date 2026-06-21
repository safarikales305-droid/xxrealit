import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PropertySeekerAdminController } from './property-seeker-admin.controller';
import { PropertySeekerController } from './property-seeker.controller';
import { PropertySeekerService } from './property-seeker.service';

@Module({
  imports: [AuthModule],
  controllers: [PropertySeekerController, PropertySeekerAdminController],
  providers: [PropertySeekerService],
  exports: [PropertySeekerService],
})
export class PropertySeekerModule {}
