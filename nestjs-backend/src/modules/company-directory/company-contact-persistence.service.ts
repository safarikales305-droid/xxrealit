import { Injectable, Logger } from '@nestjs/common';
import { CompanyWebsiteSource, type Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CompanyEventsService } from './company-events.service';

export type PersistDiscoveredContactInput = {
  companyId: string;
  website?: string | null;
  websiteConfidence?: number | null;
  email?: string | null;
  emailSourceUrl?: string | null;
  emailConfidence?: number | null;
  phone?: string | null;
  phoneSourceUrl?: string | null;
};

@Injectable()
export class CompanyContactPersistenceService {
  private readonly log = new Logger(CompanyContactPersistenceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: CompanyEventsService,
  ) {}

  private websitePriority(source: CompanyWebsiteSource | null | undefined): number {
    switch (source) {
      case 'MANUAL_ADMIN':
        return 100;
      case 'VERIFIED':
        return 90;
      case 'DISCOVERED_HIGH':
        return 80;
      case 'DISCOVERED_MEDIUM':
        return 70;
      case 'IMPORTED':
        return 50;
      case 'ARES':
        return 40;
      default:
        return 0;
    }
  }

  private resolveWebsiteSource(confidence: number | null | undefined): CompanyWebsiteSource {
    if ((confidence ?? 0) >= 0.85) return 'DISCOVERED_HIGH';
    return 'DISCOVERED_MEDIUM';
  }

  async persistDiscoveredContact(input: PersistDiscoveredContactInput) {
    const company = await this.prisma.companyDirectoryEntry.findUnique({
      where: { id: input.companyId },
    });
    if (!company) return null;

    const data: Prisma.CompanyDirectoryEntryUpdateInput = {};
    let websiteDiscovered = false;
    let contactDiscovered = false;

    if (input.website?.trim() && !company.websiteManualOverride) {
      const nextSource = this.resolveWebsiteSource(input.websiteConfidence);
      const currentPriority = this.websitePriority(company.websiteSource);
      const nextPriority = this.websitePriority(nextSource);
      if (!company.website || nextPriority > currentPriority) {
        data.website = input.website.trim();
        data.websiteSource = nextSource;
        data.websiteConfidence = input.websiteConfidence ?? null;
        websiteDiscovered = true;
      }
    }

    if (input.email?.trim() && !company.verifiedBusinessEmail) {
      data.discoveredEmail = input.email.trim().toLowerCase();
      data.emailSourceUrl = input.emailSourceUrl ?? null;
      data.emailConfidence = input.emailConfidence ?? null;
      data.emailDiscoveredAt = new Date();
      if (!company.email) {
        data.email = input.email.trim().toLowerCase();
      }
      contactDiscovered = true;
    }

    if (input.phone?.trim() && !company.phone) {
      data.phone = input.phone.trim();
    }

    if (Object.keys(data).length === 0) return company;

    const updated = await this.prisma.companyDirectoryEntry.update({
      where: { id: company.id },
      data,
    });

    if (websiteDiscovered) {
      await this.events.emitCompanyWebsiteDiscovered(updated.id, {
        website: updated.website,
        source: updated.websiteSource,
      });
    }
    if (contactDiscovered) {
      await this.events.emitCompanyContactDiscovered(updated.id, {
        email: updated.discoveredEmail,
        sourceUrl: updated.emailSourceUrl,
      });
    }

    return updated;
  }

  async setManualWebsite(companyId: string, website: string) {
    return this.prisma.companyDirectoryEntry.update({
      where: { id: companyId },
      data: {
        website: website.trim(),
        websiteSource: 'MANUAL_ADMIN',
        websiteManualOverride: true,
        websiteVerifiedAt: new Date(),
      },
    });
  }

  async confirmVerifiedEmail(companyId: string, email: string, sourceUrl?: string | null) {
    const company = await this.prisma.companyDirectoryEntry.findUnique({ where: { id: companyId } });
    if (!company) return null;
    if (company.verifiedBusinessEmail) return company;

    return this.prisma.companyDirectoryEntry.update({
      where: { id: companyId },
      data: {
        verifiedBusinessEmail: email.trim().toLowerCase(),
        email: email.trim().toLowerCase(),
        emailSourceUrl: sourceUrl ?? company.emailSourceUrl,
        emailDiscoveredAt: company.emailDiscoveredAt ?? new Date(),
      },
    });
  }
}
