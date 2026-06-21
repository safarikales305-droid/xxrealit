import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WebPushController } from './web-push.controller';
import { WebPushService } from './web-push.service';

@Global()
@Module({
  imports: [AuthModule],
  controllers: [WebPushController],
  providers: [WebPushService],
  exports: [WebPushService],
})
export class WebPushModule {}
