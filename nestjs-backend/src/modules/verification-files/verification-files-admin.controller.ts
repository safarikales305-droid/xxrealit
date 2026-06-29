import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/guards/admin.guard';
import { VerificationFilesService } from './verification-files.service';
import { VERIFICATION_FILE_MAX_BYTES } from './verification-files.utils';

@Controller('admin/verification-files')
@UseGuards(JwtAuthGuard, AdminGuard)
export class VerificationFilesAdminController {
  constructor(private readonly verificationFiles: VerificationFilesService) {}

  @Get()
  list() {
    return this.verificationFiles.listForAdmin();
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: VERIFICATION_FILE_MAX_BYTES, files: 1 },
    }),
  )
  upload(@CurrentUser() admin: AuthUser, @UploadedFile() file: Express.Multer.File) {
    return this.verificationFiles.uploadForAdmin(admin.id, file);
  }

  @Patch(':id')
  setActive(@Param('id') id: string, @Body() body: { isActive?: boolean }) {
    return this.verificationFiles.setActiveForAdmin(id, Boolean(body.isActive));
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.verificationFiles.deleteForAdmin(id);
  }
}
