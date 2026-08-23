import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { NewsSourceHealth, NewsSourceType, NewsYoutubePublishMode, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { DEFAULT_NEWS_SOURCES, LEGACY_NEWS_SOURCE_URL_FIXES } from './news-editorial.constants';
import { getYouTubeApiKey, resolveYoutubeChannel } from './news-youtube-api.util';

export type NewsSourceListRow = {
  id: string;
  name: string;
  url: string;
  type: NewsSourceType;
  category: string | null;
  enabled: boolean;
  trustScore: number;
  priority: number;
  language: string;
  checkIntervalMinutes: number;
  note: string | null;
  channelId: string | null;
  youtubePublishMode: string;
  youtubeCreatePost: boolean;
  youtubeFacebookPost: boolean;
  minRelevanceScore: number | null;
  lastVideoPublishedAt: Date | null;
  lastVideoId: string | null;
  youtubeImportedCount: number;
  health: NewsSourceHealth;
  lastCheckedAt: Date | null;
  lastSuccessAt: Date | null;
  lastError: string | null;
  itemsFoundTotal: number;
  failureCount: number;
  stats: {
    itemsToday: number;
    itemsTotal: number;
    duplicatesToday: number;
  };
};

@Injectable()
export class NewsSourceService implements OnModuleInit {
  private readonly log = new Logger(NewsSourceService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.seedDefaults();
    await this.fixLegacySourceUrls();
  }

  async fixLegacySourceUrls() {
    for (const [oldUrl, newUrl] of Object.entries(LEGACY_NEWS_SOURCE_URL_FIXES)) {
      const existing = await this.prisma.newsSource.findUnique({ where: { url: oldUrl } });
      if (!existing) continue;
      const targetTaken = await this.prisma.newsSource.findUnique({ where: { url: newUrl } });
      if (targetTaken && targetTaken.id !== existing.id) {
        await this.prisma.newsSource.update({
          where: { id: existing.id },
          data: { enabled: false, health: 'DISABLED', lastError: `URL zastaralá — použijte ${newUrl}` },
        });
        continue;
      }
      await this.prisma.newsSource.update({
        where: { id: existing.id },
        data: {
          url: newUrl,
          health: 'ACTIVE',
          failureCount: 0,
          lastError: null,
        },
      });
      this.log.log(`Migrated news source URL ${oldUrl} → ${newUrl}`);
    }
  }

  async seedDefaults() {
    for (const seed of DEFAULT_NEWS_SOURCES) {
      await this.prisma.newsSource.upsert({
        where: { url: seed.url },
        create: {
          name: seed.name,
          url: seed.url,
          type: seed.type,
          category: seed.category,
          enabled: seed.enabled,
          trustScore: seed.trustScore,
          priority: seed.priority,
          checkIntervalMinutes: seed.checkIntervalMinutes,
          note: seed.note,
        },
        update: {
          name: seed.name,
          note: seed.note,
          category: seed.category,
        },
      });
    }
    this.log.log(`Seeded ${DEFAULT_NEWS_SOURCES.length} default news sources`);
  }

  async listWithStats(): Promise<NewsSourceListRow[]> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const sources = await this.prisma.newsSource.findMany({
      orderBy: [{ enabled: 'desc' }, { priority: 'desc' }, { name: 'asc' }],
    });

    const stats = await Promise.all(
      sources.map(async (source) => {
        const [itemsToday, itemsTotal, duplicatesToday] = await Promise.all([
          this.prisma.newsSourceItem.count({
            where: { sourceId: source.id, fetchedAt: { gte: todayStart } },
          }),
          this.prisma.newsSourceItem.count({ where: { sourceId: source.id } }),
          this.prisma.newsSourceItem.count({
            where: {
              sourceId: source.id,
              status: 'DUPLICATE',
              fetchedAt: { gte: todayStart },
            },
          }),
        ]);
        return { itemsToday, itemsTotal, duplicatesToday };
      }),
    );

    return sources.map((source, i) => ({
      ...source,
      stats: stats[i]!,
    }));
  }

  async getById(id: string) {
    const source = await this.prisma.newsSource.findUnique({ where: { id } });
    if (!source) throw new NotFoundException('Zdroj nenalezen.');
    return source;
  }

  async create(data: {
    name: string;
    url: string;
    type: NewsSourceType;
    category?: string;
    enabled?: boolean;
    trustScore?: number;
    priority?: number;
    checkIntervalMinutes?: number;
    note?: string;
    channelId?: string;
    youtubePublishMode?: NewsYoutubePublishMode;
    youtubeCreatePost?: boolean;
    youtubeFacebookPost?: boolean;
    minRelevanceScore?: number;
  }) {
    let channelId = data.channelId?.trim() || null;
    if (data.type === NewsSourceType.YOUTUBE_CHANNEL && !channelId && getYouTubeApiKey()) {
      try {
        const resolved = await resolveYoutubeChannel(data.url, null);
        channelId = resolved.channelId;
      } catch (err) {
        this.log.warn(
          `YouTube channel resolve on create failed: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    return this.prisma.newsSource.create({
      data: {
        name: data.name.trim(),
        url: data.url.trim(),
        type: data.type,
        category: data.category?.trim() || null,
        enabled: data.enabled ?? true,
        trustScore: data.trustScore ?? 70,
        priority: data.priority ?? 50,
        checkIntervalMinutes: data.checkIntervalMinutes ?? 30,
        note: data.note?.trim() || null,
        channelId,
        youtubePublishMode: data.youtubePublishMode ?? NewsYoutubePublishMode.RELEVANT_ONLY,
        youtubeCreatePost: data.youtubeCreatePost ?? true,
        youtubeFacebookPost: data.youtubeFacebookPost ?? false,
        minRelevanceScore: data.minRelevanceScore ?? null,
        health: channelId ? NewsSourceHealth.ACTIVE : undefined,
      },
    });
  }

  async update(
    id: string,
    patch: Partial<{
      name: string;
      url: string;
      type: NewsSourceType;
      category: string | null;
      enabled: boolean;
      trustScore: number;
      priority: number;
      checkIntervalMinutes: number;
      note: string | null;
      health: NewsSourceHealth;
      channelId: string | null;
      youtubePublishMode: NewsYoutubePublishMode;
      youtubeCreatePost: boolean;
      youtubeFacebookPost: boolean;
      minRelevanceScore: number | null;
    }>,
  ) {
    await this.getById(id);
    const data: Prisma.NewsSourceUpdateInput = {};
    if (patch.name != null) data.name = patch.name.trim();
    if (patch.url != null) data.url = patch.url.trim();
    if (patch.type != null) data.type = patch.type;
    if (patch.category !== undefined) data.category = patch.category;
    if (patch.enabled != null) data.enabled = patch.enabled;
    if (patch.trustScore != null) data.trustScore = patch.trustScore;
    if (patch.priority != null) data.priority = patch.priority;
    if (patch.checkIntervalMinutes != null) data.checkIntervalMinutes = patch.checkIntervalMinutes;
    if (patch.note !== undefined) data.note = patch.note;
    if (patch.health != null) data.health = patch.health;
    if (patch.channelId !== undefined) data.channelId = patch.channelId;
    if (patch.youtubePublishMode != null) data.youtubePublishMode = patch.youtubePublishMode;
    if (patch.youtubeCreatePost != null) data.youtubeCreatePost = patch.youtubeCreatePost;
    if (patch.youtubeFacebookPost != null) data.youtubeFacebookPost = patch.youtubeFacebookPost;
    if (patch.minRelevanceScore !== undefined) data.minRelevanceScore = patch.minRelevanceScore;

    return this.prisma.newsSource.update({ where: { id }, data });
  }

  async remove(id: string) {
    await this.getById(id);
    await this.prisma.newsSource.delete({ where: { id } });
    return { ok: true };
  }

  async listDueForFetch(limit = 10) {
    const now = new Date();
    const sources = await this.prisma.newsSource.findMany({
      where: {
        enabled: true,
        health: { notIn: ['DISABLED', 'ERROR'] },
      },
      orderBy: [{ priority: 'desc' }, { lastCheckedAt: 'asc' }],
      take: limit * 3,
    });

    return sources
      .filter((s) => {
        if (!s.lastCheckedAt) return true;
        const dueMs = s.checkIntervalMinutes * 60_000;
        return now.getTime() - s.lastCheckedAt.getTime() >= dueMs;
      })
      .slice(0, limit);
  }
}
