import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/guards/admin.guard';
import { WhatsAppClickDto } from './dto/whatsapp-click.dto';
import { WhatsAppSendDto } from './dto/whatsapp-send.dto';
import { WhatsAppService } from './whatsapp.service';

@Controller('whatsapp')
export class WhatsAppController {
  constructor(private readonly whatsapp: WhatsAppService) {}

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

}
