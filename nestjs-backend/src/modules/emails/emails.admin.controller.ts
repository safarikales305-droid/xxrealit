import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/guards/admin.guard';
import { EmailsService } from './emails.service';

@Controller('admin/emails')
@UseGuards(JwtAuthGuard, AdminGuard)
export class EmailsAdminController {
  constructor(private readonly emails: EmailsService) {}

  @Get('logs')
  logs(@Query('limit') limit?: string) {
    const n = Number(limit);
    return this.emails.listLogs(Number.isFinite(n) ? n : 200);
  }

  @Get('templates')
  templates() {
    return this.emails.listTemplates();
  }

  @Patch('templates/:id')
  updateTemplate(
    @Param('id') id: string,
    @Body()
    body: {
      subject?: string;
      htmlContent?: string;
      textContent?: string;
      isActive?: boolean;
      name?: string;
    },
  ) {
    return this.emails.updateTemplate(id, body);
  }

  @Post('templates/:id/test')
  async sendTemplateTest(
    @Param('id') id: string,
    @Body() body: { toEmail?: string },
  ) {
    const to = String(body.toEmail ?? '').trim().toLowerCase();
    if (!to) return { success: false, error: 'toEmail je povinný.' };
    const template = (await this.emails.listTemplates()).find((x) => x.id === id);
    if (!template) return { success: false, error: 'Šablona nebyla nalezena.' };
    await this.emails.sendTemplatedEmail({
      type: 'template_test',
      templateKey: template.key,
      to,
      variables: {
        userName: 'Testovací uživatel',
        ctaUrl: 'https://www.xxrealit.cz',
        title: 'Test šablony',
        subject: 'Test šablony',
        contentHtml: '<p>Toto je testovací obsah.</p>',
        contentText: 'Toto je testovací obsah.',
        resetUrl: 'https://www.xxrealit.cz/reset-hesla?token=test',
        listingTitle: 'Testovací inzerát',
        listingLocation: 'Praha',
        listingPrice: '1 000 000 Kč',
        listingUrl: 'https://www.xxrealit.cz/nemovitost/test',
        senderMessage: 'Test zpráva',
      },
      metadata: { templateId: id, isTest: true },
    });
    return { success: true };
  }

  @Get('campaigns')
  campaigns() {
    return this.emails.listCampaigns();
  }

  @Post('campaigns')
  createCampaign(
    @Body()
    body: {
      type?: string;
      title?: string;
      subject?: string;
      templateKey?: string;
      htmlContent?: string;
      scheduledAt?: string;
    },
  ) {
    if (!body.type || !body.title || !body.subject || !body.htmlContent) {
      return { success: false, error: 'type, title, subject a htmlContent jsou povinné.' };
    }
    return this.emails.createCampaign({
      type: body.type,
      title: body.title,
      subject: body.subject,
      templateKey: body.templateKey,
      htmlContent: body.htmlContent,
      scheduledAt: body.scheduledAt,
    });
  }
}
