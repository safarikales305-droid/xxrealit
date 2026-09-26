import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AiPropertyFinderEventName } from '@prisma/client';
import { AiPropertyFinderRateLimiter } from './ai-property-finder-rate-limit.util';
import { PrismaService } from '../../database/prisma.service';
import {
  buildSearchCacheKey,
  dedupePropertyResults,
  filterResultsWithRequiredUrl,
} from './ai-property-finder-dedupe.util';
import { AiPropertyFinderQueryParserService } from './ai-property-finder-query-parser.service';
import { applyRanking } from './ai-property-finder-ranking.util';
import {
  buildContextualPrompt,
  buildSeoPageSearchContext,
  criteriaSummaryLines,
} from './ai-property-finder-seo-context.util';
import { AiPropertyFinderSettingsService } from './ai-property-finder-settings.service';
import type {
  ParsedPropertySearchCriteria,
  PropertySearchResponse,
  PropertySearchResult,
  SeoPageSearchContext,
} from './ai-property-finder.types';
import { SearchEnginePropertyProvider } from './providers/search-engine-property.provider';
import { XxRealitPropertyProvider } from './providers/xxrealit-property.provider';

type CacheEntry = { expiresAt: number; results: PropertySearchResponse };

@Injectable()
export class AiPropertyFinderService {
  private readonly log = new Logger(AiPropertyFinderService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private readonly searchRateLimiter = new AiPropertyFinderRateLimiter();

  private static validateEmail(email: string): string {
    const normalized = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || normalized.length > 254) {
      throw new BadRequestException('Neplatný e-mail.');
    }
    return normalized;
  }

