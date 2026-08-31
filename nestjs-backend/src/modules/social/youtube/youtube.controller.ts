import {
  Controller,
  Get,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AdminGuard } from '../../admin/guards/admin.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../../auth/decorators/current-user.decorator';
import { YouTubeConfigService } from './youtube.config.service';
import { YouTubeOAuthService } from './youtube-oauth.service';
import { YouTubePublishJobService } from './youtube-publish-job.service';

@Controller('social/youtube')
export class YoutubeController {
  constructor(
    private readonly oauth: YouTubeOAuthService,
    private readonly config: YouTubeConfigService,
    private readonly publishJobs: YouTubePublishJobService,
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
    return { ok: true, message: 'Odpojení přes admin DB — zatím neimplementováno.' };
  }
}
