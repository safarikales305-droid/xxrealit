import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Param,
  Query,
  Res,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminService } from './admin.service';
import { AdminUpdatePropertyDto } from './dto/admin-update-property.dto';
import { PatchBrokerReviewVisibilityDto } from './dto/patch-broker-review-visibility.dto';
import { PatchPremiumBrokerDto } from './dto/patch-premium-broker.dto';
import { PatchUserCreditDto } from './dto/patch-user-credit.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UpdateImportSourceDto } from './dto/update-import-source.dto';
import { BulkDisableImportedDto } from './dto/bulk-disable-imported.dto';
import { AdminGuard } from './guards/admin.guard';
import { AgentProfileService } from '../agent-profile/agent-profile.service';

type ChangePasswordBody = {
  oldPassword?: string;
  newPassword?: string;
};

type ImportPropertiesBody = {
  apiKey?: string;
};

type ImportXmlBody = {
  url?: string;
};

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly agentProfileService: AgentProfileService,
  ) {}

  @Get()
  getAdmin() {
    return { message: 'Admin panel OK' };
  }

  @Get('stats')
  stats() {
    return this.adminService.stats();
  }

  @Get('properties')
  listProperties() {
    return this.adminService.listAllProperties();
  }

  @Get('properties/pending')
  listPendingProperties() {
    return this.adminService.listPendingProperties();
  }

  @Get('listings')
  listListings(
    @Query('search') search?: string,
    @Query('listingType') listingType?: string,
    @Query('status') status?: string,
    @Query('userId') userId?: string,
    @Query('city') city?: string,
    @Query('source') source?: string,
    @Query('importMethod') importMethod?: string,
    @Query('createdFrom') createdFrom?: string,
    @Query('createdTo') createdTo?: string,
  ) {
    return this.adminService.listListings({
      search,
      listingType,
      status,
      userId,
      city,
      source,
      importMethod,
      createdFrom,
      createdTo,
    });
  }

  @Patch('properties/:id/approve')
  approve(@Param('id') id: string) {
    return this.adminService.approveProperty(id);
  }

  @Patch('properties/:id')
  updateProperty(
    @Param('id') id: string,
    @Body() dto: AdminUpdatePropertyDto,
  ) {
    return this.adminService.updateProperty(id, dto);
  }

  @Delete('properties/:id')
  deleteProperty(@Param('id') id: string) {
    return this.adminService.deleteProperty(id);
  }

  @Get('users')
  listUsers() {
    return this.adminService.listUsers();
  }

  @Get('agent-profiles')
  listAgentProfiles(@Query('status') status?: string) {
    return this.agentProfileService.adminList(status);
  }

  @Get('agent-profiles/:id')
  getAgentProfile(@Param('id') id: string) {
    return this.agentProfileService.adminGetById(id);
  }

  @Post('agent-profiles/:id/approve')
  approveAgentProfile(@Param('id') id: string) {
    return this.agentProfileService.adminApprove(id);
  }

  @Post('agent-profiles/:id/reject')
  rejectAgentProfile(@Param('id') id: string) {
    return this.agentProfileService.adminReject(id);
  }

  @Get('professional-profiles/:type')
  listProfessionalProfiles(
    @Param('type')
    type: 'agent' | 'company' | 'agency' | 'financial_advisor' | 'investor',
    @Query('status') status?: string,
  ) {
    return this.agentProfileService.adminListProfessional(type, status);
  }

  @Post('professional-profiles/:type/:id/approve')
  approveProfessionalProfile(
    @Param('type')
    type: 'agent' | 'company' | 'agency' | 'financial_advisor' | 'investor',
    @Param('id') id: string,
  ) {
    return this.agentProfileService.adminApproveProfessional(type, id);
  }

  @Post('professional-profiles/:type/:id/reject')
  rejectProfessionalProfile(
    @Param('type')
    type: 'agent' | 'company' | 'agency' | 'financial_advisor' | 'investor',
    @Param('id') id: string,
  ) {
    return this.agentProfileService.adminRejectProfessional(type, id);
  }

  @Patch('users/:id/role')
  updateUserRole(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserRoleDto,
  ) {
    return this.adminService.updateUserRole(user.id, id, dto.role);
  }

  @Patch('users/:id/premium-broker')
  updatePremiumBroker(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true, transform: true })) dto: PatchPremiumBrokerDto,
  ) {
    return this.adminService.updateUserPremiumBroker(user.id, id, dto.isPremiumBroker);
  }

  @Patch('users/:id/credit')
  updateUserCredit(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true, transform: true })) dto: PatchUserCreditDto,
  ) {
    return this.adminService.updateUserCreditBalance(user.id, id, dto.creditBalance);
  }

  @Patch('broker-reviews/:id/visibility')
  setBrokerReviewVisibility(
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: PatchBrokerReviewVisibilityDto,
  ) {
    return this.adminService.setBrokerReviewVisibility(id, dto.isVisible);
  }

  @Delete('users/:id')
  deleteUser(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.adminService.deleteUser(user.id, id);
  }

  @Post('import-properties')
  importProperties(
    @CurrentUser() user: AuthUser,
    @Body() body: ImportPropertiesBody,
  ) {
    return this.adminService.importPropertiesFromRapidApi(
      user.id,
      typeof body.apiKey === 'string' ? body.apiKey : '',
    );
  }

  @Post('import-xml')
  importXml(
    @CurrentUser() user: AuthUser,
    @Body() body: ImportXmlBody,
  ) {
    return this.adminService.importPropertiesFromXml(
      user.id,
      typeof body.url === 'string' ? body.url : '',
    );
  }

  @Get('import-sources')
  listImportSources() {
    return this.adminService.listImportSources();
  }

  @Patch('import-sources/:id')
  updateImportSource(
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true, transform: true })) dto: UpdateImportSourceDto,
  ) {
    return this.adminService.updateImportSource(id, {
      ...dto,
      credentialsJson:
        dto.credentialsJson === undefined
          ? undefined
          : (dto.credentialsJson as Prisma.InputJsonValue | null),
      settingsJson:
        dto.settingsJson === undefined
          ? undefined
          : (dto.settingsJson as Prisma.InputJsonValue | null),
    });
  }

  @Post('import-sources/:id/run')
  runImportSource(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.adminService.runImportSource(id, user.id);
  }

  /** Stejný import jako `/run`, ale vrací NDJSON řádky s průběhem (`type: progress` → `result` / `error`). */
  @Post('import-sources/:id/run-stream')
  async runImportSourceStream(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');
    await this.adminService.runImportSourceStream(id, user.id, (chunk) => {
      res.write(chunk);
    });
    res.end();
  }

  @Get('import-logs')
  listImportLogs(@Query('sourceId') sourceId?: string) {
    return this.adminService.listImportLogs(typeof sourceId === 'string' ? sourceId : undefined);
  }

  @Post('import-disable/bulk')
  bulkDisableImported(
    @Body(new ValidationPipe({ whitelist: true, transform: true })) dto: BulkDisableImportedDto,
  ) {
    return this.adminService.bulkDisableImportedListings({
      source: dto.source,
      method: dto.method,
    });
  }

  @Post('import-reality/repair-price-placeholders')
  repairRealityImportedPrices() {
    return this.adminService.repairRealityImportedPricePlaceholders();
  }

  @Patch('password')
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body() body: ChangePasswordBody,
  ) {
    const oldPassword =
      typeof body.oldPassword === 'string' ? body.oldPassword : '';
    const newPassword =
      typeof body.newPassword === 'string' ? body.newPassword : '';
    return this.adminService.changePassword(user.id, oldPassword, newPassword);
  }
}
