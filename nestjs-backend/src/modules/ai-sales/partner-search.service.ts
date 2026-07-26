import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AiSalesPartnerType,
  AiSalesProspectStatus,
  AiSalesSearchResultVerification,
  AiSalesSearchStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AiSalesSettingsService } from './ai-sales-settings.service';
import { AiSalesSuppressionService } from './ai-sales-suppression.service';
import { EMAIL_RE } from './ai-sales-prospect.service';
import type { PartnerSearchInput, PartnerSearchResultItem, PartnerSearchSource } from './partner-search.types';
import { InternalDatabaseSearchProvider } from './providers/internal-database-search.provider';
import { WebSearchProvider } from './providers/web-search.provider';

@Injectable()
export class PartnerSearchService {
  private readonly log = new Logger(PartnerSearchService.name);
  private readonly running = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AiSalesSettingsService,
    private readonly suppression: AiSalesSuppressionService,
    private readonly internalDb: InternalDatabaseSearchProvider,
    private readonly webSearch: WebSearchProvider,
  ) {}

  async startSearch(
    input: {
      partnerType?: AiSalesPartnerType;
      region?: string;
      district?: string;
      city?: string;
      keywords?: string[];
      specialization?: string;
      sources?: PartnerSearchSource[];
      limit?: number;
      minFitScore?: number;
    },
    userId?: string,
  ) {
    const settings = await this.settings.getOrCreate();
    if (!settings.enabled) {
      throw new ForbiddenException('AI obchodník je vypnutý.');
    }

    await this.assertDailySearchLimit(settings.dailySearchResultLimit);

    const sources = input.sources?.length
      ? input.sources
      : (['INTERNAL_DATABASE'] as PartnerSearchSource[]);

    if (sources.includes('APPROVED_WEB_PROVIDER') && !this.webSearch.isConfigured()) {
      throw new BadRequestException(
        'Webový zdroj zatím není nakonfigurován. Použijte interní databázi, ruční vložení nebo CSV import.',
      );
    }

    const search = await this.prisma.aiSalesSearch.create({
      data: {
        partnerType: input.partnerType,
        region: input.region,
        district: input.district,
        city: input.city,
        keywordsJson: input.keywords ?? [],
        sourcesJson: sources,
        specialization: input.specialization,
        minFitScore: input.minFitScore,
        limit: Math.min(100, input.limit ?? 30),
        status: AiSalesSearchStatus.PENDING,
        createdById: userId,
      },
    });

    void this.processSearchAsync(search.id);
    return { success: true, searchId: search.id, status: 'PENDING' };
  }

  async processSearchAsync(searchId: string) {
    if (this.running.has(searchId)) return;
    this.running.add(searchId);

    try {
      await this.executeSearch(searchId);
    } catch (err) {
      this.log.error(`Search ${searchId} failed: ${err instanceof Error ? err.message : String(err)}`);
      await this.prisma.aiSalesSearch.update({
        where: { id: searchId },
        data: {
          status: AiSalesSearchStatus.FAILED,
          errorCode: 'SEARCH_FAILED',
          errorMessage: err instanceof Error ? err.message : String(err),
          finishedAt: new Date(),
        },
      });
    } finally {
      this.running.delete(searchId);
    }
  }

  private async executeSearch(searchId: string) {
    const search = await this.prisma.aiSalesSearch.findUnique({ where: { id: searchId } });
    if (!search || search.status === AiSalesSearchStatus.CANCELLED) return;

    await this.prisma.aiSalesSearch.update({
      where: { id: searchId },
      data: { status: AiSalesSearchStatus.RUNNING, startedAt: new Date(), progressPercent: 5 },
    });

    const sources = (search.sourcesJson as PartnerSearchSource[]) ?? ['INTERNAL_DATABASE'];
    const input: PartnerSearchInput = {
      partnerType: search.partnerType ?? undefined,
      region: search.region ?? undefined,
      district: search.district ?? undefined,
      city: search.city ?? undefined,
      keywords: Array.isArray(search.keywordsJson) ? (search.keywordsJson as string[]) : [],
      specialization: search.specialization ?? undefined,
      sources,
      limit: search.limit,
    };

    const allItems: PartnerSearchResultItem[] = [];
    const sourceCount = sources.length || 1;
    let idx = 0;

    for (const source of sources) {
      idx++;
      await this.prisma.aiSalesSearch.update({
        where: { id: searchId },
        data: {
          currentSource: source,
          progressPercent: Math.round((idx / sourceCount) * 80),
        },
      });

      if (source === 'INTERNAL_DATABASE') {
        allItems.push(...(await this.internalDb.search(input)));
      } else if (source === 'APPROVED_WEB_PROVIDER') {
        if (this.webSearch.isConfigured()) {
          allItems.push(...(await this.webSearch.search(input)));
        }
      }
    }

    const deduped = await this.enrichAndDedupe(allItems, searchId);

    await this.prisma.aiSalesSearch.update({
      where: { id: searchId },
      data: {
        status: AiSalesSearchStatus.COMPLETED,
        totalFound: allItems.length,
        newResults: deduped.newCount,
        duplicateResults: deduped.duplicateCount,
        suppressedResults: deduped.suppressedCount,
        progressPercent: 100,
        finishedAt: new Date(),
      },
    });

    await this.prisma.aiSalesSettings.update({
      where: { id: 'default' },
      data: { lastSearchAt: new Date(), lastSearchSuccessAt: new Date(), lastSearchErrorCode: null },
    });
  }

  private async enrichAndDedupe(items: PartnerSearchResultItem[], searchId: string) {
    let newCount = 0;
    let duplicateCount = 0;
    let suppressedCount = 0;

    for (const item of items) {
      let verificationStatus: AiSalesSearchResultVerification = AiSalesSearchResultVerification.UNVERIFIED;
      let duplicate = false;
      let doNotContact = item.doNotContact;

      if (item.publicEmail && !EMAIL_RE.test(item.publicEmail)) {
        verificationStatus = AiSalesSearchResultVerification.INVALID;
      } else if (item.publicEmail) {
        const sup = await this.suppression.isSuppressed(item.publicEmail);
        if (sup.suppressed) {
          doNotContact = true;
          verificationStatus = AiSalesSearchResultVerification.DO_NOT_CONTACT;
          suppressedCount++;
        }
      }

      const existingProspect = await this.findDuplicateProspect(item);
      if (existingProspect) {
        duplicate = true;
        verificationStatus = AiSalesSearchResultVerification.DUPLICATE;
        duplicateCount++;
      } else if (!doNotContact) {
        if (item.verified && item.publicEmail) {
          verificationStatus = AiSalesSearchResultVerification.VERIFIED;
        } else if (item.website || item.companyName) {
          verificationStatus = AiSalesSearchResultVerification.PARTIALLY_VERIFIED;
        }
        newCount++;
      }

      await this.prisma.aiSalesSearchResult.create({
        data: {
          searchId,
          partnerType: item.partnerType,
          companyName: item.companyName,
          contactName: item.contactName,
          publicEmail: item.publicEmail,
          publicPhone: item.publicPhone,
          website: item.website,
          city: item.city,
          region: item.region,
          specializationJson: item.specialization,
          source: item.source,
          sourceUrl: item.sourceUrl,
          relevanceReason: item.relevanceReason,
          verificationStatus,
          doNotContact,
          rawDataJson: (item.rawData ?? {}) as Prisma.InputJsonValue,
        },
      });
    }

    return { newCount, duplicateCount, suppressedCount };
  }

  private async findDuplicateProspect(item: PartnerSearchResultItem) {
    if (item.publicEmail) {
      const byEmail = await this.prisma.aiSalesProspect.findFirst({
        where: { email: item.publicEmail.toLowerCase() },
      });
      if (byEmail) return byEmail;
    }
    const byCompany = await this.prisma.aiSalesProspect.findFirst({
      where: { companyName: { equals: item.companyName, mode: 'insensitive' } },
    });
    return byCompany;
  }

  async getSearch(id: string) {
    const row = await this.prisma.aiSalesSearch.findUnique({
      where: { id },
      include: { _count: { select: { results: true } } },
    });
    if (!row) throw new NotFoundException('Vyhledávání nenalezeno.');
    return row;
  }

  async listSearches(limit = 20) {
    return this.prisma.aiSalesSearch.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getSearchResults(searchId: string) {
    return this.prisma.aiSalesSearchResult.findMany({
      where: { searchId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async cancelSearch(id: string) {
    return this.prisma.aiSalesSearch.update({
      where: { id },
      data: { status: AiSalesSearchStatus.CANCELLED, finishedAt: new Date() },
    });
  }

  async saveSearchResult(resultId: string, userId?: string) {
    const result = await this.prisma.aiSalesSearchResult.findUnique({ where: { id: resultId } });
    if (!result) throw new NotFoundException('Výsledek nenalezen.');
    if (result.doNotContact || result.verificationStatus === 'DO_NOT_CONTACT') {
      throw new ForbiddenException('Kontakt je v DO_NOT_CONTACT.');
    }
    if (result.savedProspectId) {
      const existing = await this.prisma.aiSalesProspect.findUnique({ where: { id: result.savedProspectId } });
      if (!existing) throw new NotFoundException('Uložený partner nenalezen.');
      return existing;
    }

    if (result.publicEmail) {
      const sup = await this.suppression.isSuppressed(result.publicEmail);
      if (sup.suppressed) throw new ForbiddenException(`E-mail je v seznamu zákazu: ${sup.reason}`);
    }

    const dupOr: Prisma.AiSalesProspectWhereInput[] = [
      { companyName: { equals: result.companyName, mode: 'insensitive' } },
    ];
    if (result.publicEmail) {
      dupOr.unshift({ email: result.publicEmail.toLowerCase() });
    }
    const dup = await this.prisma.aiSalesProspect.findFirst({
      where: { OR: dupOr },
    });
    if (dup) throw new BadRequestException('Duplicitní kontakt již existuje.');

    const prospect = await this.prisma.aiSalesProspect.create({
      data: {
        partnerType: result.partnerType,
        companyName: result.companyName,
        contactName: result.contactName,
        email: result.publicEmail?.toLowerCase(),
        phone: result.publicPhone,
        website: result.website,
        city: result.city,
        region: result.region,
        specialization: Array.isArray(result.specializationJson)
          ? (result.specializationJson as string[]).join(', ')
          : undefined,
        source: result.source,
        sourceUrl: result.sourceUrl,
        publicInfo: result.relevanceReason,
        verificationStatus:
          result.verificationStatus === 'VERIFIED'
            ? 'VERIFIED'
            : result.verificationStatus === 'PARTIALLY_VERIFIED'
              ? 'PARTIALLY_VERIFIED'
              : 'UNVERIFIED',
        status: AiSalesProspectStatus.NEEDS_REVIEW,
        sourceSearchResultId: result.id,
        createdById: userId,
        publicDataCheckedAt: new Date(),
      },
    });

    await this.prisma.aiSalesSearchResult.update({
      where: { id: resultId },
      data: { savedProspectId: prospect.id },
    });

    return prospect;
  }

  async rejectSearchResult(resultId: string) {
    return this.prisma.aiSalesSearchResult.update({
      where: { id: resultId },
      data: { verificationStatus: AiSalesSearchResultVerification.INVALID },
    });
  }

  async verifySearchResult(resultId: string) {
    const result = await this.prisma.aiSalesSearchResult.findUnique({ where: { id: resultId } });
    if (!result) throw new NotFoundException('Výsledek nenalezen.');

    const checks: string[] = [];
    let verificationStatus: AiSalesSearchResultVerification = AiSalesSearchResultVerification.UNVERIFIED;
    let doNotContact = result.doNotContact;

    if (!result.companyName?.trim()) {
      verificationStatus = AiSalesSearchResultVerification.INVALID;
      checks.push('Chybí název firmy.');
    }

    if (result.publicEmail && !EMAIL_RE.test(result.publicEmail)) {
      verificationStatus = AiSalesSearchResultVerification.INVALID;
      checks.push('Neplatný formát e-mailu.');
    }

    if (result.website) {
      try {
        const url = result.website.startsWith('http') ? result.website : `https://${result.website}`;
        new URL(url);
      } catch {
        verificationStatus = AiSalesSearchResultVerification.INVALID;
        checks.push('Neplatná webová adresa.');
      }
    }

    if (result.publicEmail) {
      const sup = await this.suppression.isSuppressed(result.publicEmail);
      if (sup.suppressed) {
        doNotContact = true;
        verificationStatus = AiSalesSearchResultVerification.DO_NOT_CONTACT;
        checks.push(`E-mail je v seznamu zákazu (${sup.reason ?? 'suppression'}).`);
      }
    }

    const dupProspect = await this.findDuplicateProspect({
      temporaryId: result.id,
      partnerType: result.partnerType,
      companyName: result.companyName,
      contactName: result.contactName,
      publicEmail: result.publicEmail,
      publicPhone: result.publicPhone,
      website: result.website,
      city: result.city,
      region: result.region,
      specialization: Array.isArray(result.specializationJson) ? (result.specializationJson as string[]) : [],
      source: result.source,
      sourceUrl: result.sourceUrl,
      relevanceReason: result.relevanceReason ?? '',
      verified: false,
      duplicate: false,
      doNotContact: false,
    });

    if (dupProspect) {
      verificationStatus = AiSalesSearchResultVerification.DUPLICATE;
      checks.push('Duplicitní kontakt již existuje mezi partnery.');
    } else if (!doNotContact && verificationStatus !== AiSalesSearchResultVerification.INVALID) {
      const hasEmail = Boolean(result.publicEmail && EMAIL_RE.test(result.publicEmail));
      const hasWebsite = Boolean(result.website);
      if (hasEmail && hasWebsite) {
        verificationStatus = AiSalesSearchResultVerification.VERIFIED;
        checks.push('E-mail a web jsou ve validním formátu.');
      } else if (hasEmail || hasWebsite || result.companyName) {
        verificationStatus = AiSalesSearchResultVerification.PARTIALLY_VERIFIED;
        checks.push('Dostupné pouze částečné veřejné údaje.');
      }
    }

    const updated = await this.prisma.aiSalesSearchResult.update({
      where: { id: resultId },
      data: { verificationStatus, doNotContact },
    });

    return {
      success: true,
      result: updated,
      checks,
      verificationStatus,
      doNotContact,
      duplicate: verificationStatus === AiSalesSearchResultVerification.DUPLICATE,
    };
  }

  async markResultDoNotContact(resultId: string, reason?: string) {
    const result = await this.prisma.aiSalesSearchResult.findUnique({ where: { id: resultId } });
    if (!result) throw new NotFoundException('Výsledek nenalezen.');
    if (result.publicEmail) {
      await this.suppression.addSuppression({ email: result.publicEmail, reason, source: 'SEARCH' });
    }
    return this.prisma.aiSalesSearchResult.update({
      where: { id: resultId },
      data: {
        doNotContact: true,
        verificationStatus: AiSalesSearchResultVerification.DO_NOT_CONTACT,
      },
    });
  }

  async listProviders() {
    const providers = await this.prisma.aiSalesSearchProvider.findMany({ orderBy: { name: 'asc' } });
    const webConfigured = this.webSearch.isConfigured();
    return providers.map((p) => ({
      ...p,
      configured:
        p.key === 'BING_WEB_SEARCH' || p.key === 'SERPAPI' ? webConfigured : p.configured,
    }));
  }

  async testProvider(providerKey: string) {
    const settings = await this.settings.getOrCreate();
    const started = Date.now();

    if (providerKey === 'INTERNAL_DATABASE') {
      const items = await this.internalDb.search({
        sources: ['INTERNAL_DATABASE'],
        limit: 5,
        city: 'Pardubice',
        partnerType: AiSalesPartnerType.REAL_ESTATE_AGENCY,
      });
      await this.prisma.aiSalesSettings.update({
        where: { id: 'default' },
        data: { lastProviderTestAt: new Date(), lastProviderTestSuccess: true },
      });
      return {
        success: true,
        provider: providerKey,
        count: items.length,
        durationMs: Date.now() - started,
        results: items.slice(0, 5),
      };
    }

    if (providerKey === 'BING_WEB_SEARCH' || providerKey === 'SERPAPI' || providerKey === 'APPROVED_WEB_PROVIDER') {
      if (!this.webSearch.isConfigured()) {
        await this.prisma.aiSalesSettings.update({
          where: { id: 'default' },
          data: {
            lastProviderTestAt: new Date(),
            lastProviderTestSuccess: false,
            lastSearchErrorCode: 'SEARCH_PROVIDER_NOT_CONFIGURED',
            lastSearchErrorMessage: 'Není nastaven BING_SEARCH_API_KEY ani SERPAPI_API_KEY.',
          },
        });
        throw new BadRequestException(
          'Webový provider není nakonfigurován. Nastavte BING_SEARCH_API_KEY nebo SERPAPI_API_KEY.',
        );
      }
      const items = await this.webSearch.search({
        sources: ['APPROVED_WEB_PROVIDER'],
        limit: 5,
        city: 'Pardubice',
        partnerType: AiSalesPartnerType.REAL_ESTATE_AGENCY,
        keywords: ['realitní kancelář'],
      });
      return {
        success: true,
        provider: this.webSearch.getName(),
        count: items.length,
        durationMs: Date.now() - started,
        results: items.slice(0, 5),
      };
    }

    throw new BadRequestException(`Neznámý provider: ${providerKey}`);
  }

  private async assertDailySearchLimit(limit: number) {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const count = await this.prisma.aiSalesSearchResult.count({
      where: { createdAt: { gte: dayStart } },
    });
    if (count >= limit) {
      throw new ForbiddenException(`Denní limit vyhledávání (${limit} výsledků) byl překročen.`);
    }
  }
}
