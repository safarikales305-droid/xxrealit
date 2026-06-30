import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ListingContactUnlockModule } from '../properties/listing-contact-unlock.module';
import { PostsModule } from '../posts/posts.module';
import { FeedController } from './feed.controller';
import { FeedService } from './feed.service';

@Module({
  imports: [AuthModule, PostsModule, ListingContactUnlockModule],
  controllers: [FeedController],
  providers: [FeedService],
})
export class FeedModule {}
