import { Injectable, Logger } from '@nestjs/common';
import {
  NewsEditorialDecision,
  NewsSourceItemStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { OpenAiService } from '../openai/openai.service';
import {
  evaluateArticleReadiness,
  markdownToBasicHtml,
  runQualityGate,
  scoreNewsRelevance,
  slugifyNewsTitle,
} from './news-editorial.util';
import {
  sanitizeAiArticleFields,
  sanitizeNewsSourceText,
  scoreLanguageQuality,
  stripTrackingFromUrl,
  validateAiArticleOutput,
} from './news-text-sanitizer.util';
import { NewsAuditService } from './news-audit.service';
import { NewsEditorialSettingsService } from './news-editorial-settings.service';
import { NewsImageService } from './news-image.service';

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
    private readonly images: NewsImageService,
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
    const payload = await this.buildPayloadFromItem(item, category, region);
    const slug = slugifyNewsTitle(payload.title);
    const bodyHtml = markdownToBasicHtml(payload.bodyMarkdown);
    const langScore = scoreLanguageQuality(`${payload.perex}\n${payload.bodyMarkdown}`, payload.title).score;
    const gate = runQualityGate(payload);

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
        qualityScore: gate.qualityScore,
        seoScore: gate.seoScore,
        languageQualityScore: langScore,
        relevanceScore: item.relevanceScore,
        publishMode: this.settings.getCached().publishMode,
        sourcePublishedAt: item.publishedAt,
        sourcesFooterHtml: payload.sourcesFooterHtml,
        factClaimsJson: payload.factClaimsJson,
        topicId: item.topicId,
        aiGenerated: true,
        status: 'REVIEW',
        sources: {
          create: {
            sourceId: item.sourceId,
            sourceItemId: item.id,
            sourceName: item.source.name,
            sourceUrl: stripTrackingFromUrl(item.sourceUrl),
            sourcePublishedAt: item.publishedAt,
          },
        },
        analytics: { create: {} },
      },
    });

    return this.finalizeArticleMediaAndReadiness(article.id, item);
  }

  async regenerateArticleInPlace(articleId: string) {
    const article = await this.prisma.newsArticle.findUnique({
      where: { id: articleId },
      include: { sources: true },
    });
    if (!article) return null;
    const sourceLink = article.sources[0];
    if (!sourceLink?.sourceItemId) {
      throw new Error('Článek nemá vazbu na zdrojovou položku.');
    }

    const item = await this.prisma.newsSourceItem.findUnique({
      where: { id: sourceLink.sourceItemId },
      include: { source: true, topic: true },
    });
    if (!item) throw new Error('Zdrojová položka nenalezena.');

    const category = article.category || item.source.category || 'reality';
    const region = article.region ?? item.topic?.region ?? null;
    const payload = await this.buildPayloadFromItem(item, category, region);
    const bodyHtml = markdownToBasicHtml(payload.bodyMarkdown);
    const langScore = scoreLanguageQuality(`${payload.perex}\n${payload.bodyMarkdown}`, payload.title).score;
    const gate = runQualityGate(payload);

    await this.prisma.newsArticle.update({
      where: { id: articleId },
      data: {
        title: payload.title,
        seoTitle: payload.seoTitle,
        seoDescription: payload.seoDescription,
        perex: payload.perex,
        bodyMarkdown: payload.bodyMarkdown,
        bodyHtml,
        sourcesFooterHtml: payload.sourcesFooterHtml,
        factClaimsJson: payload.factClaimsJson,
        qualityScore: gate.qualityScore,
        seoScore: gate.seoScore,
        languageQualityScore: langScore,
        aiGenerated: true,
        status: article.status === 'PUBLISHED' ? 'PUBLISHED' : 'REVIEW',
      },
    });

    await this.audit.log('ARTICLE_REGENERATED', `Regenerován článek ze zdroje: ${payload.title}`, {
      articleId,
      metadata: { sourceItemId: item.id },
    });

    return this.finalizeArticleMediaAndReadiness(articleId, item);
  }

  private async finalizeArticleMediaAndReadiness(
    articleId: string,
    item: Prisma.NewsSourceItemGetPayload<{ include: { source: true } }>,
  ) {
    const article = await this.prisma.newsArticle.findUnique({ where: { id: articleId } });
    if (!article) return null;

    const hero = await this.images.resolveHeroForArticle({
      articleId: article.id,
      slug: article.slug,
      title: article.title,
      category: article.category,
      rssImageUrl: item.imageUrl,
      articlePageUrl: item.sourceUrl,
      imageSource: (item.rawMetadata as { imageSource?: string } | null)?.imageSource as
        | 'enclosure'
        | 'media:content'
        | undefined,
    });

    const cfg = this.settings.getCached();
    const readiness = evaluateArticleReadiness(
      { ...article, ogImageUrl: hero.storedUrl },
      { minQuality: cfg.autoPublishMinQuality, minLanguage: cfg.minLanguageQuality },
    );

    const withImage = await this.prisma.newsArticle.update({
      where: { id: articleId },
      data: {
        ogImageUrl: hero.storedUrl,
        ogImageAlt: hero.alt,
        imageDiagnosticsJson: hero.diagnostics as object,
        qualityScore: readiness.quality.qualityScore,
        seoScore: readiness.quality.seoScore,
        languageQualityScore: readiness.languageScore,
        waitReason: readiness.waitReason,
        status: readiness.ready ? 'REVIEW' : 'REVIEW',
      },
    });

    await this.audit.log('NEWS_ARTICLE_CREATED', `Draft připraven: ${withImage.title}`, {
      articleId: withImage.id,
      metadata: { waitReason: readiness.waitReason, image: hero.diagnostics },
    });

    return withImage;
  }

  private async buildPayloadFromItem(
    item: Prisma.NewsSourceItemGetPayload<{ include: { source: true } }>,
    category: string,
    region: string | null,
  ): Promise<DraftPayload> {
    let payload: DraftPayload;
    try {
      payload = await this.generateWithAi(item, category, region);
    } catch (err) {
      this.log.warn(`AI draft fallback for ${item.id}: ${err instanceof Error ? err.message : err}`);
      payload = this.generateRuleBasedDraft(item, category, region);
    }

    payload = sanitizeAiArticleFields(payload);
    const validation = validateAiArticleOutput(payload);
    if (!validation.valid) {
      this.log.warn(`AI output validation failed for ${item.id}: ${validation.issues.join(', ')}`);
      payload = this.generateRuleBasedDraft(item, category, region);
      payload = sanitizeAiArticleFields(payload);
    }
    return payload;
  }

  private async generateWithAi(
    item: Prisma.NewsSourceItemGetPayload<{ include: { source: true } }>,
    category: string,
    region: string | null,
  ): Promise<DraftPayload> {
    const cleaned = sanitizeNewsSourceText(item.title, item.summary);
    const sourceUrl = stripTrackingFromUrl(item.sourceUrl);

    const ai = await this.openai.complete({
      feature: 'editorial_news',
      systemPrompt: `Jsi redaktor českého realitního portálu XXREALIT.

Z ověřených podkladů napiš samostatný, plynulý, originální článek v češtině.

Pravidla:
- Nevkládej URL do těla článku (kromě sekce Zdroje v sourcesFooterHtml).
- Odstraň technické informace, tracking parametry, kód a RSS artefakty.
- Neopakuj nadpis v prvním odstavci.
- Nevymýšlej čísla, sazby, statistiky ani citace, které nejsou ve zdroji.
- Zaměř se na dopad pro kupující, prodávající, majitele, investory a realitní trh.
- Text musí působit jako redakční článek, ne jako strojový přepis RSS.
- Vrať pouze JSON dle schématu.`,
      userPrompt: JSON.stringify({
        sourceName: item.source.name,
        sourceUrl,
        title: cleaned.title,
        summary: cleaned.summary,
        bodyHint: cleaned.bodyHint,
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
      title: String(parsed.title ?? cleaned.title),
      seoTitle: String(parsed.seoTitle ?? `${cleaned.title} | XXREALIT`),
      seoDescription: String(parsed.seoDescription ?? cleaned.summary ?? cleaned.title).slice(0, 170),
      perex: String(parsed.perex ?? cleaned.summary ?? ''),
      bodyMarkdown: String(parsed.bodyMarkdown ?? ''),
      category,
      region,
      sourcesFooterHtml: String(
        parsed.sourcesFooterHtml ??
          `<ul><li><a href="${sourceUrl}" rel="noopener noreferrer" target="_blank">${item.source.name}</a></li></ul>`,
      ),
      factClaimsJson: (parsed.factClaims as Prisma.InputJsonValue) ?? [],
    };
  }

  private generateRuleBasedDraft(
    item: Prisma.NewsSourceItemGetPayload<{ include: { source: true } }>,
    category: string,
    region: string | null,
  ): DraftPayload {
    const cleaned = sanitizeNewsSourceText(item.title, item.summary);
    const sourceUrl = stripTrackingFromUrl(item.sourceUrl);
    const perex =
      cleaned.summary ||
      `${cleaned.title} — přehled pro čtenáře XXREALIT s dopadem na realitní trh a bydlení.`;
    const bodyMarkdown = [
      '## Co se děje',
      '',
      perex,
      '',
      '## Co to znamená pro realitní trh',
      'Informace může ovlivnit rozhodování kupujících, prodávajících i investorů. Sledujte další vývoj a ověřte si detaily u primárního zdroje.',
      '',
      '## Co to znamená pro kupující, prodávající a investory',
      '- Kupující by měli zvážit dopad na dostupnost financování a ceny.',
      '- Prodávající mohou upravit strategii podle aktuální poptávky.',
      '- Investoři sledují rizika i příležitosti v daném segmentu trhu.',
      '',
      '## Praktické shrnutí',
      '- Porovnejte nabídku nemovitostí ve svém regionu na XXREALIT.',
      '- U hypoték sledujte oficiální sazby a podmínky bank.',
      '- U větších rozhodnutí konzultujte odborníky.',
    ].join('\n');

    return {
      title: cleaned.title,
      seoTitle: `${cleaned.title} — dopad na realitní trh | XXREALIT`,
      seoDescription: perex.slice(0, 160),
      perex,
      bodyMarkdown,
      category,
      region,
      sourcesFooterHtml: `<ul><li><a href="${sourceUrl}" rel="noopener noreferrer" target="_blank">${item.source.name}</a></li></ul>`,
      factClaimsJson: [],
    };
  }
}
