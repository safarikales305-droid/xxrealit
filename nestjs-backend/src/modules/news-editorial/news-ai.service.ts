import { Injectable, Logger } from '@nestjs/common';
import {
  NewsEditorialDecision,
  NewsSourceItemStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { OpenAiService } from '../openai/openai.service';
import {
  markdownToBasicHtml,
  scoreNewsRelevance,
  slugifyNewsTitle,
} from './news-editorial.util';
import { NewsAuditService } from './news-audit.service';
import { NewsEditorialSettingsService } from './news-editorial-settings.service';

type DraftPayload = {
  title: string;
  seoTitle: string;
  seoDescription: string;
  perex: string;
  bodyMarkdown: string;
  category: string;
  region: string | null;
  sourcesFooterHtml: string;
  factClaimsJson: Prisma.InputJsonValue;
};

@Injectable()
export class NewsAiService {
  private readonly log = new Logger(NewsAiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly openai: OpenAiService,
    private readonly audit: NewsAuditService,
    private readonly settings: NewsEditorialSettingsService,
  ) {}

  async analyzeNewItems(limit = 20) {
    const items = await this.prisma.newsSourceItem.findMany({
      where: { status: NewsSourceItemStatus.NEW },
      include: { source: true },
      orderBy: { fetchedAt: 'asc' },
      take: limit,
    });

    let analyzed = 0;
    for (const item of items) {
      await this.analyzeItem(item.id);
      analyzed += 1;
    }
    return { analyzed };
  }

  async analyzeItem(itemId: string) {
    const item = await this.prisma.newsSourceItem.findUnique({
      where: { id: itemId },
      include: { source: true },
    });
    if (!item || item.status !== NewsSourceItemStatus.NEW) return null;

    const relevanceScore = scoreNewsRelevance(item.title, item.summary);
    const freshnessScore = this.computeFreshnessScore(item.publishedAt);
    const trustScore = item.source.trustScore;
    const seoPotential = Math.round((relevanceScore * 0.6 + freshnessScore * 0.2 + trustScore * 0.2));
    const userInterest = Math.round(relevanceScore * 0.7 + freshnessScore * 0.3);
    const trendScore = Math.round((relevanceScore + freshnessScore) / 2);

    const editorialDecision = this.decideEditorial(relevanceScore, seoPotential, freshnessScore);

    let topicId = item.topicId;
    if (
      editorialDecision === NewsEditorialDecision.CREATE_DRAFT ||
      editorialDecision === NewsEditorialDecision.HIGH_PRIORITY ||
      editorialDecision === NewsEditorialDecision.WATCH
    ) {
      topicId = await this.mergeOrCreateTopic(item.title, item.summary, item.id, trendScore);
    }

    const status =
      editorialDecision === NewsEditorialDecision.IGNORE
        ? NewsSourceItemStatus.IGNORED
        : NewsSourceItemStatus.ANALYZED;

    return this.prisma.newsSourceItem.update({
      where: { id: item.id },
      data: {
        relevanceScore,
        freshnessScore,
        trustScore,
        seoPotential,
        userInterest,
        trendScore,
        editorialDecision,
        status,
        topicId,
      },
    });
  }

  private decideEditorial(
    relevance: number,
    seoPotential: number,
    freshness: number,
  ): NewsEditorialDecision {
    if (relevance < 25) return NewsEditorialDecision.IGNORE;
    if (relevance >= 70 && seoPotential >= 65 && freshness >= 50) {
      return NewsEditorialDecision.HIGH_PRIORITY;
    }
    if (relevance >= 45 && seoPotential >= 50) return NewsEditorialDecision.CREATE_DRAFT;
    if (relevance >= 30) return NewsEditorialDecision.WATCH;
    return NewsEditorialDecision.IGNORE;
  }

  private computeFreshnessScore(publishedAt: Date | null): number {
    if (!publishedAt) return 40;
    const ageHours = (Date.now() - publishedAt.getTime()) / 3_600_000;
    if (ageHours <= 6) return 100;
    if (ageHours <= 24) return 85;
    if (ageHours <= 72) return 65;
    if (ageHours <= 168) return 45;
    return 25;
  }

  private async mergeOrCreateTopic(
    title: string,
    summary: string | null,
    sourceItemId: string,
    trendScore: number,
  ): Promise<string> {
    const slugBase = slugifyNewsTitle(title).slice(0, 60);
    const existing = await this.prisma.newsTopic.findFirst({
      where: {
        OR: [
          { slug: { startsWith: slugBase.slice(0, 40) } },
          { title: { contains: title.slice(0, 40), mode: 'insensitive' } },
        ],
        status: 'OPEN',
      },
    });

    if (existing) {
      const mergedIds = Array.from(new Set([...existing.mergedSourceItemIds, sourceItemId]));
      await this.prisma.newsTopic.update({
        where: { id: existing.id },
        data: {
          trendScore: Math.max(existing.trendScore, trendScore),
          mergedSourceItemIds: mergedIds,
        },
      });
      return existing.id;
    }

    const topic = await this.prisma.newsTopic.create({
      data: {
        slug: slugBase,
        title: title.slice(0, 200),
        summary: summary?.slice(0, 500) ?? null,
        trendScore,
        mergedSourceItemIds: [sourceItemId],
        category: 'reality',
      },
    });
    return topic.id;
  }

  async generateDraftFromItem(itemId: string) {
    const item = await this.prisma.newsSourceItem.findUnique({
      where: { id: itemId },
      include: { source: true, topic: true },
    });
    if (!item) return null;

    const category = item.source.category ?? 'reality';
    const region = item.topic?.region ?? null;

    let payload: DraftPayload;
    try {
      payload = await this.generateWithAi(item, category, region);
    } catch (err) {
      this.log.warn(`AI draft fallback for ${itemId}: ${err instanceof Error ? err.message : err}`);
      payload = this.generateRuleBasedDraft(item, category, region);
    }

    const slug = slugifyNewsTitle(payload.title);
    const bodyHtml = markdownToBasicHtml(payload.bodyMarkdown);

    const article = await this.prisma.newsArticle.create({
      data: {
        slug,
        title: payload.title,
        seoTitle: payload.seoTitle,
        seoDescription: payload.seoDescription,
        perex: payload.perex,
        bodyMarkdown: payload.bodyMarkdown,
        bodyHtml,
        category: payload.category,
        region: payload.region,
        canonicalPath: `/aktuality/${slug}`,
        qualityScore: null,
        relevanceScore: item.relevanceScore,
        publishMode: this.settings.getCached().publishMode,
        sourcePublishedAt: item.publishedAt,
        sourcesFooterHtml: payload.sourcesFooterHtml,
        factClaimsJson: payload.factClaimsJson,
        topicId: item.topicId,
        aiGenerated: true,
        sources: {
          create: {
            sourceId: item.sourceId,
            sourceItemId: item.id,
            sourceName: item.source.name,
            sourceUrl: item.sourceUrl,
            sourcePublishedAt: item.publishedAt,
          },
        },
        analytics: { create: {} },
      },
    });

    await this.audit.log('ARTICLE_DRAFT_CREATED', `Vytvořen draft: ${article.title}`, {
      articleId: article.id,
      metadata: { sourceItemId: item.id },
    });

    return article;
  }

  private async generateWithAi(
    item: Prisma.NewsSourceItemGetPayload<{ include: { source: true } }>,
    category: string,
    region: string | null,
  ): Promise<DraftPayload> {
    const ai = await this.openai.complete({
      feature: 'editorial_news',
      systemPrompt: `Jsi redaktor portálu XXREALIT. Vytvoř ORIGINÁLNÍ článek v češtině o realitním trhu.
Pravidla:
- NIKDY nekopíruj větu po větě
- Nevymýšlej čísla, sazby, procenta ani statistiky, které nejsou ve zdroji
- Vrať pouze JSON dle schématu
- Přidej praktický kontext pro kupující, prodávající, investory
- Uveď sekci Zdroje jako HTML seznam s odkazy`,
      userPrompt: JSON.stringify({
        sourceName: item.source.name,
        sourceUrl: item.sourceUrl,
        title: item.title,
        summary: item.summary,
        publishedAt: item.publishedAt,
        category,
        region,
        schema: {
          title: 'string',
          seoTitle: 'string',
          seoDescription: 'string',
          perex: 'string',
          bodyMarkdown: 'string',
          sourcesFooterHtml: 'string',
          factClaims: 'string[]',
        },
      }),
      jsonMode: true,
      maxOutputTokens: 2500,
    });

    const parsed = JSON.parse(ai.text) as Record<string, unknown>;
    return {
      title: String(parsed.title ?? item.title),
      seoTitle: String(parsed.seoTitle ?? `${item.title} | XXREALIT`),
      seoDescription: String(parsed.seoDescription ?? item.summary ?? item.title),
      perex: String(parsed.perex ?? item.summary ?? ''),
      bodyMarkdown: String(parsed.bodyMarkdown ?? ''),
      category,
      region,
      sourcesFooterHtml: String(
        parsed.sourcesFooterHtml ??
          `<ul><li><a href="${item.sourceUrl}" rel="noopener noreferrer" target="_blank">${item.source.name}</a></li></ul>`,
      ),
      factClaimsJson: (parsed.factClaims as Prisma.InputJsonValue) ?? [],
    };
  }

  private generateRuleBasedDraft(
    item: Prisma.NewsSourceItemGetPayload<{ include: { source: true } }>,
    category: string,
    region: string | null,
  ): DraftPayload {
    const perex =
      item.summary?.trim() ||
      `${item.title} — přehled pro čtenáře XXREALIT s dopadem na realitní trh a bydlení.`;
    const bodyMarkdown = [
      `## ${item.title}`,
      '',
      perex,
      '',
      '### Co to znamená pro trh',
      'Informace může ovlivnit rozhodování kupujících, prodávajících i investorů. Sledujte další vývoj a ověřte si detaily u primárního zdroje.',
      '',
      '### Praktické tipy',
      '- Porovnejte nabídku nemovitostí ve svém regionu na XXREALIT.',
      '- U hypoték a financování sledujte oficiální sazby a podmínky bank.',
      '- U větších rozhodnutí konzultujte odborníky.',
    ].join('\n');

    return {
      title: item.title,
      seoTitle: `${item.title} | XXREALIT`,
      seoDescription: perex.slice(0, 160),
      perex,
      bodyMarkdown,
      category,
      region,
      sourcesFooterHtml: `<ul><li><a href="${item.sourceUrl}" rel="noopener noreferrer" target="_blank">${item.source.name}</a></li></ul>`,
      factClaimsJson: [],
    };
  }
}
