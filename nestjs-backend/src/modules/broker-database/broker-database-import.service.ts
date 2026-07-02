import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { WhatsAppMarketingCampaignType } from '@prisma/client';
import {
  ImportedBrokerContactService,
  type ListImportedBrokerContactsQuery,
} from '../imported-broker-contacts/imported-broker-contact.service';
import type {
  BrokerDatabaseWhatsAppAudience,
  RealitniEsoCrawlPreview,
  RealitniEsoImportResult,
} from '../imported-broker-contacts/directory-import.types';
import { RealitniEsoParserService } from './realitni-eso-parser.service';
import { EmailCampaignsService, type AudienceConfig } from '../email-campaigns/email-campaigns.service';
import { WhatsAppMarketingService } from '../whatsapp/whatsapp-marketing.service';

const DEFAULT_URL = 'https://www.realitnieso.cz/adresar-rk';
const DEFAULT_SOURCE = 'realitnieso.cz';

@Injectable()
export class BrokerDatabaseImportService {
  private readonly logger = new Logger(BrokerDatabaseImportService.name);

  constructor(
    private readonly parser: RealitniEsoParserService,
    private readonly contacts: ImportedBrokerContactService,
    private readonly emailCampaigns: EmailCampaignsService,
    private readonly whatsAppMarketing: WhatsAppMarketingService,
  ) {}

  private resolveInput(directoryUrl?: string, source?: string) {
    const url = this.parser.normalizeDirectoryUrl(directoryUrl?.trim() || DEFAULT_URL);
    const sourcePortal = (source?.trim() || DEFAULT_SOURCE).slice(0, 64);
    return { url, sourcePortal };
  }

  async importPreview(
    adminId: string,
    directoryUrl?: string,
    source?: string,
  ): Promise<RealitniEsoCrawlPreview> {
    const { url, sourcePortal } = this.resolveInput(directoryUrl, source);
    const robots = await this.parser.checkRobotsAllowed(url);
    if (!robots.allowed) {
      throw new BadRequestException(robots.reason ?? 'Import není povolen robots.txt.');
    }

    const { contacts, pagesScanned, errors } = await this.parser.crawlDirectory(url, {
      maxPages: 2,
      fetchDetails: true,
      previewLimit: 15,
      delayMs: 600,
    });

    this.logger.log(
      JSON.stringify({
        event: 'broker_directory_import_preview',
        adminId,
        source: sourcePortal,
        url,
        profilesFound: contacts.length,
        pagesScanned,
        at: new Date().toISOString(),
      }),
    );

    return {
      profilesFound: contacts.length,
      sample: contacts.slice(0, 15),
      pagesScanned,
      errors,
    };
  }

