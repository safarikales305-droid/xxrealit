import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CompanyDirectoryCategory } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/guards/admin.guard';
import { AresService } from './ares.service';
import { CompanyClaimService } from './company-claim.service';
import { CompanyDirectoryService } from './company-directory.service';
import { CompanyImportService } from './company-import.service';
import {
  ARES_IMPORT_BATCH_SIZE,
  ARES_IMPORT_DELAY_MS,
  ARES_IMPORT_ENABLED,
  CZECH_REGIONS,
  GOOGLE_COMPANY_ENRICHMENT_ENABLED,
} from './company-directory.constants';

@Controller('admin/company-directory')
@UseGuards(JwtAuthGuard, AdminGuard)
export class CompanyDirectoryAdminController {
  constructor(
    private readonly directory: CompanyDirectoryService,
    private readonly importService: CompanyImportService,
    private readonly claims: CompanyClaimService,
    private readonly ares: AresService,
  ) {}

  @Get('dashboard')
  dashboard() {
    return this.directory.getAdminDashboard();
  }

  @Get('metrics')
  metrics() {
    return {
      ares: this.ares.getMetrics(),
      flags: {
        directory: this.directory.isEnabled(),
        aresImport: ARES_IMPORT_ENABLED,
        googleEnrichment: GOOGLE_COMPANY_ENRICHMENT_ENABLED,
      },
      defaults: {
        batchSize: ARES_IMPORT_BATCH_SIZE,
        delayMs: ARES_IMPORT_DELAY_MS,
      },
      regions: CZECH_REGIONS,
      categories: Object.values(CompanyDirectoryCategory),
    };
  }

  @Get('companies')
  listCompanies(@Query() query: Record<string, string | undefined>) {
    return this.directory.listPublic({ ...query, pageSize: query.pageSize ?? '50' });
  }

  @Get('import/jobs')
  listImportJobs() {
    return this.importService.listJobs();
  }

  @Get('import/jobs/:id')
  getImportJob(@Param('id') id: string) {
    return this.importService.getJob(id);
  }

  @Post('import/start')
  startImport(
    @Body()
    body: {
      category?: CompanyDirectoryCategory;
      region?: string;
      district?: string;
      city?: string;
      batchSize?: number;
      delayMs?: number;
      importMode?: 'SEARCH' | 'ICO_LIST';
      icoList?: string[];
    },
  ) {
    return this.importService.startImport(body);
  }

  @Post('import/jobs/:id/pause')
  pauseImport(@Param('id') id: string) {
    return this.importService.pauseJob(id);
  }

  @Post('import/jobs/:id/resume')
  resumeImport(@Param('id') id: string) {
    return this.importService.resumeJob(id);
  }

  @Post('import/jobs/:id/stop')
  stopImport(@Param('id') id: string) {
    return this.importService.stopJob(id);
  }

  @Post('import/test-ico')
  async testIco(
    @Body() body: { ico: string; category?: CompanyDirectoryCategory },
  ) {
    const result = await this.importService.importIcoBatch(
      [body.ico],
      body.category ?? null,
    );
    const entry = await this.directory.listPublic({ ico: body.ico, pageSize: '1' });
    return { result, company: entry.items[0] ?? null };
  }

  @Get('claims')
  listClaims(@Query('status') status?: string) {
    return this.claims.listClaims(status);
  }

  @Patch('claims/:id')
  reviewClaim(
    @Param('id') id: string,
    @Body() body: { action: 'approve' | 'reject'; adminNote?: string },
  ) {
    return this.claims.reviewClaim(id, body.action, body.adminNote);
  }
}
