import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FeedController } from './feed.controller';
import { FeedService } from './feed.service';
import { ShortsViewsAutopilotService } from './shorts-views-autopilot.service';

@Module({
  imports: [AuthModule],
  controllers: [FeedController],
  providers: [FeedService, ShortsViewsAutopilotService],
})
export class FeedModule {}