  async importRun(
    adminId: string,
    directoryUrl?: string,
    source?: string,
  ): Promise<RealitniEsoImportResult> {
    const { url, sourcePortal } = this.resolveInput(directoryUrl, source);
    const robots = await this.parser.checkRobotsAllowed(url);
    if (!robots.allowed) {
      throw new BadRequestException(robots.reason ?? 'Import není povolen robots.txt.');
    }

    const { contacts, pagesScanned, errors } = await this.parser.crawlDirectory(url, {
      maxPages: 30,
      fetchDetails: true,
      delayMs: 900,
    });

    let created = 0;
    let updated = 0;
    let duplicates = 0;
    let withoutEmail = 0;
    let withoutPhone = 0;
    const touchedIds = new Set<string>();

    for (const c of contacts) {
      if (!c.email) withoutEmail += 1;
      if (!c.phone && !c.normalizedPhone) withoutPhone += 1;
      try {
        const res = await this.contacts.upsertFromDirectoryImport(c, sourcePortal);
        if (touchedIds.has(res.id)) {
          duplicates += 1;
        } else {
          touchedIds.add(res.id);
        }
        if (res.action === 'created') created += 1;
        else updated += 1;
      } catch (e) {
        errors.push(
          `${c.companyName}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    this.logger.log(
      JSON.stringify({
        event: 'broker_directory_import_run',
        adminId,
        source: sourcePortal,
        url,
        profilesFound: contacts.length,
        created,
        updated,
        duplicates,
        withoutEmail,
        withoutPhone,
        errors: errors.length,
        pagesScanned,
        at: new Date().toISOString(),
      }),
    );

    return {
      profilesFound: contacts.length,
      created,
      updated,
      duplicates,
      withoutEmail,
      withoutPhone,
      errors,
      pagesScanned,
    };
  }

  async countWhatsAppRecipients(audience: BrokerDatabaseWhatsAppAudience) {
    const rows = await this.contacts.listWhatsAppEligible(this.mapWhatsAppAudience(audience));
    return { count: rows.length, phones: rows.map((r) => r.normalizedPhone).filter(Boolean) };
  }

  async runWhatsAppCampaign(
    adminId: string,
    body: {
      audience: BrokerDatabaseWhatsAppAudience;
      name?: string;
      waMetaTemplateId?: string;
      waTemplateName?: string;
      waTemplateLanguage?: string;
      waTemplateVariables?: string[];
      waHeaderImageMediaId?: string;
      waUrlButtonParameter?: string;
      confirmed?: boolean;
    },
  ) {
    const rows = await this.contacts.listWhatsAppEligible(this.mapWhatsAppAudience(body.audience));
    if (!body.confirmed) {
      return {
        ok: false,
        needsConfirmation: true,
        recipientCount: rows.length,
        message: `Opravdu chcete spustit WhatsApp kampaň pro ${rows.length} kontaktů?`,
      };
    }
    if (rows.length === 0) {
      throw new BadRequestException('Žádní příjemci s platným telefonem.');
    }
    if (!body.waMetaTemplateId?.trim()) {
      throw new BadRequestException('Vyberte WhatsApp šablonu.');
    }

    const phones = [...new Set(rows.map((r) => r.normalizedPhone!).filter(Boolean))];
    const campaign = await this.whatsAppMarketing.createCampaign(adminId, {
      name: body.name?.trim() || `Databáze makléřů ${new Date().toLocaleDateString('cs-CZ')}`,
      campaignType: WhatsAppMarketingCampaignType.CUSTOM,
      manualPhones: phones,
      waMetaTemplateId: body.waMetaTemplateId,
      waTemplateName: body.waTemplateName,
      waTemplateLanguage: body.waTemplateLanguage,
      waTemplateVariables: body.waTemplateVariables,
      waHeaderImageMediaId: body.waHeaderImageMediaId,
      waUrlButtonParameter: body.waUrlButtonParameter,
    });

    const run = await this.whatsAppMarketing.runCampaign(campaign.id, 'manual');
    await this.contacts.bulkUpdate(
      rows.map((r) => r.id),
      { contactStatus: 'WHATSAPP_SENT', outreachStatus: 'contacted' },
    );

    this.logger.log(
      JSON.stringify({
        event: 'broker_directory_whatsapp_campaign',
        adminId,
        recipientCount: rows.length,
        campaignId: campaign.id,
        at: new Date().toISOString(),
      }),
    );

    return {
      ok: true,
      recipientCount: rows.length,
      campaignId: campaign.id,
      run,
    };
  }

  async createEmailCampaign(
    adminId: string,
    body: {
      title: string;
      audience: AudienceConfig;
      senderName?: string;
      minDaysBetweenSends?: number;
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
    const campaign = await this.emailCampaigns.create(
      {
        title: body.title,
        senderName: body.senderName,
        minDaysBetweenSends: body.minDaysBetweenSends,
        audience: body.audience,
        templateKey: body.templateKey,
        steps: body.steps,
      },
      adminId,
    );
    return campaign;
  }

  private mapWhatsAppAudience(audience: BrokerDatabaseWhatsAppAudience) {
    return {
      mode: audience.mode,
      selectedContactIds: audience.selectedContactIds,
      ...(audience.filter as ListImportedBrokerContactsQuery),
    };
  }
}
