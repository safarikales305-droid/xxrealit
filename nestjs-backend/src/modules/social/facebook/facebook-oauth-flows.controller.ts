import {
  Controller,
  Get,
  HttpException,
  Logger,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../../admin/guards/admin.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../auth/decorators/current-user.decorator';
import { MetaConnectOAuthService } from '../../meta-center/meta-connect-oauth.service';
import {
  normalizeMetaOAuthFlowKey,
  type MetaOAuthFlowKey,
} from '../../meta-center/meta-oauth-flows';

@Controller('social/facebook/oauth')
@UseGuards(JwtAuthGuard, AdminGuard)
export class FacebookOAuthFlowsController {
  private readonly logger = new Logger(FacebookOAuthFlowsController.name);

  constructor(private readonly connectOAuth: MetaConnectOAuthService) {}

  @Get('login')
  async oauthLogin(@CurrentUser() user: AuthUser, @Req() req: Request, @Res() res: Response) {
    return this.dispatchFlow(user, 'login', req, res);
  }

  @Get('pages')
  async oauthPages(@CurrentUser() user: AuthUser, @Req() req: Request, @Res() res: Response) {
    return this.dispatchFlow(user, 'pages', req, res);
  }

  @Get('catalog')
  async oauthCatalog(@CurrentUser() user: AuthUser, @Req() req: Request, @Res() res: Response) {
    return this.dispatchFlow(user, 'catalog', req, res);
  }

  @Get('instagram')
  async oauthInstagram(@CurrentUser() user: AuthUser, @Req() req: Request, @Res() res: Response) {
    return this.dispatchFlow(user, 'instagram', req, res);
  }

  @Get('marketing')
  async oauthMarketing(@CurrentUser() user: AuthUser, @Req() req: Request, @Res() res: Response) {
    return this.dispatchFlow(user, 'marketing', req, res);
  }

  /** @deprecated Použijte /oauth/marketing */
  @Get('ads')
  async oauthAdsLegacy(@CurrentUser() user: AuthUser, @Req() req: Request, @Res() res: Response) {
    return this.dispatchFlow(user, 'marketing', req, res);
  }

  @Get('whatsapp')
  async oauthWhatsapp(@CurrentUser() user: AuthUser, @Req() req: Request, @Res() res: Response) {
    return this.dispatchFlow(user, 'whatsapp', req, res);
  }

  private wantsJsonResponse(req: Request): boolean {
    const acceptHeader = req.headers.accept ?? '';
    return req.query.format === 'json' || acceptHeader.includes('application/json');
  }

  private async dispatchFlow(
    user: AuthUser,
    flowRaw: MetaOAuthFlowKey,
    req: Request,
    res: Response,
  ) {
    const flow = normalizeMetaOAuthFlowKey(flowRaw);
    if (!flow) {
      throw new HttpException('Neznámý OAuth flow.', 400);
    }
    try {
      const result = await this.connectOAuth.buildOAuthUrlSafe(user.id, flow, false);
      if (!result.success) {
        const message = result.message;
        const status = 200;
        if (this.wantsJsonResponse(req)) {
          return res.status(status).json({
            success: false,
            message,
            url: null,
            scopeWarnings: result.scopeWarnings ?? [],
          });
        }
        const adminUrl = this.connectOAuth.getAdminUrl();
        return res.redirect(
          302,
          `${adminUrl}?meta=error&reason=${encodeURIComponent(message.slice(0, 200))}`,
        );
      }
      const preview = result.preview;
      this.logger.log(`OAUTH_FLOW_START flow=${flow} userId=${user.id}`);
      if (this.wantsJsonResponse(req)) {
        return res.json({ success: true, url: result.url, ...preview });
      }
      return res.redirect(result.url);
    } catch (err) {
      const message =
        err instanceof HttpException ? String(err.message) : 'Meta OAuth není dostupné.';
      const status = err instanceof HttpException ? err.getStatus() : 503;
      if (this.wantsJsonResponse(req)) {
        return res.status(status).json({ message, error: message });
      }
      const adminUrl = this.connectOAuth.getAdminUrl();
      return res.redirect(
        302,
        `${adminUrl}?meta=error&reason=${encodeURIComponent(message.slice(0, 200))}`,
      );
    }
  }
}
