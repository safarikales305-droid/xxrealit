import {
  Body,
  Controller,
  Get,
  Header,
  HttpException,
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
export class FacebookPageController {
  constructor(private readonly facebookPage: FacebookPageService) {}

  @Get('config-status')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
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
      const url = await this.facebookPage.buildConnectUrl(user.id, user.role as UserRole);
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
    @Res() res: Response,
  ) {
    const redirect = await this.facebookPage.handleOAuthCallback(code, state);
    return res.redirect(redirect);
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
