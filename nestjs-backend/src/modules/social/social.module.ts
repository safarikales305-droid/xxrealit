import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FacebookController } from './facebook/facebook.controller';
import { FacebookService } from './facebook/facebook.service';
import { InstagramController } from './instagram/instagram.controller';
import { SocialPlatformStubService } from './social-platform.stub';
import { TiktokController } from './tiktok/tiktok.controller';
import { YoutubeController } from './youtube/youtube.controller';

@Module({
  imports: [AuthModule],
  controllers: [FacebookController, TiktokController, YoutubeController, InstagramController],
  providers: [FacebookService, SocialPlatformStubService],
  exports: [FacebookService],
})
export class SocialModule {}
