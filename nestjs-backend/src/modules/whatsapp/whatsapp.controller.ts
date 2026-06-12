import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Res,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/guards/admin.guard';
import { WhatsAppClickDto } from './dto/whatsapp-click.dto';
import { WhatsAppSendDto } from './dto/whatsapp-send.dto';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppWebhookService } from './whatsapp-webhook.service';

@Controller('whatsapp')
export class WhatsAppController {
  constructor(
    private readonly whatsapp: WhatsAppService,
    private readonly webhook: WhatsAppWebhookService,
  ) {}

  @Get('config-status')
  configStatus() {
    return this.whatsapp.getConfigStatus();
  }

  @Get('admin-stats')
  @UseGuards(JwtAuthGuard, AdminGuard)
  adminStats() {
    return this.whatsapp.getAdminStats();
  }

  /** Veřejné — zaloguje lead a vrátí wa.me URL (telefon se neposílá do UI jinak). */
  @Post('click')
  click(@Body(new ValidationPipe({ whitelist: true, transform: true })) dto: WhatsAppClickDto) {
    return this.whatsapp.logWaMeClick(dto);
  }

  @Post('send')
  @UseGuards(JwtAuthGuard, AdminGuard)
  send(@Body(new ValidationPipe({ whitelist: true, transform: true })) dto: WhatsAppSendDto) {
    return this.whatsapp.sendCloudMessage(dto);
  }

  /** Meta WhatsApp webhook — ověření subscription (hub.challenge). */
  @Get('webhook')
  verifyWebhook(
    @Query('hub.mode') mode: string | undefined,
    @Query('hub.verify_token') verifyToken: string | undefined,
    @Query('hub.challenge') challenge: string | undefined,
    @Res() res: Response,
  ) {
    const result = this.webhook.verifySubscription(mode, verifyToken, challenge);
    if (result.ok) {
      return res.status(200).send(result.challenge);
    }
    return res.status(403).send('Forbidden');
  }

  /** Meta WhatsApp webhook — příjem zpráv a stavů doručení. */
  @Post('webhook')
  async receiveWebhook(@Body() body: unknown, @Res() res: Response) {
    await this.webhook.receiveWebhookPayload(body);
    return res.status(200).send('OK');
  }
}
