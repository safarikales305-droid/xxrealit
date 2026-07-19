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
  constructor(private readonly sources: SeoLocationSourceService) {}

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
    return this.sources.syncByType('RUIAN', { dryRun: body?.dryRun });
  }

  @Post('sync/csu')
  syncCsu(@Body() body?: { dryRun?: boolean }) {
    return this.sources.syncByType('CSU', { dryRun: body?.dryRun });
  }
}
