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
import { BulkImportedBrokerContactsDto } from './dto/bulk-imported-broker-contacts.dto';
import { ImportedBrokerContactService } from '../imported-broker-contacts/imported-broker-contact.service';
import { CreateImportSourceDto } from './dto/create-import-source.dto';
import { BulkImportShortsDraftsDto } from './dto/bulk-import-shorts-drafts.dto';
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
type ImportApifyDatasetBody = {
  datasetUrl?: string;
};

type UpdateListingPhotoWatermarkBody = {
  enabled?: boolean;
  position?: string;
  logoWidthRatio?: number;
  opacity?: number;
  marginPx?: number;
};

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly agentProfileService: AgentProfileService,
    private readonly importedBrokerContacts: ImportedBrokerContactService,
  ) {}

  @Get()
  getAdmin() {
    return { message: 'Admin panel OK' };
  }

  @Get('stats')
  stats() {
    return this.adminService.stats();
  }

  @Get('listing-photo-watermark')
  getListingPhotoWatermark() {
    return this.adminService.getListingPhotoWatermarkSettings();
  }

  @Patch('listing-photo-watermark')
  updateListingPhotoWatermark(
    @Body() body: UpdateListingPhotoWatermarkBody,
  ) {
    return this.adminService.updateListingPhotoWatermarkSettings({
      enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
      position: typeof body.position === 'string' ? body.position : undefined,
      logoWidthRatio:
        typeof body.logoWidthRatio === 'number' ? body.logoWidthRatio : undefined,
      opacity: typeof body.opacity === 'number' ? body.opacity : undefined,
      marginPx: typeof body.marginPx === 'number' ? body.marginPx : undefined,
    });
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
    @Query('propertyTypeKey') propertyTypeKey?: string,
    @Query('importCategoryKey') importCategoryKey?: string,
    @Query('sourcePortalKey') sourcePortalKey?: string,
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
      propertyTypeKey,
      importCategoryKey,
      sourcePortalKey,
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

  @Post('imports/apify-dataset')
  importApifyDataset(
    @CurrentUser() user: AuthUser,
    @Body() body: ImportApifyDatasetBody,
  ) {
    return this.adminService.importApifyDataset(
      user.id,
      typeof body.datasetUrl === 'string' ? body.datasetUrl : '',
    );
  }

  @Get('import-sources')
  listImportSources(
    @Query('portalKey') portalKey?: string,
    @Query('onlyEnabled') onlyEnabled?: string,
    @Query('onlyRunning') onlyRunning?: string,
    @Query('onlyError') onlyError?: string,
    @Query('search') search?: string,
  ) {
    if (
      portalKey !== undefined ||
      onlyEnabled !== undefined ||
      onlyRunning !== undefined ||
      onlyError !== undefined ||
      search !== undefined
    ) {
      return this.adminService.listImportSourcesOverview({
        portalKey: portalKey?.trim() || undefined,
        onlyEnabled: onlyEnabled === '1' || onlyEnabled === 'true',
        onlyRunning: onlyRunning === '1' || onlyRunning === 'true',
        onlyError: onlyError === '1' || onlyError === 'true',
        search: search?.trim() || undefined,
      });
    }
    return this.adminService.listImportSources();
  }

  @Post('import-sources')
  createImportSource(
    @Body(new ValidationPipe({ whitelist: true, transform: true })) dto: CreateImportSourceDto,
  ) {
    return this.adminService.createImportSource({
      portal: dto.portal,
      method: dto.method,
      name: dto.name?.trim() || '',
      portalKey: dto.portalKey?.trim() || '',
      portalLabel: dto.portalLabel?.trim() || '',
      categoryKey: dto.categoryKey?.trim() || '',
      categoryLabel: dto.categoryLabel?.trim() || '',
      endpointUrl: dto.endpointUrl?.trim() || null,
      actorId: dto.actorId?.trim() || null,
      actorTaskId: dto.actorTaskId?.trim() || null,
      datasetId: dto.datasetId?.trim() || null,
      startUrl: dto.startUrl?.trim() || null,
      sourcePortal: dto.sourcePortal?.trim() || null,
      notes: dto.notes?.trim() || null,
      isActive: dto.isActive,
      intervalMinutes: dto.intervalMinutes,
      limitPerRun: dto.limitPerRun,
      enabled: dto.enabled,
      sortOrder: dto.sortOrder,
      settingsJson:
        dto.settingsJson === undefined ? undefined : (dto.settingsJson as Prisma.InputJsonValue | null),
      credentialsJson:
        dto.credentialsJson === undefined
          ? undefined
          : (dto.credentialsJson as Prisma.InputJsonValue | null),
    });
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

  @Post('imports/apify/:sourceId/run')
  runApifyImportSource(@CurrentUser() user: AuthUser, @Param('sourceId') sourceId: string) {
    return this.adminService.runApifyImportSource(sourceId, user.id);
  }

  @Patch('imports/:sourceId/toggle')
  toggleImportSource(
    @Param('sourceId') sourceId: string,
    @Body() body: { enabled?: boolean },
  ) {
    return this.adminService.toggleImportSource(sourceId, body.enabled === true);
  }

  @Get('imports/:sourceId/status')
  getImportSourceStatus(@Param('sourceId') sourceId: string) {
    return this.adminService.getImportSourceStatus(sourceId);
  }

  @Post('import-portals/:portalKey/run')
  runImportPortal(@CurrentUser() user: AuthUser, @Param('portalKey') portalKey: string) {
    return this.adminService.runImportPortal(portalKey, user.id);
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
  listImportLogs(
    @Query('sourceId') sourceId?: string,
    @Query('portalKey') portalKey?: string,
    @Query('categoryKey') categoryKey?: string,
  ) {
    return this.adminService.listImportLogs({
      sourceId: typeof sourceId === 'string' ? sourceId : undefined,
      portalKey: typeof portalKey === 'string' ? portalKey : undefined,
      categoryKey: typeof categoryKey === 'string' ? categoryKey : undefined,
    });
  }

  @Delete('import-sources/:id')
  deleteImportSource(@Param('id') id: string) {
    return this.adminService.deleteImportSource(id);
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

  @Post('imported-listings/bulk-shorts-drafts')
  bulkShortsDraftsFromImported(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: BulkImportShortsDraftsDto,
  ) {
    return this.adminService.bulkShortsDraftsFromImported({
      sourcePortalKey: dto.sourcePortalKey,
      importCategoryKey: dto.importCategoryKey,
      city: dto.city,
      onlyNewImports: dto.onlyNewImports,
      limit: dto.limit,
      propertyIds: dto.propertyIds,
    });
  }

  @Post('import-reality/repair-price-placeholders')
  repairRealityImportedPrices() {
    return this.adminService.repairRealityImportedPricePlaceholders();
  }

  @Get('broker-contacts')
  listBrokerContacts(
    @Query('search') search?: string,
    @Query('portal') portal?: string,
    @Query('hasEmail') hasEmail?: string,
    @Query('hasPhone') hasPhone?: string,
    @Query('profileCreated') profileCreated?: string,
    @Query('outreachStatus') outreachStatus?: string,
    @Query('sort') sort?: string,
    @Query('skip') skipRaw?: string,
    @Query('take') takeRaw?: string,
  ) {
    const parseBool = (v?: string): boolean | undefined => {
      if (v === '1' || v === 'true') return true;
      if (v === '0' || v === 'false') return false;
      return undefined;
    };
    const skip = Number(skipRaw);
    const take = Number(takeRaw);
    return this.importedBrokerContacts.list({
      search: typeof search === 'string' ? search : undefined,
      portal: typeof portal === 'string' ? portal : undefined,
      hasEmail: parseBool(hasEmail),
      hasPhone: parseBool(hasPhone),
      profileCreated: parseBool(profileCreated),
      outreachStatus: typeof outreachStatus === 'string' ? outreachStatus : undefined,
      sort:
        sort === 'lastSeen_asc' ||
        sort === 'listings_desc' ||
        sort === 'listings_asc' ||
        sort === 'lastSeen_desc'
          ? sort
          : 'lastSeen_desc',
      skip: Number.isFinite(skip) ? skip : 0,
      take: Number.isFinite(take) ? take : 40,
    });
  }

  @Post('broker-contacts/bulk-update')
  bulkBrokerContacts(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: BulkImportedBrokerContactsDto,
  ) {
    return this.importedBrokerContacts.bulkUpdate(dto.ids, {
      outreachStatus: dto.outreachStatus,
      status: dto.status,
      profileCreated: dto.profileCreated,
    });
  }

  @Get('broker-contacts/export')
  async exportBrokerContactsCsv(
    @Res() res: Response,
    @Query('search') search?: string,
    @Query('portal') portal?: string,
    @Query('hasEmail') hasEmail?: string,
    @Query('hasPhone') hasPhone?: string,
    @Query('profileCreated') profileCreated?: string,
    @Query('outreachStatus') outreachStatus?: string,
  ) {
    const parseBool = (v?: string): boolean | undefined => {
      if (v === '1' || v === 'true') return true;
      if (v === '0' || v === 'false') return false;
      return undefined;
    };
    const rows = await this.importedBrokerContacts.listForExport({
      search: typeof search === 'string' ? search : undefined,
      portal: typeof portal === 'string' ? portal : undefined,
      hasEmail: parseBool(hasEmail),
      hasPhone: parseBool(hasPhone),
      profileCreated: parseBool(profileCreated),
      outreachStatus: typeof outreachStatus === 'string' ? outreachStatus : undefined,
      sort: 'lastSeen_desc',
    });
    const svc = this.importedBrokerContacts;
    const lines = [svc.csvHeader(), ...rows.map((r) => svc.toCsvRow(r))];
    const body = `\uFEFF${lines.join('\n')}\n`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="imported-broker-contacts.csv"',
    );
    res.send(body);
  }

  @Get('broker-contacts/:id')
  getBrokerContact(@Param('id') id: string) {
    return this.importedBrokerContacts.getOne(id);
  }

  @Patch('broker-contacts/:id')
  patchBrokerContact(
    @Param('id') id: string,
    @Body()
    body: {
      notes?: string | null;
      outreachStatus?: string | null;
      outreachNote?: string | null;
      status?: string | null;
      profileCreated?: boolean;
      invitedAt?: string | null;
      fullName?: string | null;
      companyName?: string | null;
      website?: string | null;
    },
  ) {
    return this.importedBrokerContacts.patch(id, body);
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
