import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/guards/admin.guard';
import {
  ImportedBrokerContactService,
  type ListImportedBrokerContactsQuery,
} from '../imported-broker-contacts/imported-broker-contact.service';
import { BrokerDatabaseImportService } from './broker-database-import.service';
import {
  BrokerDatabaseEmailCampaignDto,
  BrokerDatabaseWhatsAppCampaignDto,
  BrokerDirectoryImportDto,
} from './dto/broker-database.dto';
import type { AudienceConfig } from '../email-campaigns/email-campaigns.service';

@Controller('admin/broker-database')
@UseGuards(JwtAuthGuard, AdminGuard)
export class BrokerDatabaseController {
  constructor(
    private readonly contacts: ImportedBrokerContactService,
    private readonly brokerDb: BrokerDatabaseImportService,
  ) {}

  @Post('import-preview')
  importPreview(
    @CurrentUser() user: AuthUser,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: BrokerDirectoryImportDto,
  ) {
    return this.brokerDb.importPreview(user.id, dto.directoryUrl, dto.source);
  }

  @Post('import-run')
  importRun(
    @CurrentUser() user: AuthUser,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: BrokerDirectoryImportDto,
  ) {
    return this.brokerDb.importRun(user.id, dto.directoryUrl, dto.source);
  }

  @Get()
  list(
    @Query('search') search?: string,
    @Query('portal') portal?: string,
    @Query('hasEmail') hasEmail?: string,
    @Query('hasPhone') hasPhone?: string,
    @Query('profileCreated') profileCreated?: string,
    @Query('outreachStatus') outreachStatus?: string,
    @Query('contactStatus') contactStatus?: string,
    @Query('sort') sort?: string,
    @Query('skip') skipRaw?: string,
    @Query('take') takeRaw?: string,
  ) {
    return this.contacts.list(this.parseListQuery({
      search,
      portal,
      hasEmail,
      hasPhone,
      profileCreated,
      outreachStatus,
      contactStatus,
      sort,
      skipRaw,
      takeRaw,
    }));
  }

  @Patch(':id')
  patch(
    @Param('id') id: string,
    @Body()
    body: {
      notes?: string | null;
      outreachStatus?: string | null;
      outreachNote?: string | null;
      status?: string | null;
      contactStatus?: string | null;
      profileCreated?: boolean;
      invitedAt?: string | null;
      fullName?: string | null;
      companyName?: string | null;
      website?: string | null;
    },
  ) {
    return this.contacts.patch(id, body);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.contacts.delete(id);
  }

  @Post('export-csv')
  async exportCsv(
    @Res() res: Response,
    @Body()
    body: {
      search?: string;
      portal?: string;
      hasEmail?: boolean;
      hasPhone?: boolean;
      profileCreated?: boolean;
      outreachStatus?: string;
      contactStatus?: string;
    },
  ) {
    const rows = await this.contacts.listForExport({
      search: body.search,
      portal: body.portal,
      hasEmail: body.hasEmail,
      hasPhone: body.hasPhone,
      profileCreated: body.profileCreated,
      outreachStatus: body.outreachStatus,
      contactStatus: body.contactStatus,
      sort: 'lastSeen_desc',
    });
    const svc = this.contacts;
    const lines = [svc.csvHeader(), ...rows.map((r) => svc.toCsvRow(r))];
    const out = `\uFEFF${lines.join('\n')}\n`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="broker-database.csv"');
    res.send(out);
  }

  @Post('email-campaign')
  createEmailCampaign(@CurrentUser() user: AuthUser, @Body() body: BrokerDatabaseEmailCampaignDto) {
    if (!body.title?.trim()) {
      return { success: false, error: 'title je povinný.' };
    }
    return this.brokerDb.createEmailCampaign(user.id, {
      title: body.title,
      audience: body.audience as AudienceConfig,
      senderName: body.senderName,
      minDaysBetweenSends: body.minDaysBetweenSends,
      templateKey: body.templateKey,
      steps: body.steps as Parameters<BrokerDatabaseImportService['createEmailCampaign']>[1]['steps'],
    });
  }

  @Post('whatsapp-campaign')
  whatsappCampaign(
    @CurrentUser() user: AuthUser,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: BrokerDatabaseWhatsAppCampaignDto,
  ) {
    return this.brokerDb.runWhatsAppCampaign(user.id, dto);
  }

  @Post('whatsapp-campaign/count')
  whatsappCampaignCount(@Body() body: { audience?: BrokerDatabaseWhatsAppCampaignDto['audience'] }) {
    if (!body.audience) return { count: 0 };
    return this.brokerDb.countWhatsAppRecipients(body.audience);
  }

  private parseListQuery(q: {
    search?: string;
    portal?: string;
    hasEmail?: string;
    hasPhone?: string;
    profileCreated?: string;
    outreachStatus?: string;
    contactStatus?: string;
    sort?: string;
    skipRaw?: string;
    takeRaw?: string;
  }): ListImportedBrokerContactsQuery {
    const parseBool = (v?: string): boolean | undefined => {
      if (v === '1' || v === 'true') return true;
      if (v === '0' || v === 'false') return false;
      return undefined;
    };
    const skip = Number(q.skipRaw);
    const take = Number(q.takeRaw);
    return {
      search: typeof q.search === 'string' ? q.search : undefined,
      portal: typeof q.portal === 'string' ? q.portal : undefined,
      hasEmail: parseBool(q.hasEmail),
      hasPhone: parseBool(q.hasPhone),
      profileCreated: parseBool(q.profileCreated),
      outreachStatus: typeof q.outreachStatus === 'string' ? q.outreachStatus : undefined,
      contactStatus: typeof q.contactStatus === 'string' ? q.contactStatus : undefined,
      sort:
        q.sort === 'lastSeen_asc' ||
        q.sort === 'listings_desc' ||
        q.sort === 'listings_asc' ||
        q.sort === 'lastSeen_desc'
          ? q.sort
          : 'lastSeen_desc',
      skip: Number.isFinite(skip) ? skip : 0,
      take: Number.isFinite(take) ? take : 40,
    };
  }
}
