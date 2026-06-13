import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpException,
  Logger,
  OnModuleInit,
  Param,
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
import { FacebookAuthService } from './facebook-auth.service';
import { FacebookPageService } from './facebook-page.service';

@Controller('social/facebook')
export class FacebookPageController implements OnModuleInit {
  private readonly logger = new Logger(FacebookPageController.name);

  constructor(
    private readonly facebookPage: FacebookPageService,
    private readonly facebookAuth: FacebookAuthService,
  ) {}

  onModuleInit() {
    this.logger.log('Registered GET /api/social/facebook/callback');
    this.logger.log('Registered GET /api/social/facebook/page-callback');
  }

  @Get('config-status')
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  configStatus() {
    return this.facebookPage.getConfigStatus();
  }

  @Get('admin-stats')
  adminStats() {
    return this.facebookPage.getAdminStats();
  }

  @Get('login')
  async login(@Req() req: Request, @Res() res: Response) {
    const wantsJson = req.headers.accept?.includes('application/json');
    try {
      const url = await this.facebookAuth.buildLoginUrl();
      if (wantsJson) return res.json({ url });
      return res.redirect(url);
    } catch (err) {
      const message =
        err instanceof HttpException ? String(err.message) : 'Facebook login není dostupný.';
      if (wantsJson) {
        return res.status(503).json({ message, error: message });
      }
      return res.redirect(302, this.facebookAuth.getErrorRedirectUrl('login_failed'));
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
      return res.redirect(302, this.facebookAuth.getErrorRedirectUrl(errorReason?.trim() || oauthError.trim()));
    }

    const result = await this.facebookAuth.handleLoginCallback(code, state);
    return this.respondOAuth(res, req, result);
  }

  @Get('page-callback')
  async pageCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') oauthError: string | undefined,
    @Query('error_reason') errorReason: string | undefined,
    @Query('error_description') errorDescription: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const result = await this.facebookPage.handlePageCallback(
      code,
      state,
      oauthError,
      errorReason,
      errorDescription,
    );
    return this.respondOAuth(res, req, result);
  }

  @Get('page-status')
  @UseGuards(JwtAuthGuard)
  pageStatus(@CurrentUser() user: AuthUser) {
    return this.facebookPage.getConnectionStatus(user.id);
  }

  @Get('connect-page')
  @UseGuards(JwtAuthGuard)
  async connectPage(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.connect(user, req, res);
  }

  /** @deprecated Použijte connect-page */
  @Get('connect')
  @UseGuards(JwtAuthGuard)
  async connect(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const wantsJson = req.headers.accept?.includes('application/json');
    try {
      const url = await this.facebookPage.buildPageConnectUrl(user.id, user.role as UserRole);
      if (wantsJson) return res.json({ url });
      return res.redirect(url);
    } catch (err) {
      const message =
        err instanceof HttpException
          ? String(err.message)
          : 'Facebook propojení není nakonfigurováno administrátorem.';
      const status = err instanceof HttpException ? err.getStatus() : 503;
      const reviewRequired =
        status === 403 &&
        (message.includes('Meta Review') || message.includes('Admin/Tester'));
      if (wantsJson) {
        return res.status(status).json({
          message,
          error: message,
          ...(reviewRequired ? { reviewRequired: true } : {}),
        });
      }
      if (reviewRequired) {
        return res.redirect(302, this.facebookPage.getPageReviewRequiredRedirectUrl());
      }
      return res.redirect(
        302,
        `${this.facebookPage.getSocialIntegrationsUrl()}&facebook=error&reason=connect_failed`,
      );
    }
  }

  @Get('pages')
  @UseGuards(JwtAuthGuard)
  async listPages(@CurrentUser() user: AuthUser) {
    const status = await this.facebookPage.getConnectionStatus(user.id);
    if (status.pendingPageSelection) {
      return this.facebookPage.listManagedPages(user.id);
    }
    return status.pages;
  }

  @Post('pages/:pageId/select')
  @UseGuards(JwtAuthGuard)
  selectPageById(
    @CurrentUser() user: AuthUser,
    @Param('pageId') pageId: string,
  ) {
    return this.facebookPage.selectPage(user.id, user.role as UserRole, pageId);
  }

  @Post('pages/:pageId/sync')
  @UseGuards(JwtAuthGuard)
  syncPageById(@CurrentUser() user: AuthUser, @Param('pageId') pageId: string) {
    return this.facebookPage.syncPageById(user.id, pageId);
  }

  @Delete('pages/:pageId')
  @UseGuards(JwtAuthGuard)
  deletePage(@CurrentUser() user: AuthUser, @Param('pageId') pageId: string) {
    return this.facebookPage.disconnectPage(user.id, pageId);
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

  private respondOAuth(
    res: Response,
    req: Request,
    result: {
      ok: boolean;
      redirectUrl: string;
      accessToken?: string;
      pageReviewRequired?: boolean;
      message?: string;
    },
  ) {
    const wantsJson =
      req.query.format === 'json' || req.headers.accept?.includes('application/json');
    if (wantsJson) {
      return res.status(result.ok ? 200 : 400).json(result);
    }
    return res.redirect(302, result.redirectUrl);
  }
}
