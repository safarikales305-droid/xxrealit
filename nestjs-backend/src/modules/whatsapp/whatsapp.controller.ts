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

@Controller('whatsapp')
export class WhatsAppController {
  constructor(private readonly whatsapp: WhatsAppService) {}

  @Get('webhook')
  verifyWebhook(
    @Query('hub.mode') mode: string | undefined,
    @Query('hub.verify_token') token: string | undefined,
    @Query('hub.challenge') challenge: string | undefined,
    @Res() res: Response,
  ) {
    if (
      mode === 'subscribe' &&
      token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN
    ) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send('Forbidden');
  }

  @Post('webhook')
  receiveWebhook(@Body() body: unknown) {
    console.log('WhatsApp webhook payload', JSON.stringify(body));
    return { success: true };
  }

  @Get('config-status')
  configStatus() {
    return this.whatsapp.getConfigStatus();
  }

  @Get('admin-stats')
  @UseGuards(JwtAuthGuard, AdminGuard)
  adminStats() {
    return this.whatsapp.getAdminStats();
  }

  @Post('click')
  click(@Body(new ValidationPipe({ whitelist: true, transform: true })) dto: WhatsAppClickDto) {
    return this.whatsapp.logWaMeClick(dto);
  }

  @Post('send')
  @UseGuards(JwtAuthGuard, AdminGuard)
  send(@Body(new ValidationPipe({ whitelist: true, transform: true })) dto: WhatsAppSendDto) {
    return this.whatsapp.sendCloudMessage(dto);
  }
}
