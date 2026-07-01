import { Module, forwardRef } from '@nestjs/common';
import { SocialModule } from '../social.module';
import { TokenEncryptionService } from '../token-encryption.service';
import { TiktokController } from './tiktok.controller';
import { TikTokPublicVideoController } from './tiktok-public-video.controller';
import { TikTokApiClient } from './tiktok-api.client';
import { TikTokConfigService } from './tiktok.config.service';
import { TikTokOAuthService } from './tiktok-oauth.service';
import { TikTokPublisherService } from './tiktok-publisher.service';
import { TikTokQueueCronService } from './tiktok-queue.cron.service';
import { TikTokQueueService } from './tiktok-queue.service';
import { TikTokSettingsService } from './tiktok-settings.service';
import { TikTokTokenService } from './tiktok-token.service';
import { TikTokVideoUrlService } from './tiktok-video-url.service';

/**
 * TikTok integrace — exportuje služby potřebné v PropertiesModule a SocialModule.
 * forwardRef(SocialModule): fronta potřebuje SocialAutopostSettingsService.
 */
@Module({
  imports: [forwardRef(() => SocialModule)],
  controllers: [TiktokController, TikTokPublicVideoController],
  providers: [
    TikTokConfigService,
    TikTokApiClient,
    TikTokTokenService,
    TokenEncryptionService,
    TikTokOAuthService,
    TikTokSettingsService,
    TikTokVideoUrlService,
    TikTokPublisherService,
    TikTokQueueService,
    TikTokQueueCronService,
  ],
  exports: [
    TikTokConfigService,
    TikTokOAuthService,
    TikTokSettingsService,
    TikTokVideoUrlService,
    TikTokPublisherService,
    TikTokQueueService,
  ],
})
export class TikTokModule {}
