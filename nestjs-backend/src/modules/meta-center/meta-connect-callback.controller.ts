import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { MetaConnectOAuthService } from './meta-connect-oauth.service';

@Controller('social/facebook')
export class MetaConnectCallbackController {
  constructor(private readonly oauth: MetaConnectOAuthService) {}

  @Get('meta-connect-callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') oauthError: string | undefined,
    @Query('error_reason') errorReason: string | undefined,
    @Query('error_description') errorDescription: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const result = await this.oauth.handleCallback(
      code,
      state,
      oauthError,
      errorReason,
      errorDescription,
    );
    const wantsJson =
      req.headers.accept?.includes('application/json') ||
      req.query.format === 'json';
    if (wantsJson) {
      return res.status(result.ok ? 200 : 400).json(result);
    }
    return res.redirect(302, result.redirectUrl);
  }
}
