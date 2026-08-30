import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AdminGuard } from '../admin/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { propertyMediaMemoryMulterOptions } from '../upload/multer-upload.config';
import { UpdateRegistrationGateDto } from './dto/update-registration-gate.dto';
import { RegistrationGateService } from './registration-gate.service';
import { ShortsSignupAnalyticsService } from './shorts-signup-analytics.service';

@Controller('admin/registration-gate')
@UseGuards(JwtAuthGuard, AdminGuard)
export class RegistrationGateAdminController {
  constructor(
    private readonly registrationGate: RegistrationGateService,
    private readonly shortsSignupAnalytics: ShortsSignupAnalyticsService,
  ) {}

  @Get('shorts-signup/stats')
  getShortsSignupStats(@Query('days') daysRaw?: string) {
    const days = Math.min(90, Math.max(1, Number.parseInt(daysRaw ?? '7', 10) || 7));
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);
    from.setHours(0, 0, 0, 0);
    return this.shortsSignupAnalytics.getStats(from, to);
  }

  @Get()
  getSettings() {
    return this.registrationGate.getAdminSettings();
  }

  @Patch()
  updateSettings(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: UpdateRegistrationGateDto,
  ) {
    return this.registrationGate.updateSettings(dto);
  }

  @Post('upload-video')
  @UseInterceptors(FileInterceptor('video', propertyMediaMemoryMulterOptions))
  uploadVideo(@UploadedFile() file: Express.Multer.File) {
    return this.registrationGate.uploadVideo(file);
  }

  @Post('upload-banner')
  @UseInterceptors(FileInterceptor('banner', propertyMediaMemoryMulterOptions))
  uploadBanner(@UploadedFile() file: Express.Multer.File) {
    return this.registrationGate.uploadBanner(file);
  }
}
