import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString, IsUrl } from 'class-validator';
import { PrismaService } from '../../database/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/guards/admin.guard';
import { ApifyImportQueueService } from './apify-import-queue.service';

class CreateApifyImportDto {
  @IsString()
  sourceId!: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  apifyUrl?: string;
}

class ToggleApifyImportDto {
  @IsBoolean()
  enabled!: boolean;
}

@Controller('import')
@UseGuards(JwtAuthGuard, AdminGuard)
export class ApifyImportController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: ApifyImportQueueService,
  ) {}

  @Post('apify')
  async enqueueApifyImport(@Body() body: CreateApifyImportDto) {
    const source = await this.prisma.importSource.findUnique({
      where: { id: body.sourceId },
      select: { id: true, enabled: true, startUrl: true, method: true },
    });
    if (!source) {
      return { ok: false, error: 'Import source nenalezen' };
    }
    const apifyUrl = (body.apifyUrl ?? source.startUrl ?? '').trim();
    if (!apifyUrl) {
      return { ok: false, error: 'APIFY_URL je povinná (body.apifyUrl nebo source.startUrl).' };
    }
    const job = this.queue.enqueue({ sourceId: source.id, apifyUrl });
    return {
      ok: true,
      queued: true,
      jobId: job.id,
      sourceId: source.id,
      status: job.status,
      apifyUrl: job.apifyUrl,
    };
  }

  @Patch('apify/:sourceId/toggle')
  async toggleApifySource(@Param('sourceId') sourceId: string, @Body() body: ToggleApifyImportDto) {
    const source = await this.prisma.importSource.update({
      where: { id: sourceId },
      data: { enabled: Boolean(body.enabled) },
      select: { id: true, enabled: true, method: true, startUrl: true },
    });
    return { ok: true, source };
  }

  @Get('apify/jobs/:jobId')
  getApifyJobStatus(@Param('jobId') jobId: string) {
    const job = this.queue.getJob(jobId);
    return { ok: true, job };
  }
}
