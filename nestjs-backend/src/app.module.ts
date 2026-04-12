import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { resolve } from 'node:path';
import { HealthController } from './health.controller';
import { PrismaModule } from './database/prisma.module';
import { LoginApiController } from './login-api.controller';
import { RegisterApiController } from './register-api.controller';
import { AuthModule } from './modules/auth/auth.module';
import { FavoritesModule } from './modules/favorites/favorites.module';
import { FeedModule } from './modules/feed/feed.module';
import { AdminModule } from './modules/admin/admin.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { PropertiesModule } from './modules/properties/properties.module';
import { UploadModule } from './modules/upload/upload.module';
import { VideosModule } from './modules/videos/videos.module';
import { PostsModule } from './modules/posts/posts.module';
import { MessagesModule } from './modules/messages/messages.module';
import { ShortsMusicModule } from './modules/shorts-music/shorts-music.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        resolve(process.cwd(), '.env'),
        resolve(process.cwd(), '..', '.env'),
      ],
    }),
    PrismaModule,
    AuthModule,
    FeedModule,
    PropertiesModule,
    FavoritesModule,
    AdminModule,
    AnalyticsModule,
    UploadModule,
    VideosModule,
    PostsModule,
    MessagesModule,
    ShortsMusicModule,
  ],
  controllers: [HealthController, RegisterApiController, LoginApiController],
})
export class AppModule {}
