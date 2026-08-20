import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  NewsEditorialDecision,
  NewsSourceItemStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { NewsAiService } from './news-ai.service';
import { NewsAuditService } from './news-audit.service';
import { NewsFetchService } from './news-fetch.service';
import { fetchFeedDiagnostics } from './news-feed.util';
import { scoreNewsRelevance } from './news-editorial.util';

@Injectable()
export class NewsRssTestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fetchService: NewsFetchService,
    private readonly ai: NewsAiService,
    private readonly audit: NewsAuditService,
  ) {}

  private async getRssSource(id: string) {
    const source = await this.prisma.newsSource.findUnique({ where: { id } });
    if (!source) throw new NotFoundException('Zdroj nenalezen.');
    if (!['RSS', 'ATOM'].includes(source.type)) {
      throw new BadRequestException('Test RSS je dostupný pouze pro RSS/ATOM zdroje.');
    }
    return source;
  }

  async testSource(id: string) {
    const source = await this.getRssSource(id);
    const diagnostics = await fetchFeedDiagnostics(source.url);
    await this.audit.log('RSS_TEST', `RSS test ${source.name}: ${diagnostics.ok ? 'OK' : diagnostics.errorCode}`, {
      metadata: {
        sourceId: source.id,
        ok: diagnostics.ok,
        errorCode: diagnostics.errorCode,
        itemCount: diagnostics.itemCount,
      },
    });
    return {
      source: {
        id: source.id,
        name: source.name,
        url: source.url,
        type: source.type,
      },
      diagnostics,
    };
  }

  async testImportOne(id: string) {
    const source = await this.getRssSource(id);
    const diagnostics = await fetchFeedDiagnostics(source.url);
    if (!diagnostics.ok || !diagnostics.items.length) {
      return {
        ok: false,
        diagnostics,
        sourceItemCreated: false,
        draftCreated: false,
        reason: diagnostics.errorMessage ?? diagnostics.errorCode ?? 'Feed prázdný',
      };
    }

    const sorted = [...diagnostics.items].sort((a, b) => {
      const ta = a.publishedAt?.getTime() ?? 0;
      const tb = b.publishedAt?.getTime() ?? 0;
      return tb - ta;
    });

    let chosen = sorted[0];
    for (const item of sorted) {
      const relevance = scoreNewsRelevance(item.title, item.summary);
      if (relevance >= 40) {
        chosen = item;
        break;
      }
    }

    const fetchResult = await this.fetchService.importSingleItem(source.id, chosen);
    if (!fetchResult.created) {
      return {
        ok: true,
        diagnostics,
        sourceItemCreated: false,
        duplicate: true,
        existingItemId: fetchResult.itemId,
        relevanceScore: fetchResult.relevanceScore,
        draftCreated: false,
      };
    }

    await this.ai.analyzeItem(fetchResult.itemId!);
    const analyzed = await this.prisma.newsSourceItem.findUnique({
      where: { id: fetchResult.itemId! },
    });
    const article = await this.ai.generateDraftFromItem(fetchResult.itemId!);

    return {
      ok: true,
      diagnostics,
      sourceItemCreated: true,
      sourceItemId: fetchResult.itemId,
      relevanceScore: analyzed?.relevanceScore ?? fetchResult.relevanceScore,
      editorialDecision: analyzed?.editorialDecision,
      draftCreated: Boolean(article),
      articleId: article?.id ?? null,
      published: false,
    };
  }

  async testPipeline(id: string) {
    const result = await this.testImportOne(id);
    if (!result.draftCreated || !result.articleId) {
      return {
        ...result,
        pipelineOk: false,
        previewPath: null,
      };
    }
    return {
      ...result,
      pipelineOk: true,
      previewPath: `/admin/aktuality?tab=ai&article=${result.articleId}`,
      published: false,
    };
  }
}
