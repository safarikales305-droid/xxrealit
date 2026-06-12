import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { WhatsAppWebhookService } from './whatsapp-webhook.service';

/**
 * Webhook routy registrované i v AppModule — Meta musí dosáhnout na /api/whatsapp/webhook.
 */
@Controller('whatsapp')
export class WhatsAppWebhookController {
  constructor(private readonly webhook: WhatsAppWebhookService) {}

  @Get('webhook')
  verifyWebhook(
    @Query('hub.mode') mode: string | undefined,
    @Query('hub.verify_token') verifyToken: string | undefined,
    @Query('hub.challenge') challenge: string | undefined,
    @Res() res: Response,
  ) {
    const result = this.webhook.verifySubscription(mode, verifyToken, challenge);
    if (result.ok) {
      return res.status(200).type('text/plain').send(result.challenge);
    }
    return res.status(403).send('Forbidden');
  }

  @Post('webhook')
  async receiveWebhook(@Body() body: unknown) {
    await this.webhook.receiveWebhookPayload(body);
    return { success: true };
  }
}
