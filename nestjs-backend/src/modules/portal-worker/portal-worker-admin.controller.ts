import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import { AdminGuard } from '../admin/guards/admin.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkerRecruitmentTargetType } from '@prisma/client';
import { PortalWorkerService } from './portal-worker.service';
import { UpdateWorkerCommissionSettingsDto } from './dto/update-worker-commission-settings.dto';
import { UpdateWorkerProfileAdminDto } from './dto/worker-crm.dto';
import {
  ApplyWorkerWorkGuideTemplateDto,
  SaveWorkerBulkTemplateDto,
  SendWorkerBulkMessageDto,
  SendWorkerInternalMessageDto,
  UpdateRecruitmentTargetDto,
  UpdateWorkerProfileReminderDto,
  UpdateWorkerWorkGuideDto,
} from './dto/worker-communication.dto';
import { PortalWorkerCrmService } from './portal-worker-crm.service';
import { PortalWorkerCommunicationService } from './portal-worker-communication.service';

@Controller('admin/portal-workers')
@UseGuards(JwtAuthGuard, AdminGuard)
export class PortalWorkerAdminController {
  constructor(
    private readonly portalWorker: PortalWorkerService,
    private readonly crm: PortalWorkerCrmService,
    private readonly communication: PortalWorkerCommunicationService,
  ) {}

  @Get()
  list() {
    return this.portalWorker.listWorkersForAdmin();
  }

  @Post(':userId/approve')
  approve(@Param('userId') userId: string) {
    return this.portalWorker.setWorkerStatus(userId, 'approve');
  }

  @Post(':userId/reject')
  reject(@Param('userId') userId: string) {
    return this.portalWorker.setWorkerStatus(userId, 'reject');
  }

  @Post(':userId/suspend')
  suspend(@Param('userId') userId: string) {
    return this.portalWorker.setWorkerStatus(userId, 'suspend');
  }

  @Post(':userId/activate')
  activate(@Param('userId') userId: string) {
    return this.portalWorker.setWorkerStatus(userId, 'activate');
  }

  @Get('commissions')
  listCommissions(@Query('workerId') workerId?: string, @Query('status') status?: string) {
    return this.portalWorker.listCommissionsForAdmin({ workerId, status });
  }

  @Get('commissions/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  exportCommissions(
    @Res() res: Response,
    @Query('workerId') workerId?: string,
    @Query('status') status?: string,
  ) {
    return this.portalWorker.exportCommissionsCsv({ workerId, status }).then((csv) => {
      res.setHeader('Content-Disposition', 'attachment; filename="worker-commissions.csv"');
      res.send(csv);
    });
  }

  @Post('commissions/:id/mark-paid')
  markPaid(@Param('id') id: string) {
    return this.portalWorker.markCommissionPaid(id);
  }

  @Get('commission-settings')
  getSettings() {
    return this.portalWorker.getCommissionSettings();
  }

  @Patch('commission-settings')
  updateSettings(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: UpdateWorkerCommissionSettingsDto,
  ) {
    return this.portalWorker.updateCommissionSettings(dto);
  }

  @Get('commission-overview')
  commissionOverview() {
    return this.crm.listWorkersCommissionOverview();
  }

  @Get('commission-overview/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  exportCommissionOverview(@Res() res: Response) {
    return this.crm.exportWorkersCommissionCsv().then((csv) => {
      res.setHeader('Content-Disposition', 'attachment; filename="workers-commission-overview.csv"');
      res.send(csv);
    });
  }

  @Get('crm/clients/:id')
  getCrmClientDetail(@Param('id') id: string) {
    return this.crm.getClientDetailAdmin(id);
  }

  @Post('crm/clients/:id/send-registration-email')
  sendRegistrationEmailAdmin(@Param('id') id: string) {
    return this.crm.sendRegistrationEmailAdmin(id);
  }

  @Get('crm/clients')
  listCrmClients(
    @Query('workerId') workerId?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
  ) {
    return this.crm.listAllClientsAdmin({ workerId, status, q });
  }

  @Get('communications/bulk-messages/templates')
  listBulkTemplates() {
    return this.communication.listBulkTemplates();
  }

