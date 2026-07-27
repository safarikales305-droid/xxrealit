import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { EmailSenderPurpose } from '@prisma/client';
import { AdminGuard } from '../admin/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EmailCenterService } from './email-center.service';
import { EmailSettingsService } from '../emails/email-settings.service';

@Controller('admin/email-center')
@UseGuards(JwtAuthGuard, AdminGuard)
export class EmailCenterAdminController {
  constructor(
    private readonly center: EmailCenterService,
    private readonly settings: EmailSettingsService,
  ) {}

  private userId(req: { user?: { id?: string; sub?: string } }) {
    return req.user?.id ?? req.user?.sub;
  }

  @Get('settings')
  getSettings() {
    return this.center.getSettingsOverview();
  }

  @Put('settings')
  async updateSettings(
    @Body()
    body: {
      defaultSenderName?: string;
      defaultSenderEmail?: string;
      defaultReplyToEmail?: string;
      salesSenderName?: string;
      salesSenderEmail?: string;
      salesReplyToEmail?: string;
      supportEmail?: string;
      footerContactEmail?: string;
      billingEmail?: string;
      leadEmail?: string;
      registrationEmail?: string;
      systemNotificationEmail?: string;
      contactFormEmail?: string;
      active?: boolean;
      reason?: string;
    },
    @Req() req: { user?: { id?: string; sub?: string }; ip?: string },
  ) {
    const { reason, ...data } = body;
    const updated = await this.settings.updateSettings(data, {
      userId: this.userId(req),
      reason,
      ipAddress: req.ip,
    });
    return { success: true, settings: updated };
  }

  @Get('senders')
  listSenders() {
    return this.center.listSenders();
  }

  @Post('senders')
  createSender(
    @Body()
    body: { name?: string; email?: string; purpose?: EmailSenderPurpose; active?: boolean },
  ) {
    if (!body.name || !body.email) return { success: false, error: 'name a email jsou povinné.' };
    return this.center.createSender({
      name: body.name,
      email: body.email,
      purpose: body.purpose,
      active: body.active,
    });
  }

  @Put('senders/:id')
  updateSender(
    @Param('id') id: string,
    @Body()
    body: Partial<{
      name: string;
      email: string;
      purpose: EmailSenderPurpose;
      active: boolean;
      verified: boolean;
    }>,
  ) {
    return this.center.updateSender(id, body);
  }

  @Post('senders/:id/test')
  testSender(@Param('id') id: string, @Body() body: { toEmail?: string }) {
    if (!body.toEmail?.trim()) return { success: false, error: 'toEmail je povinný.' };
    return this.center.testSender(id, body.toEmail.trim());
  }

  @Get('signatures')
  listSignatures() {
    return this.center.listSignatures();
  }

  @Post('signatures')
  createSignature(@Body() body: Record<string, unknown>) {
    return this.center.createSignature(body as never);
  }

  @Put('signatures/:id')
  updateSignature(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.center.updateSignature(id, body as never);
  }

  @Delete('signatures/:id')
  deleteSignature(@Param('id') id: string) {
    return this.center.deleteSignature(id);
  }

  @Get('templates')
  listTemplates() {
    return this.center.listTemplates();
  }

  @Get('templates/:id')
  getTemplate(@Param('id') id: string) {
    return this.center.getTemplate(id);
  }

  @Put('templates/:id')
  updateTemplate(
    @Param('id') id: string,
    @Body()
    body: {
      subject?: string;
      htmlContent?: string;
      textContent?: string;
      isActive?: boolean;
      name?: string;
      preheader?: string;
    },
  ) {
    return this.center.updateTemplate(id, body);
  }

  @Get('logs')
  listLogs(@Query('limit') limit?: string) {
    const n = Number(limit);
    return this.center.listLogs(Number.isFinite(n) ? n : 200);
  }

  @Get('inbound')
  listInbound(@Query('limit') limit?: string) {
    const n = Number(limit);
    return this.center.listInbound(Number.isFinite(n) ? n : 100);
  }

  @Get('diagnostics')
  diagnostics() {
    return this.center.getDiagnostics();
  }

  @Get('ai-sales')
  aiSalesConfig() {
    return this.center.getAiSalesEmailConfig();
  }

  @Get('reply-to-options')
  replyToOptions() {
    return this.center.listApprovedReplyToOptions();
  }

  @Post('test')
  sendTest(
    @Body()
    body: {
      toEmail?: string;
      senderType?: 'default' | 'sales';
      replyTo?: string;
      signatureId?: string;
      templateId?: string;
    },
  ) {
    if (!body.toEmail?.trim()) return { success: false, error: 'toEmail je povinný.' };
    return this.center.sendCenterTest({
      toEmail: body.toEmail.trim(),
      senderType: body.senderType,
      replyTo: body.replyTo,
      signatureId: body.signatureId,
      templateId: body.templateId,
    });
  }
}
