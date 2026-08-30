import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NewsSourceType, Prisma, YoutubeSourceSuggestionStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { NewsSourceService } from './news-source.service';
import { NewsYoutubeService } from './news-youtube.service';
import { scoreNewsRelevance } from './news-editorial.util';
import {
  DEFAULT_YOUTUBE_DISCOVERY_SETTINGS,
  pickDiscoveryQueries,
  YOUTUBE_DISCOVERY_SETTINGS_KEY,
  type YoutubeDiscoveryRunDiagnostics,
  type YoutubeDiscoverySettings,
} from './news-youtube-discovery.constants';
import {
  fetchYoutubeChannelsByIds,
  getYouTubeApiKey,
  searchYoutubeDiscoveryChannelIds,
  type YoutubeChannelCandidate,
} from './news-youtube-api.util';

const REJECTED_RESHOW_DAYS = 90;
const HARD_REJECT_SCORE = 40;

const CZ_SK_HINTS =
  /\b(česko|česk|čr|slovensko|slovensk|praha|brno|ostrava|plzeň|plzen|liberec|olomouc|hradec|pardubice|zlín|zlin|byst|reality|nemovitost|byt|dům|dom)\b/i;

const OFF_TOPIC_PENALTY =
  /\b(gaming|fortnite|minecraft|roblox|hudba|music video|makeup|fitness|workout|kids|dětsk|politik|football|fotbal|nba|crypto|bitcoin)\b/i;

export type DiscoveryListParams = {
  status?: YoutubeSourceSuggestionStatus;
  categoryId?: string;
  categorySlug?: string;
  minScore?: number;
  search?: string;
  sort?: 'score' | 'newest' | 'activity' | 'videos';
  page?: number;
  pageSize?: number;
};

@Injectable()
export class NewsYoutubeDiscoveryService {
  private readonly log = new Logger(NewsYoutubeDiscoveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sources: NewsSourceService,
    private readonly youtube: NewsYoutubeService,
  ) {}

  async getSettings(): Promise<YoutubeDiscoverySettings> {
    const row = await this.prisma.appSetting.findUnique({
      where: { key: YOUTUBE_DISCOVERY_SETTINGS_KEY },
    });
    const raw = (row?.valueJson ?? {}) as Partial<YoutubeDiscoverySettings>;
    return { ...DEFAULT_YOUTUBE_DISCOVERY_SETTINGS, ...raw };
  }

  async updateSettings(patch: Partial<YoutubeDiscoverySettings>) {
    const current = await this.getSettings();
    const next = { ...current, ...patch };
    await this.prisma.appSetting.upsert({
      where: { key: YOUTUBE_DISCOVERY_SETTINGS_KEY },
      create: { key: YOUTUBE_DISCOVERY_SETTINGS_KEY, valueJson: next },
      update: { valueJson: next },
    });
    return next;
  }

