import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';

/**
 * Příprava pro real-time Facebook Page webhooks (Meta challenge + feed změny).
 * Cron ve FacebookPageSyncService zůstává jako fallback.
 */
@Controller('social/facebook/webhook')
export class FacebookWebhookController {
  constructor(private readonly config: ConfigService) {}

  @Get()
  verifyChallenge(
    @Query('hub.mode') mode: string | undefined,
    @Query('hub.verify_token') verifyToken: string | undefined,
    @Query('hub.challenge') challenge: string | undefined,
    @Res() res: Response,
  ) {
    const expected = this.config.get<string>('FACEBOOK_WEBHOOK_VERIFY_TOKEN')?.trim();
    if (mode === 'subscribe' && expected && verifyToken === expected && challenge) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send('Forbidden');
  }

  @Post()
  receiveWebhook(@Body() body: unknown) {
    // TODO: zpracovat page feed events a spustit sync pro dotčené pageId.
    return { ok: true, received: Boolean(body) };
  }
}
