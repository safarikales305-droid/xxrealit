import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PropertiesModule } from '../properties/properties.module';
import { SocialModule } from '../social/social.module';
import { YouTubeModule } from '../social/youtube/youtube.module';
import { OpenAiModule } from '../openai/openai.module';
import { ShortsMusicModule } from '../shorts-music/shorts-music.module';
import { NewsEditorialSettingsModule } from '../news-editorial/news-editorial-settings.module';
import { ContentSourceCategoryService } from './content-source-category.service';
import { EditorialCenterDashboardService } from './editorial-center-dashboard.service';
import { EditorialReelAdminController } from './editorial-reel-admin.controller';
import { EditorialReelJobService } from './editorial-reel-job.service';
import { EditorialReelRenderService } from './editorial-reel-render.service';
import { EditorialReelSettingsService } from './editorial-reel-settings.service';
import { EditorialReelWorkerService } from './editorial-reel-worker.service';
import { ReelHookService } from './reel-hook.service';

@Module({
  imports: [
    forwardRef(() => AuthModule),
    forwardRef(() => PropertiesModule),
    forwardRef(() => SocialModule),
    YouTubeModule,
    ShortsMusicModule,
    OpenAiModule,
    NewsEditorialSettingsModule,
  ],
  controllers: [EditorialReelAdminController],
  providers: [
    ContentSourceCategoryService,
    EditorialCenterDashboardService,
    EditorialReelSettingsService,
    EditorialReelRenderService,
    EditorialReelJobService,
    EditorialReelWorkerService,
    ReelHookService,
  ],
  exports: [
    ContentSourceCategoryService,
    EditorialReelSettingsService,
    EditorialReelJobService,
  ],
})
export class EditorialReelModule {}
