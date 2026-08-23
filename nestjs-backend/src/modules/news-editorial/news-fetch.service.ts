import { Injectable, Logger } from '@nestjs/common';
import {
  NewsEditorialDecision,
  NewsSourceHealth,
  NewsSourceItemStatus,
  NewsSourceType,
  type NewsSource,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  NEWS_FETCH_RETRY_DELAYS_MS,
  NEWS_IGNORE_KEYWORDS,
  NEWS_MAX_FETCH_FAILURES,
  NEWS_TITLE_SIMILARITY_THRESHOLD,
} from './news-editorial.constants';
import { fetchFeedDiagnostics, type ParsedFeedItem } from './news-feed.util';
import {
  newsContentHash,
  newsTitleFingerprint,
  normalizeNewsText,
  scoreNewsRelevance,
  titleSimilarity,
} from './news-editorial.util';
import { NewsAuditService } from './news-audit.service';

function canonicalizeUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    u.hash = '';
    return u.toString().replace(/\/$/, '');
  } catch {
    return url.trim().toLowerCase();
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

@Injectable()
export class NewsFetchService {
  private readonly log = new Logger(NewsFetchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: NewsAuditService,
  ) {}

  async fetchDueSources(limit = 5) {
    const sources = await this.prisma.newsSource.findMany({
      where: {
        enabled: true,
        health: { notIn: [NewsSourceHealth.DISABLED, NewsSourceHealth.ERROR] },
        type: { not: NewsSourceType.YOUTUBE_CHANNEL },
      },
      orderBy: [{ priority: 'desc' }, { lastCheckedAt: 'asc' }],
      take: limit * 3,
    });

    const now = new Date();
    const due = sources
      .filter((s) => {
        if (!s.lastCheckedAt) return true;
        return now.getTime() - s.lastCheckedAt.getTime() >= s.checkIntervalMinutes * 60_000;
      })
      .slice(0, limit);

    const results = [];
    for (const source of due) {
      results.push(await this.fetchSource(source));
    }
    return results;
  }

  async fetchSource(source: NewsSource) {
    await this.prisma.newsSource.update({
      where: { id: source.id },
      data: { lastCheckedAt: new Date() },
    });

    let lastError: string | null = null;
    let lastDiagnostics: Awaited<ReturnType<typeof fetchFeedDiagnostics>> | null = null;

    for (let attempt = 0; attempt < NEWS_FETCH_RETRY_DELAYS_MS.length; attempt += 1) {
      try {
        const diagnostics = await fetchFeedDiagnostics(source.url);
        lastDiagnostics = diagnostics;
        if (!diagnostics.ok) {
          throw new Error(
            diagnostics.errorMessage ?? `HTTP ${diagnostics.httpStatus ?? '?'} — ${diagnostics.errorCode}`,
          );
        }
        const inserted = await this.persistFeedItems(source, diagnostics.items);
        await this.prisma.newsSource.update({
          where: { id: source.id },
          data: {
            lastSuccessAt: new Date(),
            lastError: null,
            lastHttpStatus: diagnostics.httpStatus ?? null,
            lastItemCount: diagnostics.itemCount,
            lastContentType: diagnostics.contentType ?? null,
            failureCount: 0,
            health: NewsSourceHealth.ACTIVE,
            itemsFoundTotal: { increment: inserted.newCount },
          },
        });
        await this.audit.log('NEWS_FETCH_SUCCESS', `Zdroj ${source.name}: ${inserted.newCount} nových položek`, {
          metadata: { sourceId: source.id, total: diagnostics.items.length, ...inserted },
        });
        return { sourceId: source.id, ok: true, ...inserted };
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        const delay = NEWS_FETCH_RETRY_DELAYS_MS[attempt] ?? 60_000;
        this.log.warn(`Fetch failed ${source.url} attempt=${attempt + 1}: ${lastError}`);
        if (attempt < NEWS_FETCH_RETRY_DELAYS_MS.length - 1) {
          await sleep(delay);
        }
      }
    }

    if (!lastDiagnostics) {
      lastDiagnostics = await fetchFeedDiagnostics(source.url).catch(() => null);
    }
    const httpStatus = lastDiagnostics?.httpStatus;
    const isPermanent =
      httpStatus === 404 ||
      httpStatus === 410 ||
      lastDiagnostics?.errorCode === 'INVALID_RSS';

    const updated = await this.prisma.newsSource.update({
      where: { id: source.id },
      data: {
        lastError,
        lastHttpStatus: httpStatus ?? null,
        lastItemCount: lastDiagnostics?.itemCount ?? 0,
        lastContentType: lastDiagnostics?.contentType ?? null,
        failureCount: { increment: 1 },
      },
    });

    if (isPermanent) {
      await this.prisma.newsSource.update({
        where: { id: source.id },
        data: { health: NewsSourceHealth.ERROR },
      });
    } else if (updated.failureCount >= NEWS_MAX_FETCH_FAILURES) {
      await this.prisma.newsSource.update({
        where: { id: source.id },
        data: { health: NewsSourceHealth.DEGRADED },
      });
    }

    await this.audit.log('NEWS_FETCH_FAILED', `Zdroj ${source.name}: ${lastError}`, {
      metadata: { sourceId: source.id, httpStatus },
    });

    return { sourceId: source.id, ok: false, error: lastError };
  }

  async importSingleItem(sourceId: string, item: ParsedFeedItem) {
    const source = await this.prisma.newsSource.findUnique({ where: { id: sourceId } });
    if (!source) throw new Error('Zdroj nenalezen');

    const normalizedTitle = normalizeNewsText(item.title);
    const canonicalUrl = canonicalizeUrl(item.link);
    const hash = newsContentHash(item.title, canonicalUrl, item.publishedAt);
    const fingerprint = newsTitleFingerprint(item.title);

    const existingHash = await this.prisma.newsSourceItem.findUnique({
      where: { sourceId_contentHash: { sourceId: source.id, contentHash: hash } },
    });
    if (existingHash) {
      return {
        created: false,
        itemId: existingHash.id,
        relevanceScore: existingHash.relevanceScore,
      };
    }

    const relevanceScore = scoreNewsRelevance(item.title, item.summary);
    const row = await this.prisma.newsSourceItem.create({
      data: {
        sourceId: source.id,
        externalId: item.externalId,
        sourceUrl: item.link,
        canonicalUrl,
        title: item.title.trim(),
        summary: item.summary,
        publishedAt: item.publishedAt,
        author: item.author,
        imageUrl: item.imageUrl,
        contentHash: hash,
        titleFingerprint: fingerprint,
        status: NewsSourceItemStatus.NEW,
        relevanceScore,
        trustScore: source.trustScore,
        editorialDecision:
          relevanceScore >= 50 ? NewsEditorialDecision.HIGH_PRIORITY : NewsEditorialDecision.WATCH,
        rawMetadata: {
          manualImport: true,
          fetchedFrom: source.url,
          imageSource: item.imageSource,
        },
      },
    });

    return { created: true, itemId: row.id, relevanceScore };
  }

  private async persistFeedItems(source: NewsSource, items: ParsedFeedItem[]) {
    let newCount = 0;
    let duplicateCount = 0;
    let ignoredCount = 0;

    for (const item of items) {
      const normalizedTitle = normalizeNewsText(item.title);
      const canonicalUrl = canonicalizeUrl(item.link);
      const hash = newsContentHash(item.title, canonicalUrl, item.publishedAt);
      const fingerprint = newsTitleFingerprint(item.title);

      const ignoreHit = NEWS_IGNORE_KEYWORDS.some((kw) =>
        normalizedTitle.includes(normalizeNewsText(kw)),
      );
      if (ignoreHit) {
        ignoredCount += 1;
        continue;
      }

      const existingHash = await this.prisma.newsSourceItem.findUnique({
        where: { sourceId_contentHash: { sourceId: source.id, contentHash: hash } },
      });
      if (existingHash) {
        duplicateCount += 1;
        continue;
      }

      const urlDup = await this.prisma.newsSourceItem.findFirst({
        where: { canonicalUrl, status: { not: NewsSourceItemStatus.DUPLICATE } },
        select: { id: true },
      });

      let duplicateOfId: string | null = null;
      if (urlDup) {
        duplicateOfId = urlDup.id;
      } else {
        const recent = await this.prisma.newsSourceItem.findMany({
          where: {
            fetchedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
            status: { not: NewsSourceItemStatus.DUPLICATE },
          },
          select: { id: true, title: true },
          take: 200,
          orderBy: { fetchedAt: 'desc' },
        });
        for (const prev of recent) {
          if (titleSimilarity(prev.title, item.title) >= NEWS_TITLE_SIMILARITY_THRESHOLD) {
            duplicateOfId = prev.id;
            break;
          }
        }
      }

      const relevanceScore = scoreNewsRelevance(item.title, item.summary);

      await this.prisma.newsSourceItem.create({
        data: {
          sourceId: source.id,
          externalId: item.externalId,
          sourceUrl: item.link,
          canonicalUrl,
          title: item.title.trim(),
          summary: item.summary,
          publishedAt: item.publishedAt,
          author: item.author,
          imageUrl: item.imageUrl,
          contentHash: hash,
          titleFingerprint: fingerprint,
          status: duplicateOfId ? NewsSourceItemStatus.DUPLICATE : NewsSourceItemStatus.NEW,
          duplicateOfId,
          relevanceScore,
          trustScore: source.trustScore,
          editorialDecision: duplicateOfId
            ? NewsEditorialDecision.IGNORE
            : relevanceScore >= 50
              ? null
              : NewsEditorialDecision.IGNORE,
          rawMetadata: {
            fetchedFrom: source.url,
            imageSource: item.imageSource,
          },
        },
      });

      if (duplicateOfId) duplicateCount += 1;
      else newCount += 1;
    }

    return { newCount, duplicateCount, ignoredCount };
  }
}
