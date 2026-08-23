import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OpenAiModule } from '../openai/openai.module';
import { PostsModule } from '../posts/posts.module';
import { PropertiesModule } from '../properties/properties.module';
import { SocialModule } from '../social/social.module';
import { NewsAuditService } from './news-audit.service';
import { NewsBackfillService } from './news-backfill.service';
import { NewsEditorialSettingsService } from './news-editorial-settings.service';
import { NewsSourceService } from './news-source.service';
import { NewsFetchService } from './news-fetch.service';
import { NewsAiService } from './news-ai.service';
import { NewsArticleService } from './news-article.service';
import { NewsImageService } from './news-image.service';
import { NewsPublishService } from './news-publish.service';
import { NewsPortalPostService } from './news-portal-post.service';
import { NewsRssTestService } from './news-rss-test.service';
import { NewsYoutubeService } from './news-youtube.service';
import { NewsSystemUserService } from './news-system-user.service';
import { NewsEditorialWorkerService } from './news-editorial-worker.service';
import { NewsEditorialAdminController } from './news-editorial-admin.controller';
import { NewsEditorialPublicController } from './news-editorial-public.controller';

@Module({
  imports: [OpenAiModule, PropertiesModule, PostsModule, SocialModule, forwardRef(() => AuthModule)],
  controllers: [NewsEditorialPublicController, NewsEditorialAdminController],
  providers: [
    NewsAuditService,
    NewsBackfillService,
    NewsEditorialSettingsService,
    NewsSourceService,
    NewsFetchService,
    NewsImageService,
    NewsAiService,
    NewsArticleService,
    NewsPortalPostService,
    NewsPublishService,
    NewsRssTestService,
    NewsYoutubeService,
    NewsSystemUserService,
    NewsEditorialWorkerService,
  ],
  exports: [
    NewsArticleService,
    NewsEditorialSettingsService,
    NewsPublishService,
    NewsPortalPostService,
    NewsSystemUserService,
  ],
})
export class NewsEditorialModule {}
