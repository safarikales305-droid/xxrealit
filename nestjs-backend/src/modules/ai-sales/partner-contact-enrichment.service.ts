import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  AiSalesContactEnrichmentStatus,
  AiSalesContactType,
  AiSalesContactVerificationStatus,
  AiSalesSearchResultVerification,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CompanyWebsiteCrawlerService } from './company-website-crawler.service';
import { ContactVerificationService } from './contact-verification.service';
import {
  discoverContactPaths,
  extractEmailsFromHtml,
  extractPhonesFromHtml,
  SEED_PATHS,
} from './public-contact-extractor.util';
import { AiSalesSettingsService } from './ai-sales-settings.service';

export type EnrichmentResult = {
  success: boolean;
  searchResultId?: string;
  prospectId?: string;
  verificationStatus: AiSalesContactVerificationStatus;
  email: string | null;
  phone: string | null;
  visitedPages: Array<{ url: string; title: string; status: number }>;
  contacts: Array<{
    id: string;
    type: string;
    value: string;
    sourceUrl: string | null;
    sourceTextSnippet: string | null;
    confidence: number;
    isPrimary: boolean;
  }>;
  error?: string;
};

@Injectable()
export class PartnerContactEnrichmentService {
  private readonly log = new Logger(PartnerContactEnrichmentService.name);
  private dailyCount = 0;
  private dailyReset = new Date().toDateString();

  constructor(
    private readonly prisma: PrismaService,
    private readonly crawler: CompanyWebsiteCrawlerService,
    private readonly verification: ContactVerificationService,
    private readonly settings: AiSalesSettingsService,
  ) {}

  async enrichSearchResult(searchResultId: string, userId?: string): Promise<EnrichmentResult> {
    await this.assertDailyLimit();
    const result = await this.prisma.aiSalesSearchResult.findUnique({ where: { id: searchResultId } });
    if (!result) throw new NotFoundException('Výsledek vyhledávání nenalezen.');
    if (!result.website?.trim()) {
      return this.failResult(searchResultId, undefined, 'Chybí webová adresa firmy.');
    }

    await this.prisma.aiSalesSearchResult.update({
      where: { id: searchResultId },
      data: {
        contactEnrichmentStatus: AiSalesContactEnrichmentStatus.RUNNING,
        contactVerificationStatus: AiSalesContactVerificationStatus.ENRICHMENT_RUNNING,
      },
    });

    try {
      const enriched = await this.runEnrichment({
        website: result.website,
        companyName: result.companyName,
        searchResultId,
        userId,
      });
      await this.applyToSearchResult(searchResultId, enriched);
      return enriched;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.prisma.aiSalesSearchResult.update({
        where: { id: searchResultId },
        data: {
          contactEnrichmentStatus: AiSalesContactEnrichmentStatus.FAILED,
          contactVerificationStatus: AiSalesContactVerificationStatus.ENRICHMENT_FAILED,
          lastEnrichmentError: msg,
          lastEnrichmentAt: new Date(),
        },
      });
      throw err;
    }
  }

  async enrichProspect(prospectId: string, userId?: string): Promise<EnrichmentResult> {
    await this.assertDailyLimit();
    const prospect = await this.prisma.aiSalesProspect.findUnique({ where: { id: prospectId } });
    if (!prospect) throw new NotFoundException('Partner nenalezen.');
    if (!prospect.website?.trim()) {
      return this.failResult(undefined, prospectId, 'Chybí webová adresa firmy.');
    }

    await this.prisma.aiSalesProspect.update({
      where: { id: prospectId },
      data: {
        contactEnrichmentStatus: AiSalesContactEnrichmentStatus.RUNNING,
        contactVerificationStatus: AiSalesContactVerificationStatus.ENRICHMENT_RUNNING,
      },
    });

    const enriched = await this.runEnrichment({
      website: prospect.website,
      companyName: prospect.companyName,
      prospectId,
      userId,
    });
    await this.applyToProspect(prospectId, enriched);
    return enriched;
  }

