import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PostsModule } from '../posts/posts.module';
import { FacebookAuthService } from './facebook/facebook-auth.service';
import { FacebookController } from './facebook/facebook.controller';
import { FacebookPageController } from './facebook/facebook-page.controller';
import { FacebookConfigService } from './facebook/facebook-config.service';
import { FacebookPageService } from './facebook/facebook-page.service';
import { FacebookPageSyncService } from './facebook/facebook-page-sync.service';
import { FacebookWebhookController } from './facebook/facebook-webhook.controller';
import { FacebookService } from './facebook/facebook.service';
import { InstagramController } from './instagram/instagram.controller';
import { SocialPlatformStubService } from './social-platform.stub';
import { TiktokController } from './tiktok/tiktok.controller';
import { TokenEncryptionService } from './token-encryption.service';
import { YoutubeController } from './youtube/youtube.controller';

@Module({
  imports: [AuthModule, PostsModule],
  controllers: [
    FacebookController,
    FacebookPageController,
    FacebookWebhookController,
    TiktokController,
    YoutubeController,
    InstagramController,
  ],
  providers: [
    FacebookConfigService,
    FacebookAuthService,
    FacebookService,
    FacebookPageService,
    FacebookPageSyncService,
    TokenEncryptionService,
    SocialPlatformStubService,
  ],
  exports: [FacebookConfigService, FacebookService, FacebookPageService, FacebookPageSyncService],
})
export class SocialModule {}
