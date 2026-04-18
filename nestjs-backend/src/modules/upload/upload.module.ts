import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProfileImagesService } from './profile-images.service';
import { ProfileMediaStorageService } from './profile-media-storage.service';
import { UploadController } from './upload.controller';

@Module({
  imports: [AuthModule],
  controllers: [UploadController],
  providers: [ProfileImagesService, ProfileMediaStorageService],
  exports: [ProfileImagesService, ProfileMediaStorageService],
})
export class UploadModule {}
