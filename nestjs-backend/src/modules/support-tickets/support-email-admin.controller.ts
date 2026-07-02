import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../admin/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CreateSupportEmailMailboxDto,
  InboundSupportEmailWebhookDto,
  UpdateSupportEmailMailboxDto,
  UpdateSupportEmailSettingsDto,
} from './dto/support-email.dto';
import { SupportEmailMailboxService } from './support-email-mailbox.service';
import { SupportTicketInboundService } from './support-ticket-inbound.service';

@Controller('admin/support-email')
@UseGuards(JwtAuthGuard, AdminGuard)
export class SupportEmailAdminController {
  constructor(private readonly mailboxes: SupportEmailMailboxService) {}

  @Get('settings')
  getSettings() {
    return this.mailboxes.getSettings();
  }

  @Patch('settings')
  updateSettings(@Body() dto: UpdateSupportEmailSettingsDto) {
    return this.mailboxes.updateSettings(dto);
  }

  @Get('mailboxes')
  listMailboxes() {
    return this.mailboxes.listMailboxes();
  }

  @Get('mailboxes/for-reply')
  listForReply() {
    return this.mailboxes.listActiveForReply();
  }

  @Post('mailboxes')
  create(@Body() dto: CreateSupportEmailMailboxDto) {
    return this.mailboxes.createMailbox(dto);
  }

  @Patch('mailboxes/:id')
  update(@Param('id') id: string, @Body() dto: UpdateSupportEmailMailboxDto) {
    return this.mailboxes.updateMailbox(id, dto);
  }

  @Delete('mailboxes/:id')
  remove(@Param('id') id: string) {
    return this.mailboxes.deleteMailbox(id);
  }
}

@Controller('support-tickets/inbound')
export class SupportTicketInboundController {
  constructor(private readonly inbound: SupportTicketInboundService) {}

  @Post('email')
  async webhook(
    @Body() dto: InboundSupportEmailWebhookDto,
    @Headers('x-support-webhook-secret') secret?: string,
  ) {
    const expected = this.inbound.webhookSecret();
    if (expected && secret !== expected) {
      throw new UnauthorizedException('Neplatný webhook secret');
    }
    return this.inbound.processInboundMime(dto.rawMime);
  }

  @Post('poll')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async manualPoll() {
    return this.inbound.pollAllMailboxes();
  }
}
