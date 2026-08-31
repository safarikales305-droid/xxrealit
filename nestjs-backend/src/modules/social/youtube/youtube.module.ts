import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { TokenEncryptionService } from '../token-encryption.service';
import { YouTubeConfigService } from './youtube.config.service';
import { YouTubeOAuthService } from './youtube-oauth.service';
import { YouTubePublishJobService } from './youtube-publish-job.service';
import { YouTubePublishService } from './youtube-publish.service';
import { YouTubeQueueCronService } from './youtube-queue.cron.service';
import { YoutubeController } from './youtube.controller';

@Module({
  imports: [forwardRef(() => AuthModule)],
  controllers: [YoutubeController],
  providers: [
    YouTubeConfigService,
    YouTubeOAuthService,
    YouTubePublishService,
    YouTubePublishJobService,
    YouTubeQueueCronService,
    TokenEncryptionService,
  ],
  exports: [YouTubeOAuthService, YouTubePublishJobService, YouTubeConfigService],
})
export class YouTubeModule {}
