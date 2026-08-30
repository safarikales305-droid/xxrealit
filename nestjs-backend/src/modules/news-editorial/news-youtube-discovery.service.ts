import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NewsSourceType, YoutubeSourceSuggestionStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { NewsSourceService } from './news-source.service';
import { NewsYoutubeService } from './news-youtube.service';
import { scoreNewsRelevance } from './news-editorial.util';
import {
  DEFAULT_YOUTUBE_DISCOVERY_SETTINGS,
  YOUTUBE_DISCOVERY_QUERIES,
  YOUTUBE_DISCOVERY_SETTINGS_KEY,
  type YoutubeDiscoverySettings,
} from './news-youtube-discovery.constants';
import { getYouTubeApiKey, searchYoutubeChannels } from './news-youtube-api.util';

const REJECTED_RESHOW_DAYS = 90;

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

  async listSuggestions(status?: YoutubeSourceSuggestionStatus) {
    return this.prisma.youTubeSourceSuggestion.findMany({
      where: status ? { status } : undefined,
      orderBy: [{ status: 'asc' }, { relevanceScore: 'desc' }, { createdAt: 'desc' }],
      include: { category: { select: { id: true, slug: true, label: true } } },
      take: 200,
    });
  }

  async getDiscoveryStats() {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [pending, approvedWeek, rejected, approvedTotal] = await Promise.all([
      this.prisma.youTubeSourceSuggestion.count({ where: { status: 'PENDING' } }),
      this.prisma.youTubeSourceSuggestion.count({
        where: { status: 'APPROVED', approvedAt: { gte: weekAgo } },
      }),
      this.prisma.youTubeSourceSuggestion.count({ where: { status: 'REJECTED' } }),
      this.prisma.youTubeSourceSuggestion.count({ where: { status: 'APPROVED' } }),
    ]);
    return { pending, approvedWeek, rejected, approvedTotal };
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
    const result = await this.runDiscovery();
    await this.updateSettings({ lastRunAt: new Date().toISOString() });
    return result;
  }

  async runDiscovery() {
    const settings = await this.getSettings();
    if (!getYouTubeApiKey()) {
      return { ok: false, error: 'YOUTUBE_API_KEY missing' };
    }

    const categories = await this.prisma.contentSourceCategory.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
    });

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

    let created = 0;
    for (const category of categories) {
      const queries = YOUTUBE_DISCOVERY_QUERIES[category.slug] ?? YOUTUBE_DISCOVERY_QUERIES.ostatni;
      const seen = new Set<string>();
      const candidates: Array<{ channelId: string; score: number; reason: string; data: Awaited<ReturnType<typeof searchYoutubeChannels>>[0] }> = [];

      for (const query of queries.slice(0, 3)) {
        try {
          const found = await searchYoutubeChannels(query, 3);
          for (const ch of found) {
            if (seen.has(ch.channelId) || activeChannelIds.has(ch.channelId)) continue;
            seen.add(ch.channelId);
            const relevance = this.scoreChannel(ch, category.label, query);
            if (relevance < settings.minRelevanceScore) continue;
            candidates.push({
              channelId: ch.channelId,
              score: relevance,
              reason: `Shoda s dotazem „${query}" v kategorii ${category.label}`,
              data: ch,
            });
          }
        } catch (err) {
          this.log.warn(
            `Discovery search failed [${category.slug}/${query}]: ${err instanceof Error ? err.message : err}`,
          );
        }
      }

      candidates.sort((a, b) => b.score - a.score);
      for (const c of candidates.slice(0, settings.maxSuggestionsPerCategory)) {
        const skip = await this.shouldSkipCandidate(c.channelId, category.id);
        if (skip) continue;
        try {
          await this.prisma.youTubeSourceSuggestion.upsert({
            where: { channelId_categoryId: { channelId: c.channelId, categoryId: category.id } },
            create: {
              channelId: c.channelId,
              channelTitle: c.data.channelTitle,
              channelUrl: c.data.channelUrl,
              thumbnailUrl: c.data.thumbnailUrl,
              description: c.data.description,
              categoryId: category.id,
              subscriberCount: c.data.subscriberCount,
              videoCount: c.data.videoCount,
              lastVideoAt: c.data.lastVideoAt,
              relevanceScore: c.score,
              reason: c.reason,
              status: 'PENDING',
              suggestedBy: 'ai_discovery',
            },
            update: {
              channelTitle: c.data.channelTitle,
              channelUrl: c.data.channelUrl,
              thumbnailUrl: c.data.thumbnailUrl,
              description: c.data.description,
              subscriberCount: c.data.subscriberCount,
              videoCount: c.data.videoCount,
              lastVideoAt: c.data.lastVideoAt,
              relevanceScore: c.score,
              reason: c.reason,
              status: 'PENDING',
            },
          });
          created += 1;
        } catch (err) {
          this.log.warn(`Suggestion upsert failed: ${err instanceof Error ? err.message : err}`);
        }
      }
    }

    this.log.log(`YouTube discovery finished — ${created} new/updated suggestions`);
    return { ok: true, created };
  }

  private scoreChannel(
    ch: {
      channelTitle: string;
      description: string | null;
      subscriberCount: number | null;
      videoCount: number | null;
    },
    categoryLabel: string,
    query: string,
  ): number {
    const text = `${ch.channelTitle} ${ch.description ?? ''} ${query} ${categoryLabel}`;
    const base = scoreNewsRelevance(ch.channelTitle, `${ch.description ?? ''} ${query} ${categoryLabel}`);
    let score = base;
    if ((ch.subscriberCount ?? 0) >= 1000) score += 5;
    if ((ch.videoCount ?? 0) >= 20) score += 5;
    const lower = text.toLowerCase();
    if (/gaming|fortnite|minecraft|hudba|music|vlog|makeup|fitness/.test(lower)) score -= 40;
    return Math.max(0, Math.min(100, score));
  }

  private async shouldSkipCandidate(channelId: string, categoryId: string): Promise<boolean> {
    const existing = await this.prisma.youTubeSourceSuggestion.findUnique({
      where: { channelId_categoryId: { channelId, categoryId } },
    });
    if (!existing) return false;
    if (existing.status === 'REJECTED' || existing.status === 'IGNORED') {
      const rejectedAt = existing.rejectedAt?.getTime() ?? existing.updatedAt.getTime();
      const days = (Date.now() - rejectedAt) / (24 * 60 * 60 * 1000);
      if (days < REJECTED_RESHOW_DAYS) return true;
    }
    if (existing.status === 'APPROVED') return true;
    return false;
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
