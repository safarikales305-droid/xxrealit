import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { NewsSourceHealth, NewsSourceType, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { DEFAULT_NEWS_SOURCES } from './news-editorial.constants';

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
        update: {},
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
  }) {
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
        health: { not: NewsSourceHealth.DISABLED },
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
