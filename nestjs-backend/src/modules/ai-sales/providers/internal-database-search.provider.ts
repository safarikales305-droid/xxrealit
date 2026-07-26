import { Injectable } from '@nestjs/common';
import { AiSalesPartnerType, UserRole } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../database/prisma.service';
import type { PartnerSearchInput, PartnerSearchProvider, PartnerSearchResultItem } from '../partner-search.types';

@Injectable()
export class InternalDatabaseSearchProvider implements PartnerSearchProvider {
  constructor(private readonly prisma: PrismaService) {}

  getName() {
    return 'Interní databáze XXREALIT';
  }

  getSourceKey() {
    return 'INTERNAL_DATABASE' as const;
  }

  isConfigured() {
    return true;
  }

  async search(input: PartnerSearchInput): Promise<PartnerSearchResultItem[]> {
    const results: PartnerSearchResultItem[] = [];
    const q = input.city ?? input.region ?? '';
    const keywords = (input.keywords ?? []).map((k: string) => k.toLowerCase());
    const limit = input.limit;

    const partnerType = input.partnerType;

    if (!partnerType || partnerType === AiSalesPartnerType.REAL_ESTATE_AGENT) {
      const agents = await this.prisma.agentProfile.findMany({
        where: {
          ...(q ? { city: { contains: q, mode: 'insensitive' } } : {}),
        },
        take: limit,
        include: { user: { select: { email: true, role: true } } },
      });
      for (const a of agents) {
        results.push({
          temporaryId: randomUUID(),
          partnerType: AiSalesPartnerType.REAL_ESTATE_AGENT,
          companyName: a.companyName || a.fullName,
          contactName: a.fullName,
          publicEmail: a.user.email ?? null,
          publicPhone: a.phone || null,
          website: a.website || null,
          city: a.city,
          region: input.region ?? null,
          specialization: this.matchKeywords(`${a.bio} ${a.companyName}`, keywords),
          source: 'INTERNAL_DATABASE',
          sourceUrl: `/profil/${a.userId}`,
          relevanceReason: 'Registrovaný makléř v databázi XXREALIT',
          verified: Boolean(a.user.email),
          duplicate: false,
          doNotContact: false,
          rawData: { userId: a.userId, role: a.user.role },
        });
      }
    }

    if (!partnerType || partnerType === AiSalesPartnerType.REAL_ESTATE_AGENCY) {
      const agencies = await this.prisma.agencyProfile.findMany({
        where: q ? { city: { contains: q, mode: 'insensitive' } } : {},
        take: limit,
        include: { user: { select: { email: true } } },
      });
      for (const a of agencies) {
        results.push({
          temporaryId: randomUUID(),
          partnerType: AiSalesPartnerType.REAL_ESTATE_AGENCY,
          companyName: a.agencyName,
          contactName: a.contactFullName,
          publicEmail: a.email || a.user.email || null,
          publicPhone: a.phone || null,
          website: a.website || null,
          city: a.city,
          region: input.region ?? null,
          specialization: this.matchKeywords(a.description, keywords),
          source: 'INTERNAL_DATABASE',
          sourceUrl: `/profil/${a.userId}`,
          relevanceReason: 'Registrovaná realitní kancelář v databázi XXREALIT',
          verified: Boolean(a.email || a.user.email),
          duplicate: false,
          doNotContact: false,
          rawData: { userId: a.userId },
        });
      }

      const companies = await this.prisma.companyProfile.findMany({
        where: q ? { city: { contains: q, mode: 'insensitive' } } : {},
        take: limit,
        include: { user: { select: { email: true, role: true } } },
      });
      for (const c of companies) {
        const type = this.mapCompanyRole(c.user.role);
        if (partnerType && type !== partnerType) continue;
        results.push({
          temporaryId: randomUUID(),
          partnerType: type,
          companyName: c.companyName,
          contactName: c.contactFullName,
          publicEmail: c.email || c.user.email || null,
          publicPhone: c.phone || null,
          website: c.website || null,
          city: c.city,
          region: input.region ?? null,
          specialization: this.matchKeywords(`${c.description} ${c.services}`, keywords),
          source: 'INTERNAL_DATABASE',
          sourceUrl: `/profil/${c.userId}`,
          relevanceReason: 'Registrovaná firma v databázi XXREALIT',
          verified: Boolean(c.email || c.user.email),
          duplicate: false,
          doNotContact: false,
          rawData: { userId: c.userId, role: c.user.role },
        });
      }
    }

    if (!partnerType || partnerType === AiSalesPartnerType.FINANCIAL_ADVISOR) {
      const advisors = await this.prisma.financialAdvisorProfile.findMany({
        where: q ? { city: { contains: q, mode: 'insensitive' } } : {},
        take: limit,
        include: { user: { select: { email: true } } },
      });
      for (const a of advisors) {
        results.push({
          temporaryId: randomUUID(),
          partnerType: AiSalesPartnerType.FINANCIAL_ADVISOR,
          companyName: a.brandName || a.fullName,
          contactName: a.fullName,
          publicEmail: a.email || a.user.email || null,
          publicPhone: a.phone || null,
          website: a.website || null,
          city: a.city,
          region: input.region ?? null,
          specialization: this.matchKeywords(a.bio, keywords),
          source: 'INTERNAL_DATABASE',
          sourceUrl: `/profil/${a.userId}`,
          relevanceReason: 'Finanční poradce v databázi XXREALIT',
          verified: Boolean(a.email || a.user.email),
          duplicate: false,
          doNotContact: false,
          rawData: { userId: a.userId },
        });
      }
    }

    if (!partnerType || partnerType === AiSalesPartnerType.INVESTOR) {
      const investors = await this.prisma.investorProfile.findMany({
        where: q ? { city: { contains: q, mode: 'insensitive' } } : {},
        take: limit,
        include: { user: { select: { email: true } } },
      });
      for (const inv of investors) {
        results.push({
          temporaryId: randomUUID(),
          partnerType: AiSalesPartnerType.INVESTOR,
          companyName: inv.investorName || inv.fullName,
          contactName: inv.fullName,
          publicEmail: inv.email || inv.user.email || null,
          publicPhone: inv.phone || null,
          website: inv.website || null,
          city: inv.city,
          region: input.region ?? null,
          specialization: this.matchKeywords(inv.bio, keywords),
          source: 'INTERNAL_DATABASE',
          sourceUrl: `/profil/${inv.userId}`,
          relevanceReason: 'Investor v databázi XXREALIT',
          verified: Boolean(inv.email || inv.user.email),
          duplicate: false,
          doNotContact: false,
          rawData: { userId: inv.userId },
        });
      }
    }

    const brokers = await this.prisma.importedBrokerContact.findMany({
      where: {
        status: 'ACTIVE',
        ...(q
          ? {
              OR: [
                { city: { contains: q, mode: 'insensitive' } },
                { address: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
        ...(keywords.length
          ? {
              OR: keywords.map((k: string) => ({
                OR: [
                  { companyName: { contains: k, mode: 'insensitive' as const } },
                  { notes: { contains: k, mode: 'insensitive' as const } },
                ],
              })),
            }
          : {}),
      },
      take: limit,
    });

    for (const b of brokers) {
      if (b.contactStatus === 'BLOCKED' || b.contactStatus === 'UNSUBSCRIBED') continue;
      results.push({
        temporaryId: randomUUID(),
        partnerType: AiSalesPartnerType.REAL_ESTATE_AGENT,
        companyName: b.companyName || b.fullName,
        contactName: b.fullName || null,
        publicEmail: b.email ?? null,
        publicPhone: b.phone ?? null,
        website: b.website ?? null,
        city: b.city ?? null,
        region: input.region ?? null,
        specialization: this.matchKeywords(b.notes ?? '', keywords),
        source: 'INTERNAL_DATABASE',
        sourceUrl: b.sourceUrl ?? null,
        relevanceReason: `Importovaný kontakt z katalogu (${b.sourcePortal ?? 'broker DB'})`,
        verified: Boolean(b.email),
        duplicate: false,
        doNotContact: b.contactStatus === 'UNSUBSCRIBED',
        rawData: { importedBrokerContactId: b.id, sourcePortal: b.sourcePortal },
      });
    }

    return results.slice(0, limit);
  }

  private mapCompanyRole(role: UserRole): AiSalesPartnerType {
    if (role === UserRole.COMPANY) return AiSalesPartnerType.CONSTRUCTION_COMPANY;
    return AiSalesPartnerType.OTHER;
  }

  private matchKeywords(hay: string, keywords: string[]): string[] {
    if (!keywords.length) return [];
    const lower = hay.toLowerCase();
    return keywords.filter((k) => lower.includes(k));
  }
}
