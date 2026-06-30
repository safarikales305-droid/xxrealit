import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../../database/prisma.module';
import { ListingViewsController } from './listing-views.controller';
import { ListingViewsService } from './listing-views.service';
import { PostLikesAutopilotService } from './post-likes-autopilot.service';
import { StatisticsAdminController } from './statistics-admin.controller';
import { StatisticsSettingsService } from './statistics-settings.service';
import { ViewsAutopilotService } from './views-autopilot.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [ListingViewsController, StatisticsAdminController],
  providers: [
    StatisticsSettingsService,
    ListingViewsService,
    ViewsAutopilotService,
    PostLikesAutopilotService,
  ],
  exports: [StatisticsSettingsService, ListingViewsService, ViewsAutopilotService],
})
export class StatisticsModule {}
