import {
  Body,
  Controller,
  Get,
  Header,
  HttpException,
  Logger,
  OnModuleInit,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../auth/decorators/current-user.decorator';
import { FacebookSelectPageDto } from '../dto/facebook-select-page.dto';
import { FacebookSyncToggleDto } from '../dto/facebook-sync-toggle.dto';
import { FacebookPageService } from './facebook-page.service';

@Controller('social/facebook')
export class FacebookPageController implements OnModuleInit {
  private readonly logger = new Logger(FacebookPageController.name);

  constructor(private readonly facebookPage: FacebookPageService) {}

  onModuleInit() {
    this.logger.log('Registered GET /api/social/facebook/callback');
  }

  @Get('config-status')
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  configStatus() {
    return this.facebookPage.getConfigStatus();
  }

  @Get('page-status')
  @UseGuards(JwtAuthGuard)
  pageStatus(@CurrentUser() user: AuthUser) {
    return this.facebookPage.getConnectionStatus(user.id);
  }

  @Get('connect')
  @UseGuards(JwtAuthGuard)
  async connect(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const wantsJson = req.headers.accept?.includes('application/json');
    try {
      const advanced =
        req.query.advanced === '1' ||
        req.query.advanced === 'true';
      const url = await this.facebookPage.buildConnectUrl(
        user.id,
        user.role as UserRole,
        { advanced },
      );
      if (wantsJson) {
        return res.json({ url });
      }
      return res.redirect(url);
    } catch (err) {
      const message =
        err instanceof HttpException
          ? String(err.message)
          : 'Facebook propojení není nakonfigurováno administrátorem.';
      const status = err instanceof HttpException ? err.getStatus() : 503;
      if (wantsJson) {
        return res.status(status).json({ message, error: message });
      }
      const settingsUrl = `${this.facebookPage.getFrontendSettingsUrl()}&facebook=error&reason=connect_failed`;
      return res.redirect(settingsUrl);
    }
  }

  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') oauthError: string | undefined,
    @Query('error_reason') errorReason: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (oauthError?.trim()) {
      const redirect = this.facebookPage.getErrorRedirectUrl(
        errorReason?.trim() || oauthError.trim(),
      );
      return res.redirect(302, redirect);
    }

    const result = await this.facebookPage.handleOAuthCallback(code, state);
    const wantsJson =
      req.query.format === 'json' ||
      req.headers.accept?.includes('application/json');

    if (wantsJson) {
      return res.status(result.ok ? 200 : 400).json(result);
    }

    return res.redirect(302, result.redirectUrl);
  }

  @Get('pages')
  @UseGuards(JwtAuthGuard)
  listPages(@CurrentUser() user: AuthUser) {
    return this.facebookPage.listManagedPages(user.id);
  }

  @Post('select-page')
  @UseGuards(JwtAuthGuard)
  selectPage(
    @CurrentUser() user: AuthUser,
    @Body(new ValidationPipe({ whitelist: true, transform: true })) dto: FacebookSelectPageDto,
  ) {
    return this.facebookPage.selectPage(user.id, user.role as UserRole, dto.pageId);
  }

  @Post('disconnect')
  @UseGuards(JwtAuthGuard)
  disconnect(@CurrentUser() user: AuthUser) {
    return this.facebookPage.disconnect(user.id);
  }

  @Post('sync-enabled')
  @UseGuards(JwtAuthGuard)
  setSyncEnabled(
    @CurrentUser() user: AuthUser,
    @Body(new ValidationPipe({ whitelist: true, transform: true })) dto: FacebookSyncToggleDto,
  ) {
    return this.facebookPage.setSyncEnabled(user.id, dto.syncEnabled);
  }

  @Post('sync-now')
  @UseGuards(JwtAuthGuard)
  syncNow(@CurrentUser() user: AuthUser) {
    return this.facebookPage.syncNow(user.id);
  }
}
