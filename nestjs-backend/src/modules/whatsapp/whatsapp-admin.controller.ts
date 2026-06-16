import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/guards/admin.guard';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator';
import { WhatsAppSettingsService } from './whatsapp-settings.service';
import { WhatsAppMarketingService } from './whatsapp-marketing.service';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppMetaTemplatesService } from './whatsapp-meta-templates.service';
import {
  CreateWhatsAppMarketingCampaignDto,
  PreviewWhatsAppCampaignDto,
  UpdateWhatsAppIntegrationSettingsDto,
  WhatsAppCampaignTestDto,
  WhatsAppHistoryQueryDto,
  WhatsAppTestSendDto,
} from './dto/whatsapp-admin.dto';

@Controller('whatsapp/admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class WhatsAppAdminController {
  constructor(
    private readonly settings: WhatsAppSettingsService,
    private readonly marketing: WhatsAppMarketingService,
    private readonly whatsapp: WhatsAppService,
    private readonly metaTemplates: WhatsAppMetaTemplatesService,
  ) {}

  @Get('settings')
  getSettings() {
    return this.settings.getSettings();
  }

  @Patch('settings')
  updateSettings(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: UpdateWhatsAppIntegrationSettingsDto,
  ) {
    return this.settings.updateSettings(dto);
  }

  @Post('test')
  sendTest(
    @Body(new ValidationPipe({ whitelist: true, transform: true })) dto: WhatsAppTestSendDto,
  ) {
    return this.marketing.sendTestMessage(dto.toPhone);
  }

  @Get('last-log')
  lastLog() {
    return this.marketing.getLastLog();
  }

  @Get('stats')
  stats() {
    return this.whatsapp.getAdminStats();
  }

  @Get('history')
  history(
    @Query(new ValidationPipe({ whitelist: true, transform: true })) query: WhatsAppHistoryQueryDto,
  ) {
    return this.marketing.listHistory(query.limit ?? 100, query.campaignId);
  }

  @Get('templates')
  listTemplates(@Query('approvedOnly') approvedOnly?: string) {
    return this.metaTemplates.listTemplates(approvedOnly === 'true');
  }

  @Post('templates/sync')
  syncTemplates() {
    return this.metaTemplates.syncTemplates();
  }

  @Get('campaigns')
  listCampaigns() {
    return this.marketing.listCampaigns();
  }

  @Get('campaigns/:id/logs')
  campaignLogs(@Param('id') id: string) {
    return this.marketing.getCampaignLogs(id);
  }

  @Get('campaigns/:id')
  getCampaign(@Param('id') id: string) {
    return this.marketing.getCampaign(id);
  }

  @Post('campaigns')
  createCampaign(
    @CurrentUser() user: AuthUser,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: CreateWhatsAppMarketingCampaignDto,
  ) {
    return this.marketing.createCampaign(user.id, dto);
  }

  @Patch('campaigns/:id')
  updateCampaign(
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: CreateWhatsAppMarketingCampaignDto,
  ) {
    return this.marketing.updateCampaign(id, dto);
  }

  @Delete('campaigns/:id')
  deleteCampaign(@Param('id') id: string) {
    return this.marketing.deleteCampaign(id);
  }

  @Post('campaigns/preview')
  previewCampaign(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: PreviewWhatsAppCampaignDto,
  ) {
    return this.marketing.previewMessage(dto);
  }

  @Post('campaigns/:id/test')
  testCampaign(
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true, transform: true })) dto: WhatsAppCampaignTestDto,
  ) {
    return this.marketing.testCampaign(id, dto.toPhone);
  }

  @Post('campaigns/:id/run')
  runCampaign(@Param('id') id: string) {
    return this.marketing.runCampaign(id);
  }
}
