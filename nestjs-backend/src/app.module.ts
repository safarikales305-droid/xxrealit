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
import { PropertiesModule } from './modules/properties/properties.module';
import { UploadModule } from './modules/upload/upload.module';

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
    UploadModule,
  ],
  controllers: [HealthController, RegisterApiController, LoginApiController],
})
export class AppModule {}
