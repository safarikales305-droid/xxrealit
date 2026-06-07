import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PropertiesModule } from '../properties/properties.module';
import { ShareGateVideoAdminController } from './share-gate-video-admin.controller';
import { ShareGateVideoPublicController } from './share-gate-video.controller';
import { ShareGateVideoService } from './share-gate-video.service';

@Module({
  imports: [AuthModule, PropertiesModule],
  controllers: [ShareGateVideoAdminController, ShareGateVideoPublicController],
  providers: [ShareGateVideoService],
  exports: [ShareGateVideoService],
})
export class ShareGateVideoModule {}
