import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { VerificationFilesAdminController } from './verification-files-admin.controller';
import { VerificationFilesPublicController } from './verification-files-public.controller';
import { VerificationFilesService } from './verification-files.service';

@Module({
  imports: [AuthModule],
  controllers: [VerificationFilesAdminController, VerificationFilesPublicController],
  providers: [VerificationFilesService],
  exports: [VerificationFilesService],
})
export class VerificationFilesModule {}
