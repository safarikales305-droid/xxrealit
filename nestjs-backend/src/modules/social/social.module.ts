import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BonusCampaignModule } from '../bonus-campaign/bonus-campaign.module';
import { PostsModule } from '../posts/posts.module';
import { PropertiesModule } from '../properties/properties.module';
import { ShareModule } from '../share/share.module';
import { FacebookAuthService } from './facebook/facebook-auth.service';
import { FacebookController } from './facebook/facebook.controller';
import { FacebookPageController } from './facebook/facebook-page.controller';
import { FacebookConfigService } from './facebook/facebook-config.service';
import { FacebookPageService } from './facebook/facebook-page.service';
import { FacebookPageSyncService } from './facebook/facebook-page-sync.service';
import { FacebookVideoMigrationService } from './facebook/facebook-video-migration.service';
import { FacebookWebhookController } from './facebook/facebook-webhook.controller';
import { FacebookUrlImportController } from './facebook-url-import/facebook-url-import.controller';
import { FacebookUrlImportCronService } from './facebook-url-import/facebook-url-import.cron.service';
import { FacebookUrlImportService } from './facebook-url-import/facebook-url-import.service';
import { FacebookUrlScraperProvider } from './facebook-url-import/facebook-url.scraper.provider';
import { FacebookService } from './facebook/facebook.service';
import { InstagramController } from './instagram/instagram.controller';
import { SocialPlatformStubService } from './social-platform.stub';
import { TikTokModule } from './tiktok/tiktok.module';
import { TokenEncryptionService } from './token-encryption.service';
import { YoutubeController } from './youtube/youtube.controller';
import { SocialAutopostAdminController } from './autopost/social-autopost-admin.controller';
import { FacebookAdminController } from './autopost/facebook-admin.controller';
import { SocialAutopostSettingsService } from './autopost/social-autopost-settings.service';
import { SocialPublisherService } from './autopost/social-publisher.service';
import { SocialPublishLogService } from './autopost/social-publish-log.service';
import {
  SocialPublishEnqueueService,
  SocialPublishProcessorService,
} from './autopost/social-publish-enqueue.service';
import { SocialPublishQueueCronService } from './autopost/social-publish-queue.cron.service';
import { SocialPublishScheduleService } from './autopost/social-publish-schedule.service';
import { SocialPublishScheduleCronService } from './autopost/social-publish-schedule.cron.service';
import { SocialPublishSchedulerLogService } from './autopost/social-publish-scheduler-log.service';
import { SocialAutopostFacebookOAuthService } from './autopost/social-autopost-facebook-oauth.service';
import { SocialAutopostTokenService } from './autopost/social-autopost-token.service';
import { SocialFacebookReelPublisherService } from './autopost/social-facebook-reel-publisher.service';
import { FacebookVideoTeaserService } from './autopost/facebook-video-teaser.service';
import { ReelVideoComposerService } from './autopost/reel-video-composer.service';
import { SocialIntroVideoService } from './autopost/social-intro-video.service';
import { IntroVideoUploadExceptionFilter } from './autopost/intro-video-upload.exception-filter';
import { SocialPublishTemplatesService } from './autopost/social-publish-templates.service';
import { PostSocialPublishService } from './autopost/post-social-publish.service';

@Module({
  imports: [
    forwardRef(() => AuthModule),
    forwardRef(() => PostsModule),
    forwardRef(() => PropertiesModule),
    forwardRef(() => TikTokModule),
    BonusCampaignModule,
    ShareModule,
  ],
  controllers: [
    FacebookController,
    FacebookPageController,
    FacebookWebhookController,
    FacebookUrlImportController,
    SocialAutopostAdminController,
    FacebookAdminController,
    YoutubeController,
    InstagramController,
  ],
  providers: [
    FacebookConfigService,
    FacebookAuthService,
    FacebookService,
    FacebookPageService,
    FacebookPageSyncService,
    FacebookVideoMigrationService,
    FacebookUrlImportService,
    FacebookUrlScraperProvider,
    FacebookUrlImportCronService,
    TokenEncryptionService,
    SocialPlatformStubService,
    SocialAutopostSettingsService,
    SocialPublisherService,
    SocialPublishLogService,
    SocialPublishEnqueueService,
    SocialPublishProcessorService,
    SocialPublishScheduleService,
    SocialPublishSchedulerLogService,
    SocialPublishQueueCronService,
    SocialPublishScheduleCronService,
    SocialAutopostFacebookOAuthService,
    SocialAutopostTokenService,
    SocialFacebookReelPublisherService,
    FacebookVideoTeaserService,
    SocialPublishTemplatesService,
    PostSocialPublishService,
    SocialIntroVideoService,
    ReelVideoComposerService,
    IntroVideoUploadExceptionFilter,
  ],
  exports: [
    FacebookConfigService,
    FacebookService,
    FacebookPageService,
    FacebookPageSyncService,
    FacebookUrlImportService,
    SocialAutopostSettingsService,
    SocialPublishEnqueueService,
    SocialPublisherService,
    TikTokModule,
  ],
})
export class SocialModule {}
