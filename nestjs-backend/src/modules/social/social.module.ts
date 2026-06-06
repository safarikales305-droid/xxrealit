import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FacebookController } from './facebook/facebook.controller';
import { FacebookService } from './facebook/facebook.service';

@Module({
  imports: [AuthModule],
  controllers: [FacebookController],
  providers: [FacebookService],
  exports: [FacebookService],
})
export class SocialModule {}
