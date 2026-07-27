import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AiSalesContactType,
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
import { AiSalesAdminException, buildSalesAdminError } from './ai-sales-errors.util';
import type { PartnerSearchInput, PartnerSearchResultItem, PartnerSearchSource } from './partner-search.types';
import { InternalDatabaseSearchProvider } from './providers/internal-database-search.provider';
import { runSerpApiTest } from './providers/serpapi.client';
import { WebSearchProvider } from './providers/web-search.provider';
import { SearchProvidersEnvService } from './search-providers-env.service';
import { PartnerContactEnrichmentService } from './partner-contact-enrichment.service';
import { AiSalesPublicContactService, type SaveSearchResultOptions } from './ai-sales-public-contact.service';

export type SkippedSearchSource = {
  source: string;
  code: string;
  message: string;
};

export type SearchSourceResolution = {
  requestedSources: PartnerSearchSource[];
  usedSources: PartnerSearchSource[];
  skippedSources: SkippedSearchSource[];
  partial: boolean;
};

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
    private readonly searchEnv: SearchProvidersEnvService,
    private readonly contactEnrichment: PartnerContactEnrichmentService,
    private readonly publicContacts: AiSalesPublicContactService,
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

    const requestedSources = (input.sources?.length
      ? input.sources
      : ['INTERNAL_DATABASE']) as PartnerSearchSource[];

    const resolution = this.resolveSources(requestedSources, settings.internalDatabaseEnabled);

    if (resolution.usedSources.length === 0) {
      const onlyWeb =
        requestedSources.length === 1 && requestedSources[0] === 'APPROVED_WEB_PROVIDER';
      throw new AiSalesAdminException(
        buildSalesAdminError(
          onlyWeb ? 'SEARCH_PROVIDER_NOT_CONFIGURED' : 'NO_AVAILABLE_SEARCH_SOURCE',
          onlyWeb
            ? 'Webový provider není nakonfigurován. Nastavte SERPAPI_API_KEY nebo BING_SEARCH_API_KEY na backendu, nebo použijte interní databázi.'
            : 'Žádný vyhledávací zdroj není dostupný.',
          400,
          'search',
        ),
      );
    }

    const searchMeta = {
      requestedSources: resolution.requestedSources,
      usedSources: resolution.usedSources,
      skippedSources: resolution.skippedSources,
      partial: resolution.partial,
    };

    const search = await this.prisma.aiSalesSearch.create({
      data: {
        partnerType: input.partnerType,
        region: input.region,
        district: input.district,
        city: input.city,
        keywordsJson: input.keywords ?? [],
        sourcesJson: requestedSources,
        searchMetaJson: searchMeta as Prisma.InputJsonValue,
        specialization: input.specialization,
        minFitScore: input.minFitScore,
        limit: Math.min(100, input.limit ?? 30),
        status: AiSalesSearchStatus.PENDING,
        createdById: userId,
      },
    });

    void this.processSearchAsync(search.id);
    return {
      success: true,
      partial: resolution.partial,
      searchId: search.id,
      status: 'PENDING',
      requestedSources: resolution.requestedSources,
      usedSources: resolution.usedSources,
      skippedSources: resolution.skippedSources,
    };
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

    const requestedSources = this.parseRequestedSources(search.sourcesJson);
    const settings = await this.settings.getOrCreate();
    const resolution = this.resolveSources(requestedSources, settings.internalDatabaseEnabled);

    const input: PartnerSearchInput = {
      partnerType: search.partnerType ?? undefined,
      region: search.region ?? undefined,
      district: search.district ?? undefined,
      city: search.city ?? undefined,
      keywords: Array.isArray(search.keywordsJson) ? (search.keywordsJson as string[]) : [],
      specialization: search.specialization ?? undefined,
      sources: resolution.usedSources,
      limit: search.limit,
    };

    const providerJobs = resolution.usedSources.map((source) => ({
      source,
      run: async (): Promise<PartnerSearchResultItem[]> => {
        if (source === 'INTERNAL_DATABASE') {
          return this.internalDb.search(input);
        }
        if (source === 'APPROVED_WEB_PROVIDER') {
          return this.webSearch.search(input);
        }
        return [];
      },
    }));

    const settled = await Promise.allSettled(
      providerJobs.map(async (job, index) => {
        await this.prisma.aiSalesSearch.update({
          where: { id: searchId },
          data: {
            currentSource: job.source,
            progressPercent: Math.round(((index + 1) / Math.max(providerJobs.length, 1)) * 80),
          },
        });
        const items = await job.run();
        return { source: job.source, items };
      }),
    );

    const allItems: PartnerSearchResultItem[] = [];
    const failedSources: SkippedSearchSource[] = [...resolution.skippedSources];

    for (let i = 0; i < settled.length; i++) {
      const result = settled[i];
      const source = providerJobs[i]?.source ?? 'UNKNOWN';
      if (result.status === 'fulfilled') {
        allItems.push(...result.value.items);
      } else {
        const message =
          result.reason instanceof Error ? result.reason.message : String(result.reason);
        this.log.warn(`Search provider ${source} failed: ${message}`);
        failedSources.push({
          source,
          code: 'SEARCH_PROVIDER_FAILED',
          message: `Zdroj ${source} selhal: ${message}`,
        });
      }
    }

    const mergedItems = this.mergeSearchItems(allItems);
    const deduped = await this.enrichAndDedupe(mergedItems, searchId);

    const searchMeta = {
      requestedSources: resolution.requestedSources,
      usedSources: resolution.usedSources,
      skippedSources: failedSources,
      partial: failedSources.length > 0,
      totalFound: mergedItems.length,
    };

    const hasAnySuccess =
      settled.some((r) => r.status === 'fulfilled') || mergedItems.length > 0;

    if (!hasAnySuccess && resolution.usedSources.length > 0) {
      await this.prisma.aiSalesSearch.update({
        where: { id: searchId },
        data: {
          status: AiSalesSearchStatus.FAILED,
          errorCode: 'SEARCH_FAILED',
          errorMessage: 'Všechny vybrané zdroje selhaly.',
          searchMetaJson: searchMeta as Prisma.InputJsonValue,
          finishedAt: new Date(),
        },
      });
      return;
    }

    await this.prisma.aiSalesSearch.update({
      where: { id: searchId },
      data: {
        status: AiSalesSearchStatus.COMPLETED,
        totalFound: mergedItems.length,
        newResults: deduped.newCount,
        duplicateResults: deduped.duplicateCount,
        suppressedResults: deduped.suppressedCount,
        progressPercent: 100,
        searchMetaJson: searchMeta as Prisma.InputJsonValue,
        errorCode: failedSources.length > 0 ? 'PARTIAL' : null,
        errorMessage:
          failedSources.length > 0
            ? failedSources.map((s) => s.message).join(' ')
            : null,
        finishedAt: new Date(),
      },
    });

    await this.prisma.aiSalesSettings.update({
      where: { id: 'default' },
      data: { lastSearchAt: new Date(), lastSearchSuccessAt: new Date(), lastSearchErrorCode: null },
    });

    void this.contactEnrichment.autoEnrichAfterSearch(searchId).catch((err) => {
      this.log.warn(`Auto enrichment failed for search ${searchId}: ${err instanceof Error ? err.message : String(err)}`);
    });
  }

  private parseRequestedSources(sourcesJson: Prisma.JsonValue | null): PartnerSearchSource[] {
    if (!sourcesJson) return ['INTERNAL_DATABASE'];
    if (Array.isArray(sourcesJson)) {
      return sourcesJson as PartnerSearchSource[];
    }
    if (typeof sourcesJson === 'object' && sourcesJson !== null && 'requested' in sourcesJson) {
      return (sourcesJson as { requested: PartnerSearchSource[] }).requested;
    }
    return ['INTERNAL_DATABASE'];
  }

  resolveSources(
    requestedSources: PartnerSearchSource[],
    internalDatabaseEnabled = true,
  ): SearchSourceResolution {
    const usedSources: PartnerSearchSource[] = [];
    const skippedSources: SkippedSearchSource[] = [];

    for (const source of requestedSources) {
      if (source === 'INTERNAL_DATABASE') {
        if (internalDatabaseEnabled) {
          usedSources.push(source);
        } else {
          skippedSources.push({
            source,
            code: 'SEARCH_SOURCE_DISABLED',
            message: 'Interní databáze je vypnutá v nastavení.',
          });
        }
        continue;
      }

      if (source === 'APPROVED_WEB_PROVIDER') {
        if (this.webSearch.isConfigured()) {
          usedSources.push(source);
        } else {
          skippedSources.push({
            source,
            code: 'SEARCH_PROVIDER_NOT_CONFIGURED',
            message:
              'Webový provider nebyl použit, protože není nakonfigurován (SERPAPI_API_KEY nebo BING_SEARCH_API_KEY).',
          });
        }
        continue;
      }

      skippedSources.push({
        source,
        code: 'SEARCH_SOURCE_UNSUPPORTED',
        message: `Zdroj ${source} zatím není podporován ve vyhledávání.`,
      });
    }

    return {
      requestedSources,
      usedSources,
      skippedSources,
      partial: skippedSources.length > 0 && usedSources.length > 0,
    };
  }

  private mergeSearchItems(items: PartnerSearchResultItem[]): PartnerSearchResultItem[] {
    const map = new Map<string, PartnerSearchResultItem>();

    for (const item of items) {
      const key = this.dedupeKey(item);
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          ...item,
          rawData: {
            ...(item.rawData ?? {}),
            matchedSources: [item.source],
          },
        });
        continue;
      }

      const matchedSources = [
        ...new Set([
          ...((existing.rawData?.matchedSources as string[]) ?? [existing.source]),
          item.source,
        ]),
      ];
      map.set(key, {
        ...existing,
        publicEmail: existing.publicEmail ?? item.publicEmail,
        publicPhone: existing.publicPhone ?? item.publicPhone,
        website: existing.website ?? item.website,
        city: existing.city ?? item.city,
        region: existing.region ?? item.region,
        contactName: existing.contactName ?? item.contactName,
        relevanceReason: [existing.relevanceReason, item.relevanceReason]
          .filter(Boolean)
          .join(' | '),
        rawData: {
          ...(existing.rawData ?? {}),
          matchedSources,
        },
      });
    }

    return [...map.values()];
  }

  private dedupeKey(item: PartnerSearchResultItem): string {
    if (item.publicEmail) {
      return `email:${item.publicEmail.toLowerCase().trim()}`;
    }
    const domain = this.normalizeWebsiteDomain(item.website);
    if (domain) return `web:${domain}`;
    const phone = this.normalizePhone(item.publicPhone);
    if (phone) return `phone:${phone}`;
    const company = item.companyName.trim().toLowerCase();
    const city = (item.city ?? '').trim().toLowerCase();
    return `company:${company}|${city}`;
  }

  private normalizeWebsiteDomain(website: string | null): string | null {
    if (!website) return null;
    try {
      const url = website.startsWith('http') ? website : `https://${website}`;
      return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    } catch {
      return website.toLowerCase().replace(/^www\./, '');
    }
  }

  private normalizePhone(phone: string | null): string | null {
    if (!phone) return null;
    const digits = phone.replace(/\D/g, '');
    return digits.length >= 9 ? digits : null;
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

    const meta = row.searchMetaJson as {
      requestedSources?: string[];
      usedSources?: string[];
      skippedSources?: SkippedSearchSource[];
      partial?: boolean;
      totalFound?: number;
    } | null;

    return {
      ...row,
      partial: meta?.partial ?? row.errorCode === 'PARTIAL',
      requestedSources: meta?.requestedSources ?? (row.sourcesJson as string[]),
      usedSources: meta?.usedSources ?? [],
      skippedSources: meta?.skippedSources ?? [],
    };
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

  async saveSearchResult(resultId: string, userId?: string, options?: SaveSearchResultOptions) {
    try {
      return await this.saveSearchResultWithRetry(resultId, userId, options);
    } catch (err) {
      if (err instanceof AiSalesAdminException) throw err;
      if (
        err instanceof NotFoundException ||
        err instanceof ForbiddenException ||
        err instanceof BadRequestException
      ) {
        throw err;
      }
      throw new AiSalesAdminException(
        buildSalesAdminError(
          'SAVE_PROSPECT_FAILED',
          'Partnera se nepodařilo uložit.',
          500,
          'SAVE_PROSPECT_WITH_CONTACTS',
        ),
      );
    }
  }

  private async saveSearchResultWithRetry(
    resultId: string,
    userId?: string,
    options?: SaveSearchResultOptions,
    attempt = 0,
  ): Promise<Awaited<ReturnType<PartnerSearchService['saveSearchResultOnce']>>> {
    try {
      return await this.saveSearchResultOnce(resultId, userId, options);
    } catch (err) {
      if (attempt < 1 && this.isRetryableTransactionError(err)) {
        return this.saveSearchResultWithRetry(resultId, userId, options, attempt + 1);
      }
      throw this.mapSaveTransactionError(err);
    }
  }

  private isRetryableTransactionError(err: unknown): boolean {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      return err.code === 'P2034';
    }
    const msg = err instanceof Error ? err.message : String(err);
    return /deadlock|write conflict|could not serialize/i.test(msg);
  }

  private mapSaveTransactionError(err: unknown): unknown {
    if (
      err instanceof AiSalesAdminException ||
      err instanceof NotFoundException ||
      err instanceof ForbiddenException ||
      err instanceof BadRequestException
    ) {
      return err;
    }

    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2028') {
        return new AiSalesAdminException(
          buildSalesAdminError(
            'DATABASE_TRANSACTION_CLOSED',
            'Databázová transakce vypršela. Zkuste uložení znovu.',
            503,
            'SAVE_PROSPECT_WITH_CONTACTS',
          ),
        );
      }
      if (err.code === 'P2024') {
        return new AiSalesAdminException(
          buildSalesAdminError(
            'DATABASE_TRANSACTION_TIMEOUT',
            'Ukládání partnera trvalo příliš dlouho. Zkuste to znovu.',
            504,
            'SAVE_PROSPECT_WITH_CONTACTS',
          ),
        );
      }
    }

    const msg = err instanceof Error ? err.message : String(err);
    if (/transaction.*not found|transaction.*closed|Transaction API error/i.test(msg)) {
      return new AiSalesAdminException(
        buildSalesAdminError(
          'DATABASE_TRANSACTION_CLOSED',
          'Databázová transakce byla ukončena dříve, než doběhlo ukládání. Zkuste to znovu.',
          503,
          'SAVE_PROSPECT_WITH_CONTACTS',
        ),
      );
    }

    return err;
  }

  private async saveSearchResultOnce(
    resultId: string,
    userId?: string,
    options?: SaveSearchResultOptions,
  ): Promise<{
    success: true;
    action: 'CREATED' | 'UPDATED';
    prospectId: string;
    prospect: NonNullable<Awaited<ReturnType<PrismaService['aiSalesProspect']['findUnique']>>> & {
      publicContacts?: unknown[];
    };
    contactsSaved: number;
    emailsSaved: number;
    phonesSaved: number;
    savedContacts: number;
    primaryEmail: string | null;
    primaryPhone: string | null;
    redirectUrl: string;
    analysisStatus: 'PENDING';
  }> {
    const result = await this.prisma.aiSalesSearchResult.findUnique({
      where: { id: resultId },
      include: { publicContacts: true },
    });
    if (!result) throw new NotFoundException('Výsledek nenalezen.');
    if (result.doNotContact || result.verificationStatus === 'DO_NOT_CONTACT') {
      throw new ForbiddenException('Kontakt je v DO_NOT_CONTACT.');
    }

    const saveOptions = {
      ...options,
      explicitEmptySelection:
        Array.isArray(options?.selectedContactIds) && options.selectedContactIds.length === 0,
    };

    const prepared = await this.publicContacts.prepareContactSelectionForSave(resultId, saveOptions);
    this.publicContacts.assertPrimaryContactsForSave(prepared, resultId, options);

    for (const contact of prepared.contactsToTransfer) {
      if (
        contact.type === AiSalesContactType.EMAIL &&
        contact.normalizedValue &&
        prepared.outreachIds.has(contact.id)
      ) {
        const sup = await this.suppression.isSuppressed(contact.normalizedValue);
        if (sup.suppressed) {
          throw new ForbiddenException(`E-mail je v seznamu zákazu: ${sup.reason}`);
        }
      }
    }

    let prospectId = result.savedProspectId;
    let action: 'CREATED' | 'UPDATED' = 'CREATED';

    if (prospectId) {
      const existing = await this.prisma.aiSalesProspect.findUnique({ where: { id: prospectId } });
      if (!existing) throw new NotFoundException('Uložený partner nenalezen.');
      action = 'UPDATED';
    } else {
      const enrichedContacts = result.publicContacts;
      const dupOr: Prisma.AiSalesProspectWhereInput[] = [
        { companyName: { equals: result.companyName, mode: 'insensitive' } },
      ];
      const primaryEmailContact = enrichedContacts.find((c) => c.id === options?.primaryEmailContactId);
      const emailForDup =
        primaryEmailContact?.normalizedValue ??
        result.publicEmail?.toLowerCase() ??
        enrichedContacts.find((c) => c.type === AiSalesContactType.EMAIL)?.normalizedValue;
      if (emailForDup) dupOr.unshift({ email: emailForDup });

      const dup = await this.prisma.aiSalesProspect.findFirst({ where: { OR: dupOr } });
      if (dup) {
        prospectId = dup.id;
        action = 'UPDATED';
      }
    }

    const prospectFields = {
      partnerType: result.partnerType,
      companyName: result.companyName,
      contactName: result.contactName,
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
          ? ('VERIFIED' as const)
          : result.verificationStatus === 'PARTIALLY_VERIFIED'
            ? ('PARTIALLY_VERIFIED' as const)
            : ('UNVERIFIED' as const),
      contactVerificationStatus: result.contactVerificationStatus,
      contactEnrichmentStatus: result.contactEnrichmentStatus,
      lastEnrichmentAt: result.lastEnrichmentAt,
      publicDataCheckedAt: new Date(),
    };

    const sourceConflict = await this.prisma.aiSalesProspect.findFirst({
      where: {
        sourceSearchResultId: result.id,
        ...(prospectId ? { id: { not: prospectId } } : {}),
      },
    });

    const contactPlan = prospectId
      ? await this.publicContacts.buildContactApplyPlan(prepared, prospectId)
      : this.publicContacts.buildContactApplyPlanForNewProspect(prepared);

    return await this.prisma.$transaction(
      async (tx) => {
        let resolvedProspectId = prospectId;

        if (!resolvedProspectId) {
          const created = await tx.aiSalesProspect.create({
            data: {
              ...prospectFields,
              status: AiSalesProspectStatus.NEEDS_REVIEW,
              createdById: userId,
              ...(sourceConflict ? {} : { sourceSearchResultId: result.id }),
            },
          });
          resolvedProspectId = created.id;
        } else {
          await tx.aiSalesProspect.update({
            where: { id: resolvedProspectId },
            data: {
              ...prospectFields,
              ...(sourceConflict ? {} : { sourceSearchResultId: result.id }),
            },
          });
        }

        const transferStats = await this.publicContacts.applyContactApplyPlan(
          tx,
          resolvedProspectId,
          contactPlan,
          options,
        );

        await tx.aiSalesSearchResult.update({
          where: { id: resultId },
          data: { savedProspectId: resolvedProspectId },
        });

        const prospect = await tx.aiSalesProspect.findUnique({
          where: { id: resolvedProspectId },
          include: {
            publicContacts: { orderBy: [{ isPrimary: 'desc' }, { type: 'asc' }, { createdAt: 'asc' }] },
          },
        });
        if (!prospect) throw new NotFoundException('Partner se nepodařilo načíst po uložení.');

        return {
          success: true,
          action,
          prospectId: resolvedProspectId,
          prospect,
          contactsSaved: transferStats.contactsSaved,
          emailsSaved: transferStats.emailsSaved,
          phonesSaved: transferStats.phonesSaved,
          savedContacts: transferStats.contactsSaved,
          primaryEmail: prospect?.primaryEmail ?? prospect?.email ?? null,
          primaryPhone: prospect?.primaryPhone ?? prospect?.phone ?? null,
          redirectUrl: `/admin/marketing/ai-sales?tab=crm&prospectId=${resolvedProspectId}`,
          analysisStatus: 'PENDING' as const,
        };
      },
      { maxWait: 5000, timeout: 15000 },
    );
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
    const settings = await this.settings.getOrCreate();
    await this.syncProviderRegistry();

    const dbProviders = await this.prisma.aiSalesSearchProvider.findMany({ orderBy: { name: 'asc' } });
    const serpConfigured = this.searchEnv.isSerpApiConfigured();
    const bingConfigured = this.searchEnv.isBingSearchConfigured();
    const webConfigured = this.searchEnv.isWebSearchConfigured();
    const activeWeb = this.searchEnv.getActiveWebProvider();

    const serpDb = dbProviders.find((p) => p.key === 'SERPAPI');
    const bingDb = dbProviders.find((p) => p.key === 'BING_WEB_SEARCH');
    const serpEnabled = serpDb?.enabled ?? serpConfigured;
    const bingEnabled = bingDb?.enabled ?? bingConfigured;

    const providers = [
      {
        id: 'INTERNAL_DATABASE',
        enabled: settings.internalDatabaseEnabled,
        configured: true,
        available: settings.internalDatabaseEnabled,
        status: settings.internalDatabaseEnabled ? 'READY' : 'DISABLED',
      },
      {
        id: 'APPROVED_WEB_PROVIDER',
        enabled: webConfigured && (serpEnabled || bingEnabled),
        configured: webConfigured,
        available: webConfigured && (serpEnabled || bingEnabled),
        status: webConfigured ? 'READY' : 'NOT_CONFIGURED',
      },
      {
        id: 'SERPAPI',
        enabled: serpEnabled,
        configured: serpConfigured,
        available: serpConfigured && serpEnabled,
        missingVariable: serpConfigured ? null : 'SERPAPI_API_KEY',
        status: serpConfigured ? (serpEnabled ? 'READY' : 'DISABLED') : 'NOT_CONFIGURED',
      },
      {
        id: 'BING',
        enabled: bingEnabled,
        configured: bingConfigured,
        available: bingConfigured && bingEnabled,
        missingVariable: bingConfigured ? null : 'BING_SEARCH_API_KEY',
        status: bingConfigured ? (bingEnabled ? 'READY' : 'DISABLED') : 'NOT_CONFIGURED',
      },
    ];

    return {
      providers,
      activeWebProvider: activeWeb,
      environment: this.searchEnv.getDeploymentDiagnostics(),
      legacy: dbProviders.map((p) => ({
        ...p,
        configured:
          p.key === 'SERPAPI'
            ? serpConfigured
            : p.key === 'BING_WEB_SEARCH'
              ? bingConfigured
              : p.configured,
        enabled:
          p.key === 'SERPAPI'
            ? serpEnabled
            : p.key === 'BING_WEB_SEARCH'
              ? bingEnabled
              : p.enabled,
        isActiveWebProvider: activeWeb?.key === p.key,
      })),
    };
  }

  private async syncProviderRegistry() {
    const serpConfigured = this.searchEnv.isSerpApiConfigured();
    const bingConfigured = this.searchEnv.isBingSearchConfigured();

    const defaults: Array<{
      id: string;
      key: string;
      name: string;
      providerType: string;
      configured: boolean;
    }> = [
      {
        id: 'internal-db',
        key: 'INTERNAL_DATABASE',
        name: 'Interní databáze XXREALIT',
        providerType: 'INTERNAL_DATABASE',
        configured: true,
      },
      {
        id: 'serpapi',
        key: 'SERPAPI',
        name: 'SerpAPI',
        providerType: 'WEB_SEARCH',
        configured: serpConfigured,
      },
      {
        id: 'bing',
        key: 'BING_WEB_SEARCH',
        name: 'Bing Web Search API',
        providerType: 'WEB_SEARCH',
        configured: bingConfigured,
      },
    ];

    for (const row of defaults) {
      const existing = await this.prisma.aiSalesSearchProvider.findUnique({ where: { key: row.key } });
      await this.prisma.aiSalesSearchProvider.upsert({
        where: { key: row.key },
        create: {
          id: row.id,
          key: row.key,
          name: row.name,
          providerType: row.providerType,
          configured: row.configured,
          enabled: existing?.enabled ?? row.configured,
          lastCheckedAt: new Date(),
        },
        update: {
          configured: row.configured,
          enabled: existing ? existing.enabled || row.configured : row.configured,
          lastCheckedAt: new Date(),
          lastErrorCode: row.configured ? null : 'NOT_CONFIGURED',
          lastErrorMessage: row.configured
            ? null
            : row.key === 'SERPAPI'
              ? 'Chybí SERPAPI_API_KEY'
              : row.key === 'BING_WEB_SEARCH'
                ? 'Chybí BING_SEARCH_API_KEY'
                : null,
        },
      });
    }
  }

  async testProvider(providerKey: string) {
    const started = Date.now();

    if (providerKey === 'SERPAPI') {
      const result = await runSerpApiTest(this.searchEnv);
      await this.prisma.aiSalesSettings.update({
        where: { id: 'default' },
        data: { lastProviderTestAt: new Date(), lastProviderTestSuccess: true, lastSearchErrorCode: null },
      });
      await this.prisma.aiSalesSearchProvider.updateMany({
        where: { key: 'SERPAPI' },
        data: { configured: true, lastCheckedAt: new Date(), lastErrorCode: null, lastErrorMessage: null },
      });
      return result;
    }

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

    if (providerKey === 'BING' || providerKey === 'BING_WEB_SEARCH' || providerKey === 'APPROVED_WEB_PROVIDER') {
      if (!this.searchEnv.isBingSearchConfigured() && providerKey !== 'APPROVED_WEB_PROVIDER') {
        throw new BadRequestException('Bing není nakonfigurován. Nastavte BING_SEARCH_API_KEY.');
      }
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
        configured: true,
        count: items.length,
        resultCount: items.length,
        durationMs: Date.now() - started,
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
