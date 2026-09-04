import {
  Controller,
  Get,
  Post,
  Query,
  Res,
  UseGuards,
  Body,
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import { AdminGuard } from '../../admin/guards/admin.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../../auth/decorators/current-user.decorator';
import { YouTubeConfigService } from './youtube.config.service';
import { YouTubeOAuthService } from './youtube-oauth.service';
import { YouTubePublishJobService } from './youtube-publish-job.service';
import { YouTubePublishService } from './youtube-publish.service';

@Controller('social/youtube')
export class YoutubeController {
  constructor(
    private readonly oauth: YouTubeOAuthService,
    private readonly config: YouTubeConfigService,
    private readonly publishJobs: YouTubePublishJobService,
    private readonly publish: YouTubePublishService,
  ) {}

  @Get('oauth/connect')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async connect(@CurrentUser() user: AuthUser) {
    const url = await this.oauth.buildConnectUrl(user.id);
    return { url };
  }

  @Get('oauth/callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    const result = await this.oauth.handleCallback(code, state, error);
    return res.redirect(result.redirectUrl);
  }

  @Get('status')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async status() {
    const [connection, publish] = await Promise.all([
      this.oauth.getConnectionStatus(),
      this.publishJobs.getPublishSummary(),
    ]);
    return {
      ...connection,
      ...publish,
      redirectUri: this.config.isConfigured() ? this.config.getRedirectUri() : null,
    };
  }

  @Post('disconnect')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async disconnect() {
    return this.oauth.disconnect();
  }

  @Post('test')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async test() {
    return this.oauth.testConnection();
  }

  @Post('test-upload')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async testUpload(@Body() body: { videoUrl?: string }) {
    const videoUrl = body.videoUrl?.trim();
    if (!videoUrl) {
      throw new BadRequestException('Chybí videoUrl pro testovací upload.');
    }

    const health = await this.oauth.testConnection();
    if (health.status !== 'CONNECTED') {
      return {
        ok: false,
        uploadStatus: health.status,
        message: health.message ?? 'YouTube není připraveno k uploadu.',
      };
    }

    try {
      const upload = await this.publish.uploadVideo({
        videoUrl,
        title: 'XXREALIT – test YouTube integrace',
        description: 'Soukromý testovací upload z XXREALIT adminu. Video lze smazat.',
        tags: ['xxrealit', 'test'],
        privacyStatus: 'private',
      });
      return {
        ok: true,
        youtubeVideoId: upload.videoId,
        youtubeUrl: upload.url,
        youtubeUploadStatus: 'PRIVATE_UPLOADED',
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, youtubeUploadStatus: 'FAILED', message: msg };
    }
  }
}
