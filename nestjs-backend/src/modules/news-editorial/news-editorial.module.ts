import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OpenAiModule } from '../openai/openai.module';
import { PostsModule } from '../posts/posts.module';
import { PropertiesModule } from '../properties/properties.module';
import { SocialModule } from '../social/social.module';
import { UploadModule } from '../upload/upload.module';
import { FeedModule } from '../feed/feed.module';
import { NewsAuditService } from './news-audit.service';
import { NewsBackfillService } from './news-backfill.service';
import { NewsEditorialSettingsModule } from './news-editorial-settings.module';
import { NewsSourceService } from './news-source.service';
import { NewsSourceDeleteService } from './news-source-delete.service';
import { NewsFetchService } from './news-fetch.service';
import { NewsAiService } from './news-ai.service';
import { NewsArticleService } from './news-article.service';
import { NewsImageService } from './news-image.service';
import { NewsPublishService } from './news-publish.service';
import { NewsPortalPostService } from './news-portal-post.service';
import { NewsRssTestService } from './news-rss-test.service';
import { NewsYoutubeService } from './news-youtube.service';
import { NewsYoutubeDiscoveryService } from './news-youtube-discovery.service';
import { NewsYoutubeSeoGateService } from './news-youtube-seo-gate.service';
import { NewsSystemUserService } from './news-system-user.service';
import { EditorialPortalPostService } from './editorial-portal-post.service';
import { NewsEditorialWorkerService } from './news-editorial-worker.service';
import { NewsEditorialAdminController } from './news-editorial-admin.controller';
import { NewsEditorialPublicController } from './news-editorial-public.controller';
import { EditorialReelModule } from '../editorial-reel/editorial-reel.module';

@Module({
  imports: [
    OpenAiModule,
    forwardRef(() => PropertiesModule),
    forwardRef(() => PostsModule),
    forwardRef(() => SocialModule),
    UploadModule,
    forwardRef(() => AuthModule),
    NewsEditorialSettingsModule,
    forwardRef(() => EditorialReelModule),
    forwardRef(() => FeedModule),
  ],
  controllers: [NewsEditorialPublicController, NewsEditorialAdminController],
  providers: [
    NewsAuditService,
    NewsBackfillService,
    NewsSourceService,
    NewsSourceDeleteService,
    NewsFetchService,
    NewsImageService,
    NewsAiService,
    NewsArticleService,
    NewsPortalPostService,
    EditorialPortalPostService,
    NewsPublishService,
    NewsRssTestService,
    NewsYoutubeService,
    NewsYoutubeDiscoveryService,
    NewsYoutubeSeoGateService,
    NewsSystemUserService,
    NewsEditorialWorkerService,
  ],
  exports: [
    NewsEditorialSettingsModule,
    NewsArticleService,
    NewsPublishService,
    NewsPortalPostService,
    EditorialPortalPostService,
    NewsSystemUserService,
  ],
})
export class NewsEditorialModule {}
