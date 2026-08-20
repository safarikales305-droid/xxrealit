import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OpenAiModule } from '../openai/openai.module';
import { NewsAuditService } from './news-audit.service';
import { NewsEditorialSettingsService } from './news-editorial-settings.service';
import { NewsSourceService } from './news-source.service';
import { NewsFetchService } from './news-fetch.service';
import { NewsAiService } from './news-ai.service';
import { NewsArticleService } from './news-article.service';
import { NewsPublishService } from './news-publish.service';
import { NewsEditorialWorkerService } from './news-editorial-worker.service';
import { NewsEditorialAdminController } from './news-editorial-admin.controller';
import { NewsEditorialPublicController } from './news-editorial-public.controller';

@Module({
  imports: [OpenAiModule, forwardRef(() => AuthModule)],
  controllers: [NewsEditorialPublicController, NewsEditorialAdminController],
  providers: [
    NewsAuditService,
    NewsEditorialSettingsService,
    NewsSourceService,
    NewsFetchService,
    NewsAiService,
    NewsArticleService,
    NewsPublishService,
    NewsEditorialWorkerService,
  ],
  exports: [
    NewsArticleService,
    NewsEditorialSettingsService,
    NewsPublishService,
  ],
})
export class NewsEditorialModule {}
