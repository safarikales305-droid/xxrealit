import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateClientPreregistrationDto } from './dto/create-client-preregistration.dto';
import {
  AddWorkerClientNoteDto,
  CreateWorkerClientDto,
  GrantWorkerBonusDto,
  UpdateWorkerClientDto,
  UpdateWorkerSelfSettingsDto,
  WorkerCrmMessageDto,
} from './dto/worker-crm.dto';
import {
  ReplyWorkerInternalMessageDto,
  WorkerCooperationCancelDto,
} from './dto/worker-communication.dto';
import { PortalWorkerCrmService } from './portal-worker-crm.service';
import { PortalWorkerCommunicationService } from './portal-worker-communication.service';
import { PortalWorkerService } from './portal-worker.service';

@Controller('portal-worker')
@UseGuards(JwtAuthGuard)
export class PortalWorkerController {
  constructor(
    private readonly portalWorker: PortalWorkerService,
    private readonly crm: PortalWorkerCrmService,
    private readonly communication: PortalWorkerCommunicationService,
  ) {}

  @Get('me/dashboard')
  dashboard(@CurrentUser() user: AuthUser) {
    return this.crm.getCrmOverview(user.id);
  }

  @Get('me/profile')
  profile(@CurrentUser() user: AuthUser) {
    return this.crm.getWorkerProfile(user.id);
  }

  @Get('clients')
  listClients(
    @CurrentUser() user: AuthUser,
    @Query('q') q?: string,
    @Query('status') status?: string,
  ) {
    return this.crm.listWorkerClients(user.id, { q, status });
  }

  @Get('clients/:id')
  clientDetail(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('kind') kind?: string,
  ) {
    return this.crm.getClientDetail(user.id, id, kind);
  }

  @Patch('clients/:id')
  updateClient(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('kind') kind: string | undefined,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: UpdateWorkerClientDto,
  ) {
    return this.crm.updateWorkerClient(user.id, id, dto, kind);
  }

  @Post('clients')
  createClient(
    @CurrentUser() user: AuthUser,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: CreateWorkerClientDto,
  ) {
    return this.crm.createWorkerClient(user.id, dto);
  }

  @Get('me/settings')
  selfSettings(@CurrentUser() user: AuthUser) {
    return this.crm.getWorkerSelfSettings(user.id);
  }

  @Patch('me/settings')
  updateSelfSettings(
    @CurrentUser() user: AuthUser,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: UpdateWorkerSelfSettingsDto,
  ) {
    return this.crm.updateWorkerSelfSettings(user.id, dto);
  }

  @Post('client-preregistrations')
  createPreregistration(
    @CurrentUser() user: AuthUser,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: CreateClientPreregistrationDto,
  ) {
    return this.portalWorker.createClientPreregistration(user.id, dto);
  }

  @Post('clients/notes')
  addNote(
    @CurrentUser() user: AuthUser,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: AddWorkerClientNoteDto,
  ) {
    return this.crm.addNote(user.id, dto);
  }

  @Post('clients/bonus')
  grantBonus(
    @CurrentUser() user: AuthUser,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: GrantWorkerBonusDto,
  ) {
    return this.crm.grantBonus(user.id, dto);
  }

  @Post('clients/:id/send-email')
  sendEmail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.crm.sendRegistrationEmail(user.id, id);
  }

  @Post('clients/:id/send-whatsapp')
  sendWhatsapp(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: Omit<WorkerCrmMessageDto, 'preregistrationId'>,
  ) {
    return this.crm.sendWhatsAppAction(user.id, { ...dto, preregistrationId: id });
  }

  @Get('me/messages')
  listMessages(@CurrentUser() user: AuthUser) {
    return this.communication.listMessagesWorker(user.id);
  }

  @Post('me/messages/reply')
  replyMessage(
    @CurrentUser() user: AuthUser,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: ReplyWorkerInternalMessageDto,
  ) {
    return this.communication.replyMessageWorker(user.id, dto);
  }

  @Post('me/messages/mark-read')
  markMessagesRead(@CurrentUser() user: AuthUser) {
    return this.communication.markMessagesReadWorker(user.id);
  }

  @Get('me/profile-completion')
  profileCompletion(@CurrentUser() user: AuthUser) {
    return this.communication.getProfileCompletionWorker(user.id);
  }

  @Get('me/work-guide')
  workGuide(@CurrentUser() user: AuthUser) {
    return this.communication.getWorkGuideWorker(user.id);
  }

  @Get('me/recruitment-targets')
  recruitmentTargets(@CurrentUser() user: AuthUser) {
    return this.communication.listRecruitmentTargetsWorker();
  }

  @Get('me/cooperation-cancel')
  cooperationCancel(@CurrentUser() user: AuthUser) {
    return this.communication.getCooperationCancelWorker(user.id);
  }

  @Post('me/cooperation-cancel')
  requestCooperationCancel(
    @CurrentUser() user: AuthUser,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: WorkerCooperationCancelDto,
  ) {
    return this.communication.requestCooperationCancelWorker(user.id, dto);
  }
}
