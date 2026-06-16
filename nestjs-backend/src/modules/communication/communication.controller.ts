import {
  Body,
  Controller,
  Delete,
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
import { ActivityLogCategory, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/guards/admin.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { ActivityLogService } from './activity-log.service';
import { CommunicationEmailService } from './communication-email.service';
import { CommunicationWhatsAppService } from './communication-whatsapp.service';
import { CrmContactsService } from './crm-contacts.service';
import { MarketingCampaignsService } from './marketing-campaigns.service';
import { CreateCrmContactDto } from './dto/create-crm-contact.dto';
import { UpdateCrmContactDto } from './dto/update-crm-contact.dto';
import {
  CommunicationWhatsAppListingLeadsDto,
  CommunicationWhatsAppSendDto,
} from './dto/communication-whatsapp.dto';
import {
  CommunicationEmailBulkDto,
  CommunicationEmailSendDto,
} from './dto/communication-email.dto';
import { CreateMarketingCampaignDto } from './dto/create-marketing-campaign.dto';

@Controller('communication')
export class CommunicationController {
  constructor(
    private readonly whatsapp: CommunicationWhatsAppService,
    private readonly email: CommunicationEmailService,
    private readonly crm: CrmContactsService,
    private readonly campaigns: MarketingCampaignsService,
    private readonly activityLog: ActivityLogService,
  ) {}

  private role(user: AuthUser): UserRole {
    return user.role as UserRole;
  }

  @Get('overview')
  @UseGuards(JwtAuthGuard)
  async overview(@CurrentUser() user: AuthUser) {
    const [whatsappCount, contactCount] = await Promise.all([
      this.whatsapp.countForUser(user.id),
      this.crm.countForUser(user.id),
    ]);
    return { whatsappCount, contactCount };
  }

  @Get('whatsapp/messages')
  @UseGuards(JwtAuthGuard)
  listWhatsApp(
    @CurrentUser() user: AuthUser,
    @Query('listingId') listingId?: string,
    @Query('contactPhone') contactPhone?: string,
    @Query('limit') limit?: string,
  ) {
    return this.whatsapp.listMessages(user.id, this.role(user), {
      listingId,
      contactPhone,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('whatsapp/send')
  @UseGuards(JwtAuthGuard)
  sendWhatsApp(
    @CurrentUser() user: AuthUser,
    @Body(new ValidationPipe({ whitelist: true, transform: true })) dto: CommunicationWhatsAppSendDto,
  ) {
    return this.whatsapp.sendMessage(user.id, this.role(user), dto);
  }

  @Post('whatsapp/send-listing-leads')
  @UseGuards(JwtAuthGuard)
  sendWhatsAppListingLeads(
    @CurrentUser() user: AuthUser,
    @Body(new ValidationPipe({ whitelist: true, transform: true })) dto: CommunicationWhatsAppListingLeadsDto,
  ) {
    return this.whatsapp.sendToListingLeads(user.id, this.role(user), dto);
  }

  @Get('emails/logs')
  @UseGuards(JwtAuthGuard)
  listEmailLogs(@CurrentUser() user: AuthUser, @Query('limit') limit?: string) {
    return this.email.listLogs(user.id, this.role(user), limit ? Number(limit) : undefined);
  }

  @Get('emails/templates')
  @UseGuards(JwtAuthGuard)
  listEmailTemplates(@CurrentUser() user: AuthUser) {
    return this.email.listTemplates(user.id, this.role(user));
  }

  @Post('emails/send')
  @UseGuards(JwtAuthGuard)
  sendEmail(
    @CurrentUser() user: AuthUser,
    @Body(new ValidationPipe({ whitelist: true, transform: true })) dto: CommunicationEmailSendDto,
  ) {
    return this.email.sendIndividual(user.id, this.role(user), dto);
  }

  @Post('emails/send-bulk')
  @UseGuards(JwtAuthGuard)
  sendBulkEmail(
    @CurrentUser() user: AuthUser,
    @Body(new ValidationPipe({ whitelist: true, transform: true })) dto: CommunicationEmailBulkDto,
  ) {
    return this.email.sendBulk(user.id, this.role(user), dto);
  }

  @Get('contacts')
  @UseGuards(JwtAuthGuard)
  listContacts(
    @CurrentUser() user: AuthUser,
    @Query('listingId') listingId?: string,
    @Query('search') search?: string,
    @Query('tag') tag?: string,
  ) {
    return this.crm.list(user.id, this.role(user), { listingId, search, tag });
  }

  @Post('contacts')
  @UseGuards(JwtAuthGuard)
  createContact(
    @CurrentUser() user: AuthUser,
    @Body(new ValidationPipe({ whitelist: true, transform: true })) dto: CreateCrmContactDto,
  ) {
    return this.crm.create(user.id, this.role(user), dto);
  }

  @Patch('contacts/:id')
  @UseGuards(JwtAuthGuard)
  updateContact(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true, transform: true })) dto: UpdateCrmContactDto,
  ) {
    return this.crm.update(user.id, this.role(user), id, dto);
  }

  @Delete('contacts/:id')
  @UseGuards(JwtAuthGuard)
  deleteContact(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.crm.remove(user.id, this.role(user), id);
  }

  @Post('contacts/sync-leads')
  @UseGuards(JwtAuthGuard)
  syncContactsFromLeads(@CurrentUser() user: AuthUser) {
    return this.crm.syncFromLeads(user.id, this.role(user));
  }

  @Get('contacts/export')
  @UseGuards(JwtAuthGuard)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportContacts(@CurrentUser() user: AuthUser, @Res() res: Response) {
    const data = await this.crm.exportCsv(user.id, this.role(user));
    res.setHeader('Content-Disposition', `attachment; filename="${data.filename}"`);
    return res.send(`\uFEFF${data.content}`);
  }

  @Get('campaigns')
  @UseGuards(JwtAuthGuard)
  listCampaigns(@CurrentUser() user: AuthUser) {
    return this.campaigns.list(user.id, this.role(user));
  }

  @Post('campaigns')
  @UseGuards(JwtAuthGuard)
  createCampaign(
    @CurrentUser() user: AuthUser,
    @Body(new ValidationPipe({ whitelist: true, transform: true })) dto: CreateMarketingCampaignDto,
  ) {
    return this.campaigns.create(user.id, this.role(user), dto);
  }

  @Post('campaigns/:id/send')
  @UseGuards(JwtAuthGuard)
  sendCampaign(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.campaigns.send(user.id, this.role(user), id);
  }

  @Get('admin/stats')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async adminStats() {
    const [whatsappMessages, emails, campaigns, contacts] = await Promise.all([
      this.whatsapp.countAll(),
      this.email.countAll(),
      this.campaigns.countAll(),
      this.crm.countAll(),
    ]);
    return { whatsappMessages, emails, campaigns, contacts };
  }

  @Get('admin/activity-logs')
  @UseGuards(JwtAuthGuard, AdminGuard)
  adminActivityLogs(
    @Query('category') category?: ActivityLogCategory,
    @Query('userId') userId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.activityLog.listAdmin({
      category,
      userId,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }
}
