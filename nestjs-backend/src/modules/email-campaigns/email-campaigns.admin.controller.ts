import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { EmailCampaignStatus } from '@prisma/client';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/guards/admin.guard';
import { EmailCampaignsService, type AudienceConfig } from './email-campaigns.service';

@Controller('admin/email-campaigns')
@UseGuards(JwtAuthGuard, AdminGuard)
export class EmailCampaignsAdminController {
  constructor(private readonly campaigns: EmailCampaignsService) {}

  @Get()
  list() {
    return this.campaigns.list();
  }

  @Get('templates')
  templates() {
    return this.campaigns.getTemplates();
  }

  @Post('upload-image')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  uploadImage(@UploadedFile() file: Express.Multer.File) {
    return this.campaigns.uploadCampaignImage(file);
  }

  @Post('recipients/count')
  countRecipients(
    @Body()
    body: {
      audience?: AudienceConfig;
      minDaysBetweenSends?: number;
    },
  ) {
    return this.campaigns.countRecipients(
      body.audience ?? { mode: 'all_imported' },
      body.minDaysBetweenSends ?? 7,
    );
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.campaigns.getOne(id);
  }

  @Get(':id/recipients')
  listRecipients(
    @Param('id') id: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.campaigns.listRecipients(id, {
      status,
      page: page != null ? Number(page) : 0,
      limit: limit != null ? Number(limit) : 50,
    });
  }

  @Get(':id/sent-email')
  getSentEmail(
    @Param('id') id: string,
    @Query('logId') logId?: string,
    @Query('recipientId') recipientId?: string,
  ) {
    return this.campaigns.getSentEmail(id, { logId, recipientId });
  }

  @Post(':id/duplicate')
  duplicate(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.campaigns.duplicate(id, user.id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      title?: string;
      type?: string;
      senderName?: string;
      minDaysBetweenSends?: number;
      audience?: AudienceConfig;
      templateKey?: string;
      steps?: Array<{
        stepOrder: number;
        name?: string;
        subject: string;
        htmlContent: string;
        textContent?: string;
        delayDays?: number;
        delayHours?: number;
        isActive?: boolean;
      }>;
    },
  ) {
    if (!body.title?.trim()) {
      return { success: false, error: 'title je povinný.' };
    }
    return this.campaigns.create(
      {
        title: body.title,
        type: body.type,
        senderName: body.senderName,
        minDaysBetweenSends: body.minDaysBetweenSends,
        audience: body.audience,
        templateKey: body.templateKey,
        steps: body.steps,
      },
      user.id,
    );
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body()
    body: {
      title?: string;
      senderName?: string;
      minDaysBetweenSends?: number;
      audience?: AudienceConfig;
      status?: EmailCampaignStatus;
      steps?: Array<{
        id?: string;
        stepOrder: number;
        name?: string;
        subject: string;
        htmlContent: string;
        textContent?: string;
        delayDays?: number;
        delayHours?: number;
        isActive?: boolean;
      }>;
    },
  ) {
    return this.campaigns.update(id, body);
  }

  @Get(':id/preview')
  preview(
    @Param('id') id: string,
    @Query('stepOrder') stepOrder?: string,
    @Query('sampleRecipientId') sampleRecipientId?: string,
    @Query('sampleEmail') sampleEmail?: string,
  ) {
    return this.campaigns.preview(id, {
      stepOrder: stepOrder != null ? Number(stepOrder) : 0,
      sampleRecipientId,
      sampleEmail,
    });
  }

  @Post(':id/test-send')
  testSend(
    @Param('id') id: string,
    @Body() body: { toEmail?: string; stepOrder?: number },
  ) {
    const to = String(body.toEmail ?? '').trim();
    if (!to) return { ok: false, error: 'toEmail je povinný.' };
    return this.campaigns.testSend(id, to, body.stepOrder ?? 0);
  }

  @Post(':id/start')
  start(@Param('id') id: string) {
    return this.campaigns.start(id);
  }

  @Post(':id/pause')
  pause(@Param('id') id: string) {
    return this.campaigns.pause(id);
  }
}
