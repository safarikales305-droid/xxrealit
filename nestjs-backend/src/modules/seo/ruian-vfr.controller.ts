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
import { ruianVfrFail } from './ruian-vfr.errors';
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
    try {
      return this.ruianVfr.getPublicStatus();
    } catch (err) {
      return ruianVfrFail(err);
    }
  }

  @Get('logs')
  async logs() {
    try {
      return await this.ruianVfr.getImportLogs();
    } catch (err) {
      return ruianVfrFail(err);
    }
  }

  @Post('discover')
  async discover(@Body() body?: { mode?: 'full' | 'delta' }) {
    try {
      return await this.ruianVfr.discoverLatestSafe(body?.mode ?? 'full');
    } catch (err) {
      return ruianVfrFail(err);
    }
  }

  @Post('test-import')
  async testImport(@Body() body?: { limit?: number }) {
    try {
      return await this.ruianVfr.runTestImportSafe(body);
    } catch (err) {
      return ruianVfrFail(err);
    }
  }

  @Post('full-import')
  async fullImport(@Body() body?: { resume?: boolean }) {
    try {
      return await this.ruianVfr.runFullImportSafe(body);
    } catch (err) {
      return ruianVfrFail(err);
    }
  }

  @Post('daily-download')
  async dailyDownload() {
    try {
      return await this.ruianVfr.downloadDailyChangesSafe();
    } catch (err) {
      return ruianVfrFail(err);
    }
  }

  @Post('sync-delta')
  async syncDelta() {
    try {
      return await this.ruianVfr.syncDeltaChangesSafe();
    } catch (err) {
      return ruianVfrFail(err);
    }
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  async upload(@UploadedFile() file: Express.Multer.File) {
    try {
      if (!file?.buffer?.length) {
        return { success: false, step: 'verify', error: 'Soubor chybí.', logs: [] };
      }
      return await this.ruianVfr.importUploadedBufferSafe(file.buffer, file.originalname);
    } catch (err) {
      return ruianVfrFail(err, [], 'FAILED', 'upload');
    }
  }
}