  async enrichSearchResultBatch(searchResultIds: string[], userId?: string) {
    const settings = await this.settings.getOrCreate();
    const limit = Math.min(settings.enrichmentBatchLimit, searchResultIds.length);
    const ids = searchResultIds.slice(0, limit);
    const results: EnrichmentResult[] = [];
    for (const id of ids) {
      try {
        results.push(await this.enrichSearchResult(id, userId));
      } catch (err) {
        results.push({
          success: false,
          searchResultId: id,
          verificationStatus: AiSalesContactVerificationStatus.ENRICHMENT_FAILED,
          email: null,
          phone: null,
          visitedPages: [],
          contacts: [],
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return { processed: results.length, results };
  }

  async getContactsForSearchResult(searchResultId: string) {
    return this.prisma.aiSalesPublicContact.findMany({
      where: { searchResultId },
      orderBy: [{ isPrimary: 'desc' }, { confidence: 'desc' }],
    });
  }

  async getContactsForProspect(prospectId: string) {
    return this.prisma.aiSalesPublicContact.findMany({
      where: { prospectId },
      orderBy: [{ isPrimary: 'desc' }, { confidence: 'desc' }],
    });
  }

  async selectContact(
    searchResultId: string,
    contactId: string,
    type: 'EMAIL' | 'PHONE',
    userId?: string,
  ) {
    const contact = await this.prisma.aiSalesPublicContact.findFirst({
      where: { id: contactId, searchResultId },
    });
    if (!contact) throw new NotFoundException('Kontakt nenalezen.');

    await this.prisma.aiSalesPublicContact.updateMany({
      where: { searchResultId, type: type === 'EMAIL' ? AiSalesContactType.EMAIL : AiSalesContactType.PHONE },
      data: { isPrimary: false },
    });
    await this.prisma.aiSalesPublicContact.update({
      where: { id: contactId },
      data: { isPrimary: true, verifiedById: userId, verifiedAt: new Date() },
    });

    const data =
      type === 'EMAIL'
        ? { publicEmail: contact.normalizedValue ?? contact.value }
        : { publicPhone: contact.normalizedValue ?? contact.value };

    return this.prisma.aiSalesSearchResult.update({
      where: { id: searchResultId },
      data,
    });
  }

  async updateProspectContact(
    prospectId: string,
    input: {
      email?: string | null;
      phone?: string | null;
      contactName?: string | null;
      position?: string | null;
      website?: string | null;
      contactSourceNote?: string | null;
      manualConfirm?: boolean;
    },
    userId?: string,
  ) {
    if (!input.manualConfirm) {
      throw new ForbiddenException('Ruční kontakt vyžaduje potvrzení oprávněného získání.');
    }

    const email = input.email?.trim().toLowerCase() || null;
    const phone = input.phone?.trim() || null;

    await this.prisma.aiSalesProspect.update({
      where: { id: prospectId },
      data: {
        email,
        phone,
        primaryEmail: email,
        primaryPhone: phone,
        contactName: input.contactName ?? undefined,
        position: input.position ?? undefined,
        website: input.website ?? undefined,
        contactSourceNote: input.contactSourceNote ?? undefined,
        contactVerificationStatus: AiSalesContactVerificationStatus.MANUALLY_VERIFIED,
        verificationStatus: email ? 'VERIFIED' : 'PARTIALLY_VERIFIED',
        contactEnrichmentStatus: AiSalesContactEnrichmentStatus.COMPLETED,
        lastEnrichmentAt: new Date(),
      },
    });

    if (email) {
      await this.prisma.aiSalesPublicContact.create({
        data: {
          prospectId,
          type: AiSalesContactType.EMAIL,
          value: email,
          normalizedValue: email,
          verificationStatus: AiSalesContactVerificationStatus.MANUALLY_VERIFIED,
          confidence: 1,
          isPrimary: true,
          sourceTextSnippet: input.contactSourceNote ?? 'Ručně zadaný kontakt administrátorem',
          verifiedById: userId,
          verifiedAt: new Date(),
        },
      });
    }
    if (phone) {
      await this.prisma.aiSalesPublicContact.create({
        data: {
          prospectId,
          type: AiSalesContactType.PHONE,
          value: phone,
          normalizedValue: phone,
          verificationStatus: AiSalesContactVerificationStatus.MANUALLY_VERIFIED,
          confidence: 1,
          isPrimary: true,
          sourceTextSnippet: input.contactSourceNote ?? 'Ručně zadaný kontakt administrátorem',
          verifiedById: userId,
          verifiedAt: new Date(),
        },
      });
    }

    return this.prisma.aiSalesProspect.findUnique({
      where: { id: prospectId },
      include: { publicContacts: true },
    });
  }

  async autoEnrichAfterSearch(searchId: string, userId?: string) {
    const settings = await this.settings.getOrCreate();
    if (!settings.autoEnrichContactsOnSearch) return { skipped: true };

    const results = await this.prisma.aiSalesSearchResult.findMany({
      where: {
        searchId,
        website: { not: null },
        OR: [{ publicEmail: null }, { publicPhone: null }],
      },
      take: settings.enrichmentBatchLimit,
    });

    const ids = results.map((r) => r.id);
    return this.enrichSearchResultBatch(ids, userId);
  }

  private async runEnrichment(opts: {
    website: string;
    companyName: string;
    searchResultId?: string;
    prospectId?: string;
    userId?: string;
  }): Promise<EnrichmentResult> {
    const startUrl = this.crawler.normalizeWebsiteUrl(opts.website);
    const baseHost = this.crawler.getHost(startUrl);
    let paths = [...SEED_PATHS];
    let blocked = false;

    const first = await this.crawler.crawl(['/'], startUrl);
    if (first.error === 'WEBSITE_UNAVAILABLE' && !first.pages.length) {
      return {
        success: false,
        searchResultId: opts.searchResultId,
        prospectId: opts.prospectId,
        verificationStatus: AiSalesContactVerificationStatus.WEBSITE_UNAVAILABLE,
        email: null,
        phone: null,
        visitedPages: [],
        contacts: [],
        error: first.error,
      };
    }
    if (first.pages[0]) {
      paths = discoverContactPaths(first.pages[0].url, first.pages[0].html);
    }

    let crawlResult: Awaited<ReturnType<CompanyWebsiteCrawlerService['crawl']>>;
    try {
      crawlResult = await this.crawler.crawl(paths, startUrl);
    } catch (err) {
      if (String(err).includes('BLOCKED')) blocked = true;
      crawlResult = { pages: first.pages, error: String(err) };
    }

    const visitedPages = crawlResult.pages.map((p) => ({ url: p.url, title: p.title, status: p.status }));
    const allEmails: ReturnType<typeof extractEmailsFromHtml> = [];
    const allPhones: ReturnType<typeof extractPhonesFromHtml> = [];

    for (const page of crawlResult.pages) {
      allEmails.push(...extractEmailsFromHtml(page.html, page.url, baseHost));
      allPhones.push(...extractPhonesFromHtml(page.html, page.url));
    }

    const emailMap = new Map(allEmails.map((e) => [e.normalizedValue, e]));
    const phoneMap = new Map(allPhones.map((p) => [p.normalizedValue, p]));

    await this.prisma.aiSalesPublicContact.deleteMany({
      where: {
        ...(opts.searchResultId ? { searchResultId: opts.searchResultId } : {}),
        ...(opts.prospectId ? { prospectId: opts.prospectId } : {}),
      },
    });

    const createdContacts: EnrichmentResult['contacts'] = [];
    let primaryEmail: string | null = null;
    let primaryPhone: string | null = null;

    let i = 0;
    for (const em of emailMap.values()) {
      const row = await this.prisma.aiSalesPublicContact.create({
        data: {
          searchResultId: opts.searchResultId,
          prospectId: opts.prospectId,
          type: AiSalesContactType.EMAIL,
          value: em.value,
          normalizedValue: em.normalizedValue,
          sourceUrl: em.label,
          sourceTextSnippet: em.sourceTextSnippet,
          verificationStatus: AiSalesContactVerificationStatus.PUBLICLY_LISTED,
          confidence: em.confidence,
          isPrimary: i === 0,
        },
      });
      if (i === 0) primaryEmail = em.normalizedValue;
      createdContacts.push({
        id: row.id,
        type: 'EMAIL',
        value: em.value,
        sourceUrl: row.sourceUrl,
        sourceTextSnippet: row.sourceTextSnippet,
        confidence: em.confidence,
        isPrimary: row.isPrimary,
      });
      i += 1;
    }

    let j = 0;
    for (const ph of phoneMap.values()) {
      const row = await this.prisma.aiSalesPublicContact.create({
        data: {
          searchResultId: opts.searchResultId,
          prospectId: opts.prospectId,
          type: AiSalesContactType.PHONE,
          value: ph.value,
          normalizedValue: ph.normalizedValue,
          originalValue: ph.originalValue,
          phoneKind: ph.phoneKind,
          sourceUrl: visitedPages[0]?.url,
          sourceTextSnippet: ph.sourceTextSnippet,
          verificationStatus: AiSalesContactVerificationStatus.PUBLICLY_LISTED,
          confidence: ph.confidence,
          isPrimary: j === 0,
        },
      });
      if (j === 0) primaryPhone = ph.normalizedValue;
      createdContacts.push({
        id: row.id,
        type: 'PHONE',
        value: ph.value,
        sourceUrl: row.sourceUrl,
        sourceTextSnippet: row.sourceTextSnippet,
        confidence: ph.confidence,
        isPrimary: row.isPrimary,
      });
      j += 1;
    }

    const verificationStatus = this.verification.resolveVerificationStatus({
      hasWebsite: true,
      websiteReachable: visitedPages.length > 0,
      blocked,
      emailCount: emailMap.size,
      phoneCount: phoneMap.size,
      hasCompanyName: Boolean(opts.companyName?.trim()),
    });

    this.bumpDailyCount();

    return {
      success: true,
      searchResultId: opts.searchResultId,
      prospectId: opts.prospectId,
      verificationStatus,
      email: primaryEmail,
      phone: primaryPhone,
      visitedPages,
      contacts: createdContacts,
    };
  }

  private async applyToSearchResult(searchResultId: string, enriched: EnrichmentResult) {
    const searchVerification =
      enriched.verificationStatus === AiSalesContactVerificationStatus.VERIFIED
        ? AiSalesSearchResultVerification.VERIFIED
        : enriched.email || enriched.phone
          ? AiSalesSearchResultVerification.PARTIALLY_VERIFIED
          : AiSalesSearchResultVerification.PARTIALLY_VERIFIED;

    await this.prisma.aiSalesSearchResult.update({
      where: { id: searchResultId },
      data: {
        publicEmail: enriched.email ?? undefined,
        publicPhone: enriched.phone ?? undefined,
        contactVerificationStatus: enriched.verificationStatus,
        contactEnrichmentStatus: AiSalesContactEnrichmentStatus.COMPLETED,
        verificationStatus: searchVerification,
        lastEnrichmentAt: new Date(),
        lastEnrichmentError: null,
        enrichmentLogJson: {
          visitedPages: enriched.visitedPages,
          contactCount: enriched.contacts.length,
        } as Prisma.InputJsonValue,
      },
    });
  }

  private async applyToProspect(prospectId: string, enriched: EnrichmentResult) {
    await this.prisma.aiSalesProspect.update({
      where: { id: prospectId },
      data: {
        email: enriched.email ?? undefined,
        phone: enriched.phone ?? undefined,
        primaryEmail: enriched.email ?? undefined,
        primaryPhone: enriched.phone ?? undefined,
        contactVerificationStatus: enriched.verificationStatus,
        contactEnrichmentStatus: AiSalesContactEnrichmentStatus.COMPLETED,
        verificationStatus:
          enriched.verificationStatus === AiSalesContactVerificationStatus.VERIFIED
            ? 'VERIFIED'
            : 'PARTIALLY_VERIFIED',
        lastEnrichmentAt: new Date(),
        lastEnrichmentError: null,
      },
    });
  }

  private async failResult(searchResultId: string | undefined, prospectId: string | undefined, error: string) {
    return {
      success: false,
      searchResultId,
      prospectId,
      verificationStatus: AiSalesContactVerificationStatus.ENRICHMENT_FAILED,
      email: null,
      phone: null,
      visitedPages: [],
      contacts: [],
      error,
    };
  }

  private async assertDailyLimit() {
    const settings = await this.settings.getOrCreate();
    const today = new Date().toDateString();
    if (today !== this.dailyReset) {
      this.dailyReset = today;
      this.dailyCount = 0;
    }
    if (this.dailyCount >= settings.dailyEnrichmentLimit) {
      throw new ForbiddenException(`Denní limit enrichmentů (${settings.dailyEnrichmentLimit}) byl překročen.`);
    }
  }

  private bumpDailyCount() {
    this.dailyCount += 1;
  }
}