  assertSearchRateLimit(clientKey: string): void {
    try {
      this.searchRateLimiter.assertAllowed(`search:${clientKey}`, 12, 60_000);
    } catch {
      throw new HttpException('Příliš mnoho vyhledávání — zkuste to za chvíli.', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AiPropertyFinderSettingsService,
    private readonly parser: AiPropertyFinderQueryParserService,
    private readonly xxrealit: XxRealitPropertyProvider,
    private readonly searchEngine: SearchEnginePropertyProvider,
  ) {}

  async getPublicConfig() {
    const cfg = await this.settings.getSettings();
    return {
      ...this.settings.getPublicConfig(cfg),
      contextualPrompt: null as string | null,
      searchProviderConfigured: this.searchEngine.isConfigured(),
    };
  }

  buildSeoContext(input: {
    intentSlug: string;
    locationSlug: string;
    locationName: string;
    intentLabel: string;
    path: string;
  }): SeoPageSearchContext | null {
    return buildSeoPageSearchContext(input);
  }

  async createSession(input: {
    visitorId?: string;
    sourcePage?: string;
    seoContext?: SeoPageSearchContext | null;
  }) {
    const row = await this.prisma.aiPropertySearchSession.create({
      data: {
        visitorId: input.visitorId?.slice(0, 120),
        sourcePage: input.sourcePage?.slice(0, 500),
        sourceSeoIntent: input.seoContext?.intentSlug,
        sourceSeoLocation: input.seoContext?.locationSlug,
      },
    });
    return {
      sessionId: row.id,
      leadEmailCaptured: false,
      contextualPrompt: buildContextualPrompt(input.seoContext ?? null),
    };
  }

  async getSessionPublic(sessionId: string) {
    const row = await this.prisma.aiPropertySearchSession.findUnique({ where: { id: sessionId } });
    if (!row) throw new NotFoundException('Relace nenalezena.');
    return {
      sessionId: row.id,
      leadEmailCaptured: Boolean(row.leadEmail),
      resultsCount: row.resultsCount,
    };
  }

  async parseQueryOnly(input: {
    query: string;
    seoContext?: SeoPageSearchContext | null;
    previousCriteria?: ParsedPropertySearchCriteria | null;
  }) {
    const parsed = await this.parser.parse({
      query: input.query,
      seoContext: input.seoContext,
      previousCriteria: input.previousCriteria ?? undefined,
    });
    return {
      criteria: parsed.criteria,
      criteriaSummary: criteriaSummaryLines(parsed.criteria),
      clarifyingQuestion: parsed.clarifyingQuestion,
    };
  }

  async captureLead(input: {
    sessionId: string;
    email: string;
    query: string;
    marketingConsent?: boolean;
    visitorId?: string;
    seoContext?: SeoPageSearchContext | null;
    clientKey?: string;
  }) {
    this.assertSearchRateLimit(input.clientKey ?? input.sessionId);
    const email = AiPropertyFinderService.validateEmail(input.email);
    const session = await this.prisma.aiPropertySearchSession.findUnique({ where: { id: input.sessionId } });
    if (!session) throw new BadRequestException('Relace vypršela — obnovte stránku.');

    const parsed = await this.parser.parse({
      query: input.query,
      seoContext: input.seoContext,
      previousCriteria: (session.parsedCriteriaJson ?? null) as ParsedPropertySearchCriteria | null,
    });

    const marketingConsent = input.marketingConsent === true;
    const sameEmail = session.leadEmail === email;
    let leadId: string | null = null;

    if (!sameEmail) {
      const lead = await this.prisma.aiPropertyFinderLead.create({
        data: {
          email,
          status: 'NEW',
          initialQuery: input.query.slice(0, 4000),
          parsedCriteriaJson: parsed.criteria as object,
          locationLabel: parsed.criteria.location ?? input.seoContext?.locationName ?? null,
          budgetMax: parsed.criteria.priceMax ?? null,
          propertyTypeLabel: parsed.criteria.propertyType ?? input.seoContext?.propertyTypeLabel ?? null,
          sourcePage: input.seoContext?.path ?? session.sourcePage,
          sourcePageUrl: input.seoContext?.path ? `https://www.xxrealit.cz${input.seoContext.path}` : null,
          sourceSeoIntent: input.seoContext?.intentSlug ?? session.sourceSeoIntent,
          sourceSeoLocation: input.seoContext?.locationSlug ?? session.sourceSeoLocation,
          marketingConsent,
          visitorId: input.visitorId?.slice(0, 120),
          sessionId: session.id,
        },
      });
      leadId = lead.id;
    }

    await this.prisma.aiPropertySearchSession.update({
      where: { id: session.id },
      data: {
        leadEmail: email,
        leadMarketingConsent: marketingConsent,
        leadCapturedAt: session.leadCapturedAt ?? new Date(),
        pendingQuery: input.query.slice(0, 4000),
        parsedCriteriaJson: parsed.criteria as object,
        lastActivityAt: new Date(),
      },
    });

    return {
      ok: true,
      leadId,
      leadCreated: !sameEmail,
      sessionId: session.id,
      criteria: parsed.criteria,
      criteriaSummary: criteriaSummaryLines(parsed.criteria),
    };
  }

  async search(input: {
    sessionId?: string;
    visitorId?: string;
    query: string;
    seoContext?: SeoPageSearchContext | null;
    previousCriteria?: ParsedPropertySearchCriteria | null;
    clientKey?: string;
    skipLeadGate?: boolean;
  }): Promise<PropertySearchResponse> {
    this.assertSearchRateLimit(input.clientKey ?? input.visitorId ?? input.sessionId ?? 'anon');
    const cfg = await this.settings.getSettings();
    const parsed = await this.parser.parse({
      query: input.query,
      seoContext: input.seoContext,
      previousCriteria: input.previousCriteria ?? undefined,
    });

    let sessionId = input.sessionId;
    if (!sessionId) {
      const created = await this.createSession({
        visitorId: input.visitorId,
        sourcePage: input.seoContext?.path,
        seoContext: input.seoContext,
      });
      sessionId = created.sessionId;
    }
    const activeSessionId = sessionId;

    const sessionRow = await this.prisma.aiPropertySearchSession.findUnique({ where: { id: activeSessionId } });
    if (!sessionRow) throw new BadRequestException('Relace vypršela — obnovte stránku.');
    if (!input.skipLeadGate && !sessionRow.leadEmail) {
      throw new ForbiddenException('Pro spuštění hledání je potřeba e-mail.');
    }

    const cacheKey = buildSearchCacheKey({ ...parsed.criteria, sessionId: activeSessionId.slice(0, 8) });
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return { ...cached.results, sessionId: activeSessionId };
    }

    const internalRaw = await this.xxrealit.search({ criteria: parsed.criteria, limit: 30 });
    let externalRaw: typeof internalRaw = [];
    if (cfg.externalDiscoveryEnabled) {
      try {
        externalRaw = await this.searchEngine.search({ criteria: parsed.criteria, limit: 6 });
      } catch (err) {
        this.log.warn(`External discovery skipped: ${err instanceof Error ? err.message : err}`);
      }
    }

    const merged = filterResultsWithRequiredUrl(
      dedupePropertyResults(
        applyRanking([...internalRaw, ...externalRaw], parsed.criteria, cfg.minMatchScore),
      ),
    );

    const internalCount = merged.filter((r) => r.isInternal).length;
    const externalCount = merged.filter((r) => r.isExternal).length;

    const expandSuggestions =
      merged.length < 3 && parsed.criteria.priceMax
        ? [
            {
              id: 'radius',
              label: 'ANO, +20 KM',
              patch: { radiusKm: (parsed.criteria.radiusKm ?? 0) + 20 },
            },
            {
              id: 'price',
              label: 'ZVÝŠIT CENU',
              patch: { priceMax: Math.round((parsed.criteria.priceMax ?? 0) * 1.15) },
            },
          ]
        : undefined;

    const response: PropertySearchResponse = {
      sessionId: activeSessionId,
      criteria: parsed.criteria,
      criteriaSummary: criteriaSummaryLines(parsed.criteria),
      results: merged,
      internalCount,
      externalCount,
      clarifyingQuestion: parsed.clarifyingQuestion,
      expandSuggestions,
      externalDiscoveryConfigured: this.searchEngine.isConfigured(),
      message:
        merged.length > 0
          ? `Našel jsem ${merged.length} aktuálních nabídek odpovídajících vašemu zadání.`
          : parsed.criteria.priceMax && parsed.criteria.location
            ? `Do zadané ceny jsem našel jen málo vhodných nemovitostí. Zkuste rozšířit okolí nebo upravit rozpočet.`
            : 'Zkuste upřesnit lokalitu nebo rozpočet.',
    };

    this.cache.set(cacheKey, {
      expiresAt: Date.now() + cfg.cacheTtlMinutes * 60 * 1000,
      results: response,
    });

    await this.prisma.aiPropertySearchSession.update({
      where: { id: activeSessionId },
      data: {
        initialQuery: input.query.slice(0, 4000),
        parsedCriteriaJson: parsed.criteria as object,
        lastResultsJson: merged as unknown as object,
        pendingQuery: null,
        resultsCount: merged.length,
        lastActivityAt: new Date(),
      },
    });

    if (sessionRow.leadEmail) {
      await this.prisma.aiPropertyFinderLead.updateMany({
        where: { sessionId: activeSessionId, email: sessionRow.leadEmail },
        data: { resultsCount: merged.length, updatedAt: new Date() },
      });
    }

    return response;
  }

  async getResultDetail(sessionId: string, resultId: string) {
    const session = await this.prisma.aiPropertySearchSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Relace nenalezena.');
    const results = (session.lastResultsJson ?? []) as PropertySearchResult[];
    const row = results.find((r) => r.id === resultId);
    if (!row) throw new NotFoundException('Nabídka není v aktuálních výsledcích.');

    if (row.isInternal && row.id.startsWith('xxr:')) {
      const propertyId = row.id.slice(4);
      try {
        const detail = await this.xxrealit.getPublicDetail(propertyId);
        return { result: row, detail };
      } catch {
        return { result: row, detail: null };
      }
    }
    return { result: row, detail: null };
  }

  async refine(input: {
    sessionId: string;
    message: string;
    seoContext?: SeoPageSearchContext | null;
    clientKey?: string;
  }) {
    const session = await this.prisma.aiPropertySearchSession.findUnique({ where: { id: input.sessionId } });
    if (!session) throw new BadRequestException('Relace vypršela — spusťte nové hledání.');
    const previous = (session.parsedCriteriaJson ?? null) as ParsedPropertySearchCriteria | null;
    return this.search({
      sessionId: input.sessionId,
      query: input.message,
      seoContext: input.seoContext,
      previousCriteria: previous,
      clientKey: input.clientKey,
    });
  }

  async createWatch(input: {
    email: string;
    consent: boolean;
    sessionId?: string;
    criteria: ParsedPropertySearchCriteria;
  }) {
    if (!input.consent) throw new BadRequestException('Je vyžadován souhlas s marketingovými upozorněními.');
    const email = AiPropertyFinderService.validateEmail(input.email);
    const row = await this.prisma.aiPropertySearchWatch.create({
      data: {
        email,
        consent: true,
        notificationEnabled: true,
        criteriaJson: input.criteria as object,
        sourceSessionId: input.sessionId,
      },
    });
    return { id: row.id, ok: true };
  }

  async trackEvent(input: {
    eventName: AiPropertyFinderEventName;
    visitorId?: string;
    sessionId?: string;
    meta?: Record<string, unknown>;
  }) {
    try {
      await this.prisma.aiPropertyFinderEvent.create({
        data: {
          eventName: input.eventName,
          visitorId: input.visitorId?.slice(0, 120),
          sessionId: input.sessionId?.slice(0, 120),
          meta: input.meta as object | undefined,
        },
      });
    } catch (err) {
      this.log.warn(`Event track failed: ${err instanceof Error ? err.message : err}`);
    }
    return { ok: true };
  }

  async getAdminStats(days = 30) {
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const counts = await this.prisma.aiPropertyFinderEvent.groupBy({
      by: ['eventName'],
      where: { createdAt: { gte: from } },
      _count: { _all: true },
    });
    const map = Object.fromEntries(
      counts.map((c: { eventName: string; _count: { _all: number } }) => [c.eventName, c._count._all]),
    );
    const shown = map.AI_FINDER_SHOWN ?? 0;
    const opened = map.AI_PROPERTY_FINDER_OPEN ?? map.AI_FINDER_OPENED ?? 0;
    const searches =
      (map.AI_PROPERTY_FINDER_RESULTS ?? 0) +
      (map.AI_SEARCH_COMPLETED ?? 0) +
      (map.AI_PROPERTY_FINDER_SEARCH_STARTED ?? 0);
    const clicks = (map.AI_RESULT_CLICKED ?? 0) + (map.AI_EXTERNAL_RESULT_CLICKED ?? 0);
    const watches = map.AI_WATCH_CREATED ?? 0;
    const leads = map.AI_PROPERTY_FINDER_LEAD_CREATED ?? 0;
    return {
      days,
      shown,
      opened,
      searches,
      clicks,
      watches,
      leads,
      conversionRate: shown > 0 ? Math.round((searches / shown) * 1000) / 10 : 0,
      clickRate: searches > 0 ? Math.round((clicks / searches) * 1000) / 10 : 0,
      events: map,
    };
  }

  async listAdminLeads(limit = 50) {
    const take = Math.min(100, Math.max(1, limit));
    const items = await this.prisma.aiPropertyFinderLead.findMany({
      orderBy: { createdAt: 'desc' },
      take,
    });
    return { items };
  }

  getProviderStatuses() {
    return [
      {
        id: 'xxrealit',
        name: 'XXREALIT',
        active: true,
        configured: this.xxrealit.isConfigured(),
      },
      {
        id: 'search_engine',
        name: 'Search provider (SERP/Bing)',
        active: true,
        configured: this.searchEngine.isConfigured(),
        envHint: 'SERPAPI_API_KEY nebo BING_SEARCH_API_KEY',
      },
    ];
  }
}
