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
import { WhatsAppConfigService } from './whatsapp-config.service';
import { WhatsAppService } from './whatsapp.service';

@Controller('whatsapp')
export class WhatsAppController {
  constructor(
    private readonly whatsapp: WhatsAppService,
    private readonly config: WhatsAppConfigService,
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

  @Get('webhook')
  verifyWebhook(
    @Query('hub.mode') mode: string | undefined,
    @Query('hub.verify_token') verifyToken: string | undefined,
    @Query('hub.challenge') challenge: string | undefined,
    @Res() res: Response,
  ) {
    const expected = this.config.getWebhookVerifyToken();
    if (mode === 'subscribe' && expected && verifyToken === expected && challenge) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send('Forbidden');
  }

  @Post('webhook')
  receiveWebhook(@Body() body: unknown) {
    return this.whatsapp.handleWebhookPayload(body);
  }
}
