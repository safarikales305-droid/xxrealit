import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AdminGuard } from '../admin/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CsuDataStatService } from './csu-datastat.service';
import { RuianMapService } from './ruian-map.service';
import { RuianVfrService } from './ruian-vfr.service';
import { SeoLocationSyncCronService } from './seo-location-sync.cron.service';
import { SEO_LOCATION_UPLOAD_MAX_BYTES } from './seo-location-import.util';
import {
  SeoLocationSourceService,
  type UpdateSourceInput,
} from './seo-location-source.service';

const uploadOptions = {
  storage: memoryStorage(),
  limits: { fileSize: SEO_LOCATION_UPLOAD_MAX_BYTES },
};

@Controller('admin/seo/locations')
@UseGuards(JwtAuthGuard, AdminGuard)
export class SeoLocationSourcesController {
  constructor(
    private readonly sources: SeoLocationSourceService,
    private readonly ruianVfr: RuianVfrService,
    private readonly csuDataStat: CsuDataStatService,
    private readonly ruianMap: RuianMapService,
    private readonly syncCron: SeoLocationSyncCronService,
  ) {}

  @Get('sources')
  listSources() {
    return this.sources.listSources();
  }

  @Put('sources/:sourceId')
  updateSource(@Param('sourceId') sourceId: string, @Body() body: UpdateSourceInput) {
    return this.sources.updateSource(sourceId, body);
  }

  @Delete('sources/:sourceId')
  deleteSource(@Param('sourceId') sourceId: string) {
    return this.sources.deleteSource(sourceId);
  }

  @Post('sources/test')
  testSource(@Body() body: { sourceId: string }) {
    return this.sources.testSource(body.sourceId);
  }

  @Post('sources/:sourceId/mappings')
  saveMappings(
    @Param('sourceId') sourceId: string,
    @Body() body: { mappings: Array<{ sourceField: string; targetField: string; isRequired?: boolean }> },
  ) {
    return this.sources.saveFieldMappings(sourceId, body.mappings ?? []);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body('sourceId') sourceId?: string,
  ) {
    if (!file) throw new BadRequestException('Soubor chybí.');
    return this.sources.uploadFile(file, sourceId?.trim() || undefined);
  }

  @Post('import/preview')
  previewImport(
    @Body()
    body: {
      sourceId?: string;
      uploadId?: string;
      mapping?: Record<string, string>;
    },
  ) {
    return this.sources.previewImport(body);
  }

  @Post('import/run')
  runImport(
    @Body()
    body: {
      sourceId?: string;
      uploadId?: string;
      mapping?: Record<string, string>;
      dryRun?: boolean;
      syncScope?: 'all' | 'new' | 'changes';
      regionOfficialCode?: string;
      districtOfficialCode?: string;
    },
  ) {
    return this.sources.runImport(body);
  }

  @Get('imports')
  listImports(@Query('sourceId') sourceId?: string) {
    return this.sources.listImports(sourceId);
  }

  @Get('imports/:id')
  getImport(@Param('id') id: string) {
    return this.sources.getImport(id);
  }

  @Post('sync/ruian')
  syncRuian(@Body() body?: { dryRun?: boolean }) {
    return this.ruianVfr.runFullImport();
  }

  @Post('sync/csu')
  syncCsu(@Body() body?: { dryRun?: boolean }) {
    return this.csuDataStat.syncPopulation({ dryRun: body?.dryRun });
  }

  // —— RÚIAN Oficiální VFR ——
  @Get('ruian/vfr/status')
  ruianVfrStatus() {
    return this.ruianVfr.getStatus();
  }

  @Post('ruian/vfr/discover')
  ruianDiscover(@Body() body?: { mode?: 'full' | 'delta' }) {
    return this.ruianVfr.discoverLatestSafe(body?.mode ?? 'full');
  }

  @Post('ruian/vfr/full-import')
  ruianFullImport(@Body() body?: { resume?: boolean }) {
    return this.ruianVfr.runFullImportSafe(body);
  }

  @Post('ruian/vfr/daily-download')
  ruianDailyDownload() {
    return this.ruianVfr.downloadDailyChangesSafe();
  }

  @Post('ruian/vfr/sync-delta')
  ruianSyncDelta() {
    return this.ruianVfr.syncDeltaChangesSafe();
  }

  @Post('ruian/vfr/upload')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  ruianVfrUpload(@UploadedFile() file: Express.Multer.File) {
    if (!file) return { success: false, error: 'Soubor chybí.', logs: [] };
    return this.ruianVfr.importUploadedBufferSafe(file.buffer, file.originalname);
  }

  @Get('ruian/vfr/logs')
  ruianVfrLogs() {
    return this.ruianVfr.getImportLogs();
  }

  @Post('ruian/map/verify')
  ruianMapVerify(@Body() body: { officialCode: string }) {
    return this.ruianMap.verifyFeatureByCode(body.officialCode);
  }

  // —— ČSÚ DataStat ——
  @Get('csu/datastat/status')
  csuStatus() {
    return this.csuDataStat.getStatus();
  }

  @Post('csu/datastat/sync')
  csuSync(@Body() body?: { dryRun?: boolean; vyberCode?: string }) {
    return this.csuDataStat.syncPopulation(body);
  }

  @Post('csu/datastat/test')
  csuTest() {
    return this.csuDataStat.testAvailability();
  }

  @Post('diagnostics/run')
  async runDiagnostics() {
    const [ruianDiscover, csuTest, ruianStatus, csuStatus] = await Promise.all([
      this.ruianVfr.discoverLatest('full').catch((e) => ({ error: String(e) })),
      this.csuDataStat.testAvailability(),
      this.ruianVfr.getStatus(),
      this.csuDataStat.getStatus(),
    ]);
    return {
      ruian: { discover: ruianDiscover, status: ruianStatus },
      csu: { api: csuTest, status: csuStatus },
    };
  }

  @Post('sync/cron/run')
  cronRun(@Body() body?: { kind?: 'ruian-delta' | 'ruian-full' | 'csu' }) {
    return this.syncCron.runNow(body?.kind ?? 'ruian-delta');
  }
}
