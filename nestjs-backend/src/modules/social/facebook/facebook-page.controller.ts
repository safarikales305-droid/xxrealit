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
import { FacebookConfigService } from './facebook-config.service';
import { FacebookUnifiedOAuthService } from './facebook-unified-oauth.service';

@Controller('social/facebook')
export class FacebookPageController implements OnModuleInit {
  private readonly logger = new Logger(FacebookPageController.name);

  constructor(
    private readonly facebookPage: FacebookPageService,
    private readonly facebookAuth: FacebookAuthService,
    private readonly facebookConfig: FacebookConfigService,
    private readonly unifiedOAuth: FacebookUnifiedOAuthService,
  ) {}

  onModuleInit() {
    this.logger.log('Registered GET /api/social/facebook/meta-connect-callback (unified OAuth)');
    this.logger.log('Registered GET /api/social/facebook/finish-login');
    this.logger.log('Legacy callbacks redirect 301 → meta-connect-callback');
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
    const wantsJson = this.wantsJsonResponse(req);
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
  async callbackLegacy(@Req() req: Request, @Res() res: Response) {
    return this.redirectLegacyCallback(req, res, 'callback');
  }

  @Get('meta-connect-callback')
  async metaConnectCallback(@Req() req: Request, @Res() res: Response) {
    this.logger.log(`META_OAUTH_CALLBACK_START fullUrl=${req.protocol}://${req.get('host')}${req.originalUrl}`);
    this.logger.log(`META_OAUTH_CALLBACK originalUrl=${req.originalUrl}`);
    this.logger.log(`META_OAUTH_CALLBACK query=${JSON.stringify(req.query)}`);
    this.logger.log(`META_OAUTH_CALLBACK headers=${JSON.stringify(req.headers)}`);
    this.logger.log(`META_OAUTH_CALLBACK cookieHeader=${req.get('cookie') ?? '(none)'}`);

    const result = await this.unifiedOAuth.dispatch(req);
    return this.respondOAuth(res, req, result);
  }

  @Get('finish-login')
  async finishLogin(
    @Query('state') state: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const result = await this.facebookAuth.consumeLoginSession(state);
    return this.respondOAuth(res, req, result);
  }

  @Get('page-callback')
  async pageCallbackLegacy(@Req() req: Request, @Res() res: Response) {
    return this.redirectLegacyCallback(req, res, 'page-callback');
  }

  private redirectLegacyCallback(req: Request, res: Response, legacyPath: string) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(req.query)) {
      if (Array.isArray(value)) {
        if (value[0] != null) params.set(key, String(value[0]));
      } else if (value != null) {
        params.set(key, String(value));
      }
    }
    const qs = params.toString();
    const canonical =
      this.facebookConfig.tryGetMetaRedirectUri() ??
      `${req.protocol}://${req.get('host') ?? ''}/api/social/facebook/meta-connect-callback`;
    const target = qs ? `${canonical}?${qs}` : canonical;
    this.logger.log(`LEGACY_OAUTH_REDIRECT from=${legacyPath} to=${target}`);
    return res.redirect(301, target);
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
    @Query('mode') mode: string | undefined,
    @Query('reselect') reselect: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.connect(user, mode, reselect, req, res);
  }

  /** @deprecated Použijte connect-page */
  @Get('connect')
  @UseGuards(JwtAuthGuard)
  async connect(
    @CurrentUser() user: AuthUser,
    @Query('mode') mode: string | undefined,
    @Query('reselect') reselect: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const wantsJson = this.wantsJsonResponse(req);
    const isChangePage =
      mode === 'change_page' || reselect === '1' || reselect === 'true';
    try {
      const url = await this.facebookPage.buildConnectUrl(user.id, user.role as UserRole, {
        mode: isChangePage ? 'change_page' : 'connect',
      });
      if (wantsJson) return res.json({ url });
      return res.redirect(url);
    } catch (err) {
      const message =
        err instanceof HttpException
          ? String(err.message)
          : 'Facebook propojení není nakonfigurováno administrátorem.';
      const status = err instanceof HttpException ? err.getStatus() : 503;
      const scopesNotAvailable =
        status === 403 && message.includes('Pages oprávnění');
      if (wantsJson) {
        return res.status(status).json({
          message,
          error: message,
          ...(scopesNotAvailable
            ? { pageScopesNotAvailable: true, reviewRequired: true }
            : {}),
        });
      }
      if (scopesNotAvailable) {
        return res.redirect(302, this.facebookPage.getPageScopesNotAvailableRedirectUrl());
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
    return this.facebookPage.listAvailablePages(user.id, user.role as UserRole);
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

  @Post('disconnect-page')
  @UseGuards(JwtAuthGuard)
  disconnectPageOnly(@CurrentUser() user: AuthUser) {
    return this.facebookPage.disconnect(user.id);
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

  private wantsJsonResponse(req: Request): boolean {
    const acceptHeader = req.headers.accept ?? '';
    return req.query.format === 'json' || acceptHeader.includes('application/json');
  }

  private respondOAuth(
    res: Response,
    req: Request,
    result: {
      ok: boolean;
      redirectUrl: string;
      accessToken?: string;
      pageReviewRequired?: boolean;
      pageScopesNotAvailable?: boolean;
      message?: string;
    },
  ) {
    const wantsJson = this.wantsJsonResponse(req);
    if (wantsJson) {
      return res.status(result.ok ? 200 : 400).json(result);
    }
    return res.redirect(302, result.redirectUrl);
  }
}
