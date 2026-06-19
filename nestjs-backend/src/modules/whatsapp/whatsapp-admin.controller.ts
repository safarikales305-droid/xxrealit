import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/guards/admin.guard';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator';
import { WhatsAppSettingsService } from './whatsapp-settings.service';
import { WhatsAppMarketingService } from './whatsapp-marketing.service';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppMetaTemplatesService } from './whatsapp-meta-templates.service';
import { WhatsAppDiagnosticService } from './whatsapp-diagnostic.service';
import { WhatsAppCampaignDebugService } from './whatsapp-campaign-debug.service';
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
    private readonly diagnostic: WhatsAppDiagnosticService,
    private readonly campaignDebug: WhatsAppCampaignDebugService,
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

  @Post('templates/cleanup')
  cleanupTemplates() {
    return this.metaTemplates.cleanupOldTemplates();
  }

  @Get('templates/sync/last-raw')
  templatesSyncLastRaw() {
    return { raw: this.metaTemplates.getLastSyncRawResponse() };
  }

  @Get('diagnostics')
  diagnostics() {
    return this.diagnostic.getDiagnostics();
  }

  @Get('waba/phone-numbers')
  listWabaPhoneNumbers(@Query('wabaId') wabaId?: string) {
    return this.diagnostic.listWabaPhoneNumbers(wabaId);
  }

  @Post('verify/waba')
  verifyWaba() {
    return this.diagnostic.verifyWabaAccount();
  }

  @Post('verify/phone')
  verifyPhone() {
    return this.diagnostic.verifyPhoneNumber();
  }

  @Get('debug/last-error')
  campaignDebugLastError() {
    return { error: this.campaignDebug.getLastError() };
  }

  @Get('campaigns')
  listCampaigns() {
    return this.marketing.listCampaigns();
  }

  @Get('campaigns/:id/logs')
  campaignLogs(@Param('id') id: string) {
    return this.marketing.getCampaignLogs(id);
  }

  @Get('campaigns/:id/last-error')
  campaignLastError(@Param('id') id: string) {
    return this.marketing.getLastCampaignError(id);
  }

  @Get('campaigns/:id/final-payload')
  campaignFinalPayload(
    @Param('id') id: string,
    @Query('toPhone') toPhone?: string,
  ) {
    return this.marketing.getCampaignFinalPayload(id, toPhone);
  }

  @Get('campaigns/:id/last-log')
  campaignLastLog(@Param('id') id: string) {
    return this.marketing.getLastCampaignLog(id);
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

  @Post('campaigns/:id/duplicate')
  duplicateCampaign(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.marketing.duplicateCampaign(user.id, id);
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

  @Post('campaigns/upload-image')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  uploadCampaignImage(@UploadedFile() file: Express.Multer.File) {
    return this.marketing.uploadCampaignHeaderImage(file);
  }

  @Post('campaigns/:id/test')
  async testCampaign(
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true, transform: true })) dto: WhatsAppCampaignTestDto,
  ) {
    const payload = { campaignId: id, toPhone: dto.toPhone };
    try {
      return await this.marketing.testCampaign(id, dto.toPhone);
    } catch (error) {
      const ctx = await this.marketing.getCampaignDebugContext(id);
      this.campaignDebug.recordFailure(error, {
        action: 'test',
        campaignId: id,
        payload,
        selectedTemplate: ctx.selectedTemplate ?? null,
        variablesCount: ctx.variablesCount ?? null,
        wabaId: ctx.wabaId ?? null,
      });
    }
  }

  @Post('campaigns/:id/run')
  async runCampaign(@Param('id') id: string) {
    const payload = { campaignId: id };
    try {
      return await this.marketing.runCampaign(id);
    } catch (error) {
      const ctx = await this.marketing.getCampaignDebugContext(id);
      this.campaignDebug.recordFailure(error, {
        action: 'run',
        campaignId: id,
        payload,
        selectedTemplate: ctx.selectedTemplate ?? null,
        variablesCount: ctx.variablesCount ?? null,
        wabaId: ctx.wabaId ?? null,
      });
    }
  }
}
