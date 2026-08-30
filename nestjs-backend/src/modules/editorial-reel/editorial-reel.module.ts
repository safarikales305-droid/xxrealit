import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PropertiesModule } from '../properties/properties.module';
import { SocialModule } from '../social/social.module';
import { ShortsMusicModule } from '../shorts-music/shorts-music.module';
import { ContentSourceCategoryService } from './content-source-category.service';
import { EditorialCenterDashboardService } from './editorial-center-dashboard.service';
import { EditorialReelAdminController } from './editorial-reel-admin.controller';
import { EditorialReelJobService } from './editorial-reel-job.service';
import { EditorialReelRenderService } from './editorial-reel-render.service';
import { EditorialReelSettingsService } from './editorial-reel-settings.service';
import { EditorialReelWorkerService } from './editorial-reel-worker.service';

@Module({
  imports: [
    forwardRef(() => AuthModule),
    forwardRef(() => PropertiesModule),
    forwardRef(() => SocialModule),
    ShortsMusicModule,
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
  ],
  exports: [
    ContentSourceCategoryService,
    EditorialReelSettingsService,
    EditorialReelJobService,
  ],
})
export class EditorialReelModule {}
