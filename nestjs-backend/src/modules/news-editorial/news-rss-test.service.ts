import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { NewsEditorialDecision, NewsSourceItemStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { NewsAiService } from './news-ai.service';
import { NewsAuditService } from './news-audit.service';
import { NewsFetchService } from './news-fetch.service';
import { fetchFeedDiagnostics } from './news-feed.util';
import { NewsImageService } from './news-image.service';
import { NewsPortalPostService } from './news-portal-post.service';
import { NewsPublishService } from './news-publish.service';
import { NewsEditorialSettingsService } from './news-editorial-settings.service';
import { scoreNewsRelevance } from './news-editorial.util';

export type PipelineStep = {
  step: string;
  status: 'OK' | 'FAIL' | 'SKIP' | 'PENDING';
  durationMs?: number;
  detail?: string;
};

@Injectable()
export class NewsRssTestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fetchService: NewsFetchService,
    private readonly ai: NewsAiService,
    private readonly audit: NewsAuditService,
    private readonly images: NewsImageService,
    private readonly publish: NewsPublishService,
    private readonly portalPosts: NewsPortalPostService,
    private readonly settings: NewsEditorialSettingsService,
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
    await this.prisma.newsSource.update({
      where: { id: source.id },
      data: {
        lastCheckedAt: new Date(),
        lastHttpStatus: diagnostics.httpStatus ?? null,
        lastItemCount: diagnostics.itemCount,
        lastContentType: diagnostics.contentType ?? null,
        lastError: diagnostics.ok ? null : diagnostics.errorMessage ?? diagnostics.errorCode ?? null,
        health: diagnostics.ok
          ? 'ACTIVE'
          : diagnostics.httpStatus === 404 || diagnostics.httpStatus === 410
            ? 'ERROR'
            : 'DEGRADED',
      },
    });
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
    const started = Date.now();
    const steps: PipelineStep[] = [];
    const source = await this.getRssSource(id);

    const fetchStarted = Date.now();
    const diagnostics = await fetchFeedDiagnostics(source.url);
    steps.push({
      step: 'FETCH',
      status: diagnostics.ok ? 'OK' : 'FAIL',
      durationMs: Date.now() - fetchStarted,
      detail: diagnostics.ok
        ? `HTTP ${diagnostics.httpStatus}, ${diagnostics.itemCount} položek`
        : diagnostics.errorMessage ?? diagnostics.errorCode,
    });
    steps.push({
      step: 'PARSE',
      status: diagnostics.parserOk ? 'OK' : 'FAIL',
      detail: diagnostics.parser,
    });
    steps.push({
      step: 'ITEMS',
      status: diagnostics.itemCount > 0 ? 'OK' : 'FAIL',
      detail: String(diagnostics.itemCount),
    });

    if (!diagnostics.ok || !diagnostics.items.length) {
      return {
        ok: false,
        diagnostics,
        steps,
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

    let chosen = sorted[0]!;
    for (const item of sorted) {
      const relevance = scoreNewsRelevance(item.title, item.summary);
      if (relevance >= 40) {
        chosen = item;
        break;
      }
    }
    steps.push({
      step: 'SELECTED',
      status: 'OK',
      detail: chosen.title.slice(0, 120),
    });

    const importStarted = Date.now();
    const fetchResult = await this.fetchService.importSingleItem(source.id, chosen);
    steps.push({
      step: 'DUPLICATE',
      status: fetchResult.created ? 'OK' : 'SKIP',
      durationMs: Date.now() - importStarted,
      detail: fetchResult.created ? 'NO' : 'YES',
    });

    if (!fetchResult.created) {
      return {
        ok: true,
        diagnostics,
        steps,
        sourceItemCreated: false,
        duplicate: true,
        existingItemId: fetchResult.itemId,
        relevanceScore: fetchResult.relevanceScore,
        draftCreated: false,
      };
    }

    const imageStarted = Date.now();
    const imagePreview = await this.images.resolveHeroForArticle({
      slug: 'test-import',
      title: chosen.title,
      category: source.category ?? 'reality',
      rssImageUrl: chosen.imageUrl,
      articlePageUrl: chosen.link,
      imageSource: (chosen.imageSource as 'enclosure') ?? undefined,
    });
    steps.push({
      step: 'IMAGE',
      status: imagePreview.diagnostics.stored ? 'OK' : 'FAIL',
      durationMs: Date.now() - imageStarted,
      detail: imagePreview.diagnostics.imageSource,
    });

    const aiStarted = Date.now();
    await this.ai.analyzeItem(fetchResult.itemId!);
    const analyzed = await this.prisma.newsSourceItem.findUnique({
      where: { id: fetchResult.itemId! },
    });
    let article;
    try {
      article = await this.ai.generateDraftFromItem(fetchResult.itemId!);
      steps.push({
        step: 'AI',
        status: 'OK',
        durationMs: Date.now() - aiStarted,
      });
    } catch (err) {
      steps.push({
        step: 'AI',
        status: 'FAIL',
        durationMs: Date.now() - aiStarted,
        detail: err instanceof Error ? err.message : String(err),
      });
    }

    steps.push({
      step: 'ARTICLE',
      status: article ? 'OK' : 'FAIL',
      detail: article ? 'CREATED' : 'FAILED',
    });

    let postResult: Record<string, unknown> | null = null;
    if (article) {
      try {
        const published = await this.publish.publish(article.id, { force: true });
        steps.push({ step: 'PUBLISH', status: 'OK', detail: 'PUBLIC' });
        postResult = await this.portalPosts.syncFromArticle(published.id, {
          enqueueFacebook: this.settings.getCached().createFacebookPost,
        });
        steps.push({
          step: 'POST',
          status: postResult?.ok ? 'OK' : 'FAIL',
          detail: postResult?.ok ? 'CREATED' : String(postResult?.reason ?? 'FAILED'),
        });
        steps.push({
          step: 'FACEBOOK',
          status: this.settings.getCached().createFacebookPost
            ? postResult?.facebook
              ? 'OK'
              : 'SKIP'
            : 'SKIP',
          detail: this.settings.getCached().createFacebookPost ? 'QUEUED_OR_SENT' : 'NOT SENT',
        });
      } catch (err) {
        steps.push({
          step: 'PUBLISH',
          status: 'FAIL',
          detail: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return {
      ok: Boolean(article),
      diagnostics,
      steps,
      durationMs: Date.now() - started,
      sourceItemCreated: true,
      sourceItemId: fetchResult.itemId,
      relevanceScore: analyzed?.relevanceScore ?? fetchResult.relevanceScore,
      editorialDecision: analyzed?.editorialDecision,
      draftCreated: Boolean(article),
      articleId: article?.id ?? null,
      portalPost: postResult,
      published: Boolean(article),
    };
  }

  async testPipeline(id: string) {
    const result = await this.testImportOne(id);
    return {
      ...result,
      pipelineOk: result.draftCreated && Boolean(result.articleId),
      previewPath: result.articleId
        ? `/admin/aktuality?tab=pending&article=${result.articleId}`
        : null,
    };
  }
}
