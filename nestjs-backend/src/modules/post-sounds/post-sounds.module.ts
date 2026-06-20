import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PropertiesModule } from '../properties/properties.module';
import { PostSoundsAdminController } from './post-sounds-admin.controller';
import { PostSoundsController } from './post-sounds.controller';
import { PostSoundsService } from './post-sounds.service';

@Module({
  imports: [AuthModule, PropertiesModule],
  controllers: [PostSoundsAdminController, PostSoundsController],
  providers: [PostSoundsService],
  exports: [PostSoundsService],
})
export class PostSoundsModule {}
