import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AccommodationType } from '@prisma/client';
import { AdminGuard } from '../admin/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccommodationAdminService } from './accommodation-admin.service';

@Controller('admin/accommodations')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AccommodationAdminController {
  constructor(private readonly admin: AccommodationAdminService) {}

  private userId(req: { user?: { id?: string; sub?: string } }) {
    return req.user?.id ?? req.user?.sub;
  }

  @Get('dashboard')
  dashboard() {
    return this.admin.dashboard();
  }

  @Get()
  list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('provider') provider?: string,
    @Query('status') status?: string,
  ) {
    return this.admin.list({
      page: Number(page) || 1,
      limit: Number(limit) || 30,
      provider,
      status,
    });
  }

  @Get('providers/:provider')
  getProvider(@Param('provider') provider: string) {
    return this.admin.getProviderConfig(provider);
  }

  @Post('providers/:provider')
  saveProvider(@Param('provider') provider: string, @Body() body: Record<string, unknown>) {
    return this.admin.saveProviderConfig(provider, {
      apiKey: body.apiKey as string | undefined,
      affiliateId: body.affiliateId as string | undefined,
      environment: body.environment as string | undefined,
      enabled: body.enabled as boolean | undefined,
    });
  }

  @Post('providers/:provider/test')
  testProvider(@Param('provider') provider: string) {
    return this.admin.testProvider(provider);
  }

  @Post('providers/:provider/sync')
  startSync(@Param('provider') provider: string) {
    return this.admin.startSync(provider);
  }

  @Get('sync-jobs/:jobId')
  getSyncJob(@Param('jobId') jobId: string) {
    return this.admin.getSyncJob(jobId);
  }

  @Post('sync-jobs/:jobId/pause')
  pauseSync(@Param('jobId') jobId: string) {
    return this.admin.pauseSync(jobId);
  }

  @Post('sync-jobs/:jobId/cancel')
  cancelSync(@Param('jobId') jobId: string) {
    return this.admin.cancelSync(jobId);
  }

  @Post()
  create(@Body() body: Record<string, unknown>, @Req() req: { user?: { id?: string; sub?: string } }) {
    return this.admin.createManual({
      type: (body.type as AccommodationType) ?? AccommodationType.HOTEL,
      name: String(body.name ?? ''),
      slug: String(body.slug ?? ''),
      city: String(body.city ?? ''),
      description: body.description as string | undefined,
      priceFrom: Number(body.priceFrom) || undefined,
      address: body.address as string | undefined,
      latitude: Number(body.latitude) || undefined,
      longitude: Number(body.longitude) || undefined,
      createdById: this.userId(req),
    });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.admin.get(id);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() body: { status?: string; published?: boolean }) {
    return this.admin.updateStatus(id, {
      status: body.status as never,
      published: body.published,
    });
  }

  @Delete(':id')
  deleteLocal(@Param('id') id: string) {
    return this.admin.deleteLocal(id);
  }
}