  async listSuggestions(params: DiscoveryListParams = {}) {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 30));
    const where: Prisma.YouTubeSourceSuggestionWhereInput = {};

    if (params.status) where.status = params.status;
    if (params.categoryId) where.categoryId = params.categoryId;
    if (params.categorySlug) {
      where.category = { slug: params.categorySlug };
    }
    if (params.minScore != null) {
      where.relevanceScore = { gte: Math.trunc(params.minScore) };
    }
    if (params.search?.trim()) {
      const q = params.search.trim();
      where.OR = [
        { channelTitle: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ];
    }

    const orderBy: Prisma.YouTubeSourceSuggestionOrderByWithRelationInput[] =
      params.sort === 'newest'
        ? [{ createdAt: 'desc' }]
        : params.sort === 'activity'
          ? [{ lastVideoAt: 'desc' }, { relevanceScore: 'desc' }]
          : params.sort === 'videos'
            ? [{ videoCount: 'desc' }, { relevanceScore: 'desc' }]
            : [{ relevanceScore: 'desc' }, { createdAt: 'desc' }];

    const [items, total] = await Promise.all([
      this.prisma.youTubeSourceSuggestion.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { category: { select: { id: true, slug: true, label: true } } },
      }),
      this.prisma.youTubeSourceSuggestion.count({ where }),
    ]);

    return { items, total, page, pageSize, hasMore: page * pageSize < total };
  }

  async getDiscoveryStats() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      total,
      pending,
      approved,
      rejected,
      foundToday,
      approvedWeek,
      lastRun,
      settings,
    ] = await Promise.all([
      this.prisma.youTubeSourceSuggestion.count(),
      this.prisma.youTubeSourceSuggestion.count({ where: { status: 'PENDING' } }),
      this.prisma.youTubeSourceSuggestion.count({ where: { status: 'APPROVED' } }),
      this.prisma.youTubeSourceSuggestion.count({ where: { status: 'REJECTED' } }),
      this.prisma.youTubeSourceSuggestion.count({
        where: { createdAt: { gte: todayStart } },
      }),
      this.prisma.youTubeSourceSuggestion.count({
        where: { status: 'APPROVED', approvedAt: { gte: weekAgo } },
      }),
      this.prisma.youTubeDiscoveryRun.findFirst({
        orderBy: { startedAt: 'desc' },
      }),
      this.getSettings(),
    ]);

    return {
      total,
      pending,
      approved,
      rejected,
      foundToday,
      approvedWeek,
      discoveryEnabled: settings.enabled,
      lastRunAt: settings.lastRunAt,
      lastRun,
    };
  }

  async listDiscoveryHistory(limit = 20) {
    return this.prisma.youTubeDiscoveryRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: Math.min(50, limit),
    });
  }

  shouldRunDiscovery(settings: YoutubeDiscoverySettings): boolean {
    if (!settings.enabled || !getYouTubeApiKey()) return false;
    if (!settings.lastRunAt) return true;
    const last = new Date(settings.lastRunAt).getTime();
    const elapsedHours = (Date.now() - last) / (60 * 60 * 1000);
    if (settings.frequency === 'daily') return elapsedHours >= 20;
    if (settings.frequency === 'three_per_week') return elapsedHours >= 56;
    return elapsedHours >= 160;
  }

  async runDiscoveryIfDue() {
    const settings = await this.getSettings();
    if (!this.shouldRunDiscovery(settings)) return { skipped: true };
    return this.runDiscovery({ triggeredBy: 'scheduler' });
  }

  async runDiscovery(opts?: { categorySlug?: string; triggeredBy?: string }) {
    const settings = await this.getSettings();
    if (!getYouTubeApiKey()) {
      return { ok: false, error: 'YOUTUBE_API_KEY missing' };
    }

    const run = await this.prisma.youTubeDiscoveryRun.create({
      data: {
        triggeredBy: opts?.triggeredBy ?? 'admin',
        categorySlug: opts?.categorySlug ?? null,
      },
    });

    const diagnostics: YoutubeDiscoveryRunDiagnostics = {
      queriesExecuted: 0,
      rawResults: 0,
      uniqueChannelIds: 0,
      existingSources: 0,
      existingCandidates: 0,
      rejectedByRelevance: 0,
      duplicates: 0,
      newCandidates: 0,
      errors: 0,
      searchRequests: 0,
      pendingInDb: 0,
    };

    try {
      const result = await this.executeDiscovery(settings, diagnostics, opts?.categorySlug);
      diagnostics.pendingInDb = await this.prisma.youTubeSourceSuggestion.count({
        where: { status: 'PENDING' },
      });

      await this.prisma.youTubeDiscoveryRun.update({
        where: { id: run.id },
        data: {
          finishedAt: new Date(),
          queriesCount: diagnostics.queriesExecuted,
          rawResults: diagnostics.rawResults,
          uniqueChannels: diagnostics.uniqueChannelIds,
          existingSources: diagnostics.existingSources,
          existingCandidates: diagnostics.existingCandidates,
          belowThreshold: diagnostics.rejectedByRelevance,
          duplicates: diagnostics.duplicates,
          newCandidates: diagnostics.newCandidates,
          errors: diagnostics.errors,
          searchRequests: diagnostics.searchRequests,
          diagnosticsJson: diagnostics as object,
        },
      });

      const nextRotation =
        (settings.queryRotationIndex + result.queriesUsed) %
        Math.max(1, result.maxQueryBankSize);
      await this.updateSettings({
        lastRunAt: new Date().toISOString(),
        queryRotationIndex: nextRotation,
      });

      this.logComplete(diagnostics);

      return {
        ok: true,
        created: diagnostics.newCandidates,
        diagnostics,
        runId: run.id,
      };
    } catch (err) {
      diagnostics.errors += 1;
      await this.prisma.youTubeDiscoveryRun.update({
        where: { id: run.id },
        data: {
          finishedAt: new Date(),
          errors: 1,
          diagnosticsJson: {
            ...diagnostics,
            error: err instanceof Error ? err.message : String(err),
          },
        },
      });
      throw err;
    }
  }

  private async executeDiscovery(
    settings: YoutubeDiscoverySettings,
    diagnostics: YoutubeDiscoveryRunDiagnostics,
    onlyCategorySlug?: string,
  ) {
    let allCategories = await this.prisma.contentSourceCategory.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
    });

    if (onlyCategorySlug) {
      allCategories = allCategories.filter((c) => c.slug === onlyCategorySlug);
    } else if (settings.categoriesPerScheduledRun > 0) {
      const n = settings.categoriesPerScheduledRun;
      const start = settings.queryRotationIndex % allCategories.length;
      const picked: typeof allCategories = [];
      for (let i = 0; i < allCategories.length && picked.length < n; i++) {
        picked.push(allCategories[(start + i) % allCategories.length]!);
      }
      allCategories = picked;
    }

    const activeChannelIds = new Set(
      (
        await this.prisma.newsSource.findMany({
          where: { type: NewsSourceType.YOUTUBE_CHANNEL, channelId: { not: null } },
          select: { channelId: true },
        })
      )
        .map((s) => s.channelId)
        .filter((id): id is string => Boolean(id)),
    );

    const existingSuggestions = await this.prisma.youTubeSourceSuggestion.findMany({
      select: { channelId: true, categoryId: true, status: true, rejectedAt: true, updatedAt: true },
    });

    let queriesUsed = 0;
    let maxQueryBankSize = 1;
    let totalNewThisRun = 0;

    for (const category of allCategories) {
      if (totalNewThisRun >= settings.maxCandidatesPerRun) break;
      if (diagnostics.searchRequests >= settings.maxSearchRequestsPerRun) break;

      const queries = pickDiscoveryQueries(
        category.slug,
        settings.maxQueriesPerCategoryPerRun,
        settings.queryRotationIndex + queriesUsed,
      );
      maxQueryBankSize = Math.max(maxQueryBankSize, queries.length);
      const categoryChannelMap = new Map<
        string,
        { score: number; reason: string; query: string }
      >();

      for (const query of queries) {
        if (diagnostics.searchRequests >= settings.maxSearchRequestsPerRun) break;
        diagnostics.queriesExecuted += 1;
        queriesUsed += 1;

        try {
          const search = await searchYoutubeDiscoveryChannelIds(query, {
            maxPages: settings.maxPagesPerQuery,
            maxResultsPerPage: settings.maxResultsPerPage,
          });
          diagnostics.searchRequests += search.searchRequests;
          diagnostics.rawResults += search.rawResultCount;

          this.log.debug(
            `[YOUTUBE-DISCOVERY] category=${category.slug} query="${query}" results=${search.rawResultCount} channelIds=${search.channelIds.length}`,
          );

          if (!search.channelIds.length) continue;

          const channels = await fetchYoutubeChannelsByIds(search.channelIds);
          for (const ch of channels) {
            if (activeChannelIds.has(ch.channelId)) {
              diagnostics.existingSources += 1;
              continue;
            }
            const score = this.scoreChannel(ch, category.label, query);
            if (score < HARD_REJECT_SCORE) {
              diagnostics.rejectedByRelevance += 1;
              continue;
            }
            const prev = categoryChannelMap.get(ch.channelId);
            if (!prev || score > prev.score) {
              categoryChannelMap.set(ch.channelId, {
                score,
                reason: `Shoda s „${query}" (${category.label})`,
                query,
              });
            }
          }
        } catch (err) {
          diagnostics.errors += 1;
          this.log.warn(
            `[YOUTUBE-DISCOVERY] search failed category=${category.slug} query="${query}": ${err instanceof Error ? err.message : err}`,
          );
        }
      }

      diagnostics.uniqueChannelIds += categoryChannelMap.size;

      const ranked = [...categoryChannelMap.entries()]
        .map(([channelId, meta]) => ({ channelId, ...meta }))
        .filter((x) => x.score >= settings.minRelevanceScore)
        .sort((a, b) => b.score - a.score)
        .slice(0, settings.maxSuggestionsPerCategory);

      diagnostics.rejectedByRelevance += categoryChannelMap.size - ranked.length;

      if (!ranked.length) continue;

      const channelMeta = await fetchYoutubeChannelsByIds(ranked.map((r) => r.channelId));
      const metaById = new Map(channelMeta.map((c) => [c.channelId, c]));

      for (const row of ranked) {
        if (totalNewThisRun >= settings.maxCandidatesPerRun) break;

        const skip = this.shouldSkipCandidate(
          row.channelId,
          category.id,
          activeChannelIds,
          existingSuggestions,
        );
        if (skip === 'duplicate') {
          diagnostics.duplicates += 1;
          continue;
        }
        if (skip === 'existing_candidate') {
          diagnostics.existingCandidates += 1;
          continue;
        }

        const ch = metaById.get(row.channelId);
        if (!ch) continue;

        try {
          const existing = await this.prisma.youTubeSourceSuggestion.findUnique({
            where: { channelId_categoryId: { channelId: row.channelId, categoryId: category.id } },
          });
          const isNew = !existing;

          await this.prisma.youTubeSourceSuggestion.upsert({
            where: { channelId_categoryId: { channelId: row.channelId, categoryId: category.id } },
            create: {
              channelId: row.channelId,
              channelTitle: ch.channelTitle,
              channelUrl: ch.channelUrl,
              thumbnailUrl: ch.thumbnailUrl,
              description: ch.description,
              categoryId: category.id,
              subscriberCount: ch.subscriberCount,
              videoCount: ch.videoCount,
              lastVideoAt: ch.lastVideoAt,
              relevanceScore: row.score,
              reason: row.reason,
              status: 'PENDING',
              suggestedBy: 'ai_discovery',
            },
            update: {
              channelTitle: ch.channelTitle,
              channelUrl: ch.channelUrl,
              thumbnailUrl: ch.thumbnailUrl,
              description: ch.description,
              subscriberCount: ch.subscriberCount,
              videoCount: ch.videoCount,
              lastVideoAt: ch.lastVideoAt,
              relevanceScore: row.score,
              reason: row.reason,
              ...(existing?.status === 'REJECTED' || existing?.status === 'IGNORED'
                ? { status: 'PENDING' as const }
                : {}),
            },
          });

          if (isNew) {
            diagnostics.newCandidates += 1;
            totalNewThisRun += 1;
          }
        } catch (err) {
          diagnostics.errors += 1;
          this.log.warn(
            `[YOUTUBE-DISCOVERY] upsert failed channelId=${row.channelId}: ${err instanceof Error ? err.message : err}`,
          );
        }
      }
    }

    return { queriesUsed, maxQueryBankSize };
  }

  scoreChannel(ch: YoutubeChannelCandidate, categoryLabel: string, query: string): number {
    const text = `${ch.channelTitle} ${ch.description ?? ''} ${query} ${categoryLabel}`;
    let score = scoreNewsRelevance(ch.channelTitle, `${ch.description ?? ''} ${query} ${categoryLabel}`);

    if (CZ_SK_HINTS.test(text)) score += 12;
    if ((ch.videoCount ?? 0) >= 5) score += 4;
    if ((ch.videoCount ?? 0) >= 20) score += 3;
    if ((ch.subscriberCount ?? 0) >= 100) score += 2;
    if (OFF_TOPIC_PENALTY.test(text)) score -= 35;

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  private shouldSkipCandidate(
    channelId: string,
    categoryId: string,
    activeChannelIds: Set<string>,
    existingSuggestions: Array<{
      channelId: string;
      categoryId: string;
      status: string;
      rejectedAt: Date | null;
      updatedAt: Date;
    }>,
  ): 'ok' | 'duplicate' | 'existing_candidate' {
    if (activeChannelIds.has(channelId)) return 'duplicate';

    const row = existingSuggestions.find(
      (s) => s.channelId === channelId && s.categoryId === categoryId,
    );
    if (!row) return 'ok';

    if (row.status === 'APPROVED') return 'duplicate';
    if (row.status === 'PENDING') return 'existing_candidate';
    if (row.status === 'REJECTED' || row.status === 'IGNORED') {
      const rejectedAt = row.rejectedAt?.getTime() ?? row.updatedAt.getTime();
      const days = (Date.now() - rejectedAt) / (24 * 60 * 60 * 1000);
      if (days < REJECTED_RESHOW_DAYS) return 'duplicate';
    }
    return 'ok';
  }

  private logComplete(d: YoutubeDiscoveryRunDiagnostics) {
    this.log.log(
      `[YOUTUBE-DISCOVERY] COMPLETE queries=${d.queriesExecuted} rawResults=${d.rawResults} uniqueChannels=${d.uniqueChannelIds} existingSources=${d.existingSources} existingCandidates=${d.existingCandidates} belowThreshold=${d.rejectedByRelevance} duplicates=${d.duplicates} created=${d.newCandidates} searchRequests=${d.searchRequests} pendingInDb=${d.pendingInDb}`,
    );
  }

  async approveSuggestion(id: string, adminUserId: string, categoryId?: string) {
    const suggestion = await this.prisma.youTubeSourceSuggestion.findUnique({
      where: { id },
      include: { category: true },
    });
    if (!suggestion) throw new NotFoundException('Návrh nenalezen.');
    if (suggestion.status !== 'PENDING') {
      throw new Error('Návrh již byl zpracován.');
    }

    const finalCategoryId = categoryId ?? suggestion.categoryId;
    const source = await this.sources.create({
      name: suggestion.channelTitle,
      url: suggestion.channelUrl,
      type: NewsSourceType.YOUTUBE_CHANNEL,
      enabled: true,
      channelId: suggestion.channelId,
      youtubeCreatePost: true,
      contentCategoryId: finalCategoryId,
      youtubeAutoImport: true,
      youtubePublishToShorts: true,
    });

    void this.youtube.importMostRelevantRecent(source.id, 10, 25).catch((err) => {
      this.log.warn(`Post-approval import failed: ${err instanceof Error ? err.message : err}`);
    });

    await this.prisma.youTubeSourceSuggestion.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedBy: adminUserId,
        approvedAt: new Date(),
        categoryId: finalCategoryId,
        createdSourceId: source.id,
      },
    });

    return { suggestion, source };
  }

  async approveSuggestions(ids: string[], adminUserId: string) {
    const results: Array<{ id: string; ok: boolean; error?: string }> = [];
    for (const id of ids) {
      try {
        await this.approveSuggestion(id, adminUserId);
        results.push({ id, ok: true });
      } catch (err) {
        results.push({
          id,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return results;
  }

  async rejectSuggestion(id: string, adminUserId: string) {
    const suggestion = await this.prisma.youTubeSourceSuggestion.findUnique({ where: { id } });
    if (!suggestion) throw new NotFoundException('Návrh nenalezen.');
    return this.prisma.youTubeSourceSuggestion.update({
      where: { id },
      data: {
        status: 'REJECTED',
        rejectedBy: adminUserId,
        rejectedAt: new Date(),
      },
    });
  }

  async patchSuggestionCategory(id: string, categoryId: string) {
    return this.prisma.youTubeSourceSuggestion.update({
      where: { id },
      data: { categoryId },
      include: { category: true },
    });
  }
}
