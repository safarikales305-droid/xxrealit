import {
  Body,
  Controller,
  Get,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AdminGuard } from '../admin/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RuianVfrService } from './ruian-vfr.service';
import { SEO_LOCATION_UPLOAD_MAX_BYTES } from './seo-location-import.util';

const uploadOptions = {
  storage: memoryStorage(),
  limits: { fileSize: SEO_LOCATION_UPLOAD_MAX_BYTES },
};

/**
 * Zjednodušené VFR API: /api/vfr/*
 * Vždy vrací JSON — chyby jako { success: false, error: "..." }, nikdy prázdný HTTP 500.
 */
@Controller('vfr')
@UseGuards(JwtAuthGuard, AdminGuard)
export class RuianVfrController {
  constructor(private readonly ruianVfr: RuianVfrService) {}

  @Get('status')
  status() {
    return this.ruianVfr.getPublicStatus();
  }

  @Get('logs')
  logs() {
    return this.ruianVfr.getImportLogs();
  }

  @Post('discover')
  discover(@Body() body?: { mode?: 'full' | 'delta' }) {
    return this.ruianVfr.discoverLatestSafe(body?.mode ?? 'full');
  }

  @Post('test-import')
  testImport(@Body() body?: { limit?: number }) {
    return this.ruianVfr.runTestImportSafe(body);
  }

  @Post('full-import')
  fullImport(@Body() body?: { resume?: boolean }) {
    return this.ruianVfr.runFullImportSafe(body);
  }

  @Post('daily-download')
  dailyDownload() {
    return this.ruianVfr.downloadDailyChangesSafe();
  }

  @Post('sync-delta')
  syncDelta() {
    return this.ruianVfr.syncDeltaChangesSafe();
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  upload(@UploadedFile() file: Express.Multer.File) {
    if (!file?.buffer?.length) {
      return { success: false, error: 'Soubor chybí.', logs: [] };
    }
    return this.ruianVfr.importUploadedBufferSafe(file.buffer, file.originalname);
  }
}
