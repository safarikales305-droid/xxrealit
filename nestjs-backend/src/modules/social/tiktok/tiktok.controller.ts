import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { TikTokPublishJobStatus } from '@prisma/client';
import { AdminGuard } from '../../admin/guards/admin.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../../auth/decorators/current-user.decorator';
import { PrismaService } from '../../../database/prisma.service';
import { TikTokConfigService } from './tiktok.config.service';
import { TikTokOAuthService } from './tiktok-oauth.service';
import { TikTokQueueService } from './tiktok-queue.service';
import { TikTokSettingsService } from './tiktok-settings.service';

@Controller('social/tiktok')
export class TiktokController {
  constructor(
    private readonly oauth: TikTokOAuthService,
    private readonly config: TikTokConfigService,
    private readonly settings: TikTokSettingsService,
    private readonly queue: TikTokQueueService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('auth-url')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async authUrl(@CurrentUser() user: AuthUser) {
    const url = await this.oauth.buildConnectUrl(user.id);
    return { url };
  }

  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Query('error_description') errorDescription: string | undefined,
    @Res() res: Response,
  ) {
    const result = await this.oauth.handleCallback(code, state, error, errorDescription);
    return res.redirect(result.redirectUrl);
  }

  @Post('disconnect')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async disconnect() {
    await this.oauth.disconnect();
    return { ok: true };
  }

  @Get('status')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async status() {
    const [connection, portalSettings] = await Promise.all([
      this.oauth.getPublicStatus(),
      Promise.resolve(this.settings.getSettings()),
    ]);
    return {
      ...connection,
      baseUrl: this.config.getBaseUrl(),
      settings: portalSettings,
    };
  }

  @Post('test-connection')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async testConnection() {
    return this.oauth.testConnection();
  }

  @Patch('settings')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async updateSettings(
    @Body() body: Partial<{ autoPublish: boolean; preferDirectPublish: boolean }>,
  ) {
    const settings = await this.settings.updateSettings(body);
    return { ok: true, settings };
  }

  @Get('jobs')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async listJobs(@Query('status') status?: string, @Query('limit') limit?: string) {
    const parsed =
      status && Object.values(TikTokPublishJobStatus).includes(status as TikTokPublishJobStatus)
        ? (status as TikTokPublishJobStatus)
        : undefined;
    const items = await this.queue.listJobs({
      status: parsed,
      limit: limit ? Number.parseInt(limit, 10) : 50,
    });
    return { items };
  }

  @Post('jobs')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async createJob(@Body() body: { listingId: string }) {
    const { jobId } = await this.queue.enqueueManual(body.listingId?.trim());
    await this.queue.processNext();
    return { ok: true, jobId };
  }

  @Post('jobs/:id/retry')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async retryJob(@Param('id') id: string) {
    await this.queue.retryJob(id);
    return { ok: true };
  }

  @Delete('jobs/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async cancelJob(@Param('id') id: string) {
    await this.queue.cancelJob(id);
    return { ok: true };
  }

  @Get('listings/:listingId/status')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async listingStatus(@Param('listingId') listingId: string) {
    return this.queue.getListingStatus(listingId);
  }

  @Get('demo/listings')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async demoListings(@Query('limit') limit?: string) {
    const items = await this.prisma.property.findMany({
      where: {
        deletedAt: null,
        approved: true,
        isActive: true,
        isVisible: true,
        videoUrl: { not: null },
      },
      select: {
        id: true,
        title: true,
        city: true,
        videoUrl: true,
        propertyType: true,
        offerType: true,
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number.parseInt(limit ?? '20', 10) || 20, 50),
    });
    return { items };
  }
}
