import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProfileImagesService } from './profile-images.service';
import { UploadController } from './upload.controller';

@Module({
  imports: [AuthModule],
  controllers: [UploadController],
  providers: [ProfileImagesService],
})
export class UploadModule {}