  @Get('communications/bulk-messages/history')
  listBulkHistory() {
    return this.communication.listBulkHistory();
  }

  @Post('communications/bulk-messages/templates')
  saveBulkTemplate(
    @CurrentUser() admin: AuthUser,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: SaveWorkerBulkTemplateDto,
  ) {
    return this.communication.saveBulkTemplate(admin.id, dto);
  }

  @Post('communications/bulk-messages/send')
  sendBulkMessage(
    @CurrentUser() admin: AuthUser,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: SendWorkerBulkMessageDto,
  ) {
    return this.communication.sendBulkMessage(admin.id, dto);
  }

  @Get('communications/recruitment-targets')
  listRecruitmentTargets() {
    return this.communication.listRecruitmentTargetsAdmin();
  }

  @Patch('communications/recruitment-targets/:targetType')
  updateRecruitmentTarget(
    @Param('targetType') targetType: WorkerRecruitmentTargetType,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: UpdateRecruitmentTargetDto,
  ) {
    return this.communication.updateRecruitmentTargetAdmin(targetType, dto);
  }

  @Get('communications/cooperation-cancels/pending')
  listPendingCooperationCancels() {
    return this.communication.listPendingCooperationCancels();
  }

  @Get(':userId/messages')
  listMessages(@Param('userId') userId: string) {
    return this.communication.listMessagesAdmin(userId);
  }

  @Post(':userId/messages')
  sendMessage(
    @CurrentUser() admin: AuthUser,
    @Param('userId') userId: string,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: SendWorkerInternalMessageDto,
  ) {
    return this.communication.sendMessageAdmin(admin.id, userId, dto);
  }

  @Post(':userId/messages/mark-read')
  markMessagesRead(@Param('userId') userId: string) {
    return this.communication.markMessagesReadAdmin(userId);
  }

  @Get(':userId/profile-reminder')
  getProfileReminder(@Param('userId') userId: string) {
    return this.communication.getProfileReminderAdmin(userId);
  }

  @Patch(':userId/profile-reminder')
  updateProfileReminder(
    @Param('userId') userId: string,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: UpdateWorkerProfileReminderDto,
  ) {
    return this.communication.updateProfileReminderAdmin(userId, dto);
  }

  @Get(':userId/cooperation-cancel')
  getCooperationCancel(@Param('userId') userId: string) {
    return this.communication.getCooperationCancelAdmin(userId);
  }

  @Post(':userId/cooperation-cancel/confirm')
  confirmCooperationCancel(@CurrentUser() admin: AuthUser, @Param('userId') userId: string) {
    return this.communication.confirmCooperationCancelAdmin(admin.id, userId);
  }

  @Post(':userId/cooperation-cancel/restore')
  restoreCooperation(@CurrentUser() admin: AuthUser, @Param('userId') userId: string) {
    return this.communication.restoreCooperationAdmin(admin.id, userId);
  }

  @Get(':userId/work-guide')
  getWorkGuide(@Param('userId') userId: string) {
    return this.communication.getWorkGuideAdmin(userId);
  }

  @Patch(':userId/work-guide')
  updateWorkGuide(
    @Param('userId') userId: string,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: UpdateWorkerWorkGuideDto,
  ) {
    return this.communication.updateWorkGuideAdmin(userId, dto);
  }

  @Post(':userId/work-guide/apply-template')
  applyWorkGuideTemplate(
    @Param('userId') userId: string,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: ApplyWorkerWorkGuideTemplateDto,
  ) {
    return this.communication.applyWorkGuideTemplateAdmin(userId, dto);
  }

  @Get(':userId/detail')
  getWorkerDetail(@Param('userId') userId: string) {
    return this.crm.getWorkerDetailAdmin(userId);
  }

  @Get(':userId/profile')
  getWorkerProfile(@Param('userId') userId: string) {
    return this.crm.getWorkerDetailAdmin(userId);
  }

  @Patch(':userId/profile')
  updateWorkerProfile(
    @Param('userId') userId: string,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: UpdateWorkerProfileAdminDto,
  ) {
    return this.crm.updateWorkerProfileAdmin(userId, dto);
  }
}
