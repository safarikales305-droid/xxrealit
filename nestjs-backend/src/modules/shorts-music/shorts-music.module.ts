import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PropertiesModule } from '../properties/properties.module';
import { ShortsMusicAdminController } from './shorts-music-admin.controller';
import { ShortsMusicService } from './shorts-music.service';

@Module({
  imports: [AuthModule, PropertiesModule],
  controllers: [ShortsMusicAdminController],
  providers: [ShortsMusicService],
  exports: [ShortsMusicService],
})
export class ShortsMusicModule {}
