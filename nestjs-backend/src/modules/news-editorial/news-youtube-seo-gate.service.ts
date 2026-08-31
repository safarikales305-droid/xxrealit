import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { EditorialContentMode } from './news-youtube-seo-gate.constants';
import { PrismaService } from '../../database/prisma.service';
import { OpenAiService } from '../openai/openai.service';
import { NewsEditorialSettingsService } from './news-editorial-settings.service';
import {
  DEFAULT_YOUTUBE_SEO_GATE_SETTINGS,
  type YoutubeSeoGateResult,
  type YoutubeSeoGateSettings,
} from './news-youtube-seo-gate.constants';
import {
  countWords,
  detectTopicCluster,
  evaluateYoutubeSeoGate,
  seoBadgeLabel,
} from './news-youtube-seo-gate.util';
import {
  ensureUniquePostSlug,
  generatePostSlug,
} from '../seo/post-seo.util';
import { sanitizeNewsSourceText } from './news-text-sanitizer.util';
import type { YoutubeVideoMeta } from './news-youtube-api.util';
import type { NewsSource } from '@prisma/client';

type PostSeoRecord = {
  seoQualityScore: number;
  editorialContentMode: EditorialContentMode;
  isIndexable: boolean;
  robots: string | null;
  editorialLocation: string | null;
  editorialLocationConfidence: number | null;
  editorialTopicCluster: string | null;
  editorialH1: string | null;
  editorialPerex: string | null;
  editorialBodyMarkdown: string | null;
  editorialSeoDiagnosticsJson: unknown;
  editorialInternalLinksJson: unknown;
  editorialRelatedPostIds: string[];
  duplicateTopicBlocked: boolean;
  contentModeManual: boolean;
  indexableManual: boolean;
  canonicalPath: string | null;
  slug: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  content: string | null;
  title: string;
  youtubeVideoId: string | null;
  youtubeThumbnailUrl: string | null;
  youtubeChannelTitle: string | null;
  publishedAt: Date | null;
  newsSource?: { id: string; name: string; category: string | null; trustScore: number } | null;
};

const STATIC_INTERNAL_LINKS: Array<{ label: string; path: string }> = [
  { label: 'Makléři', path: '/makleri' },
  { label: 'Firmy', path: '/firmy' },
  { label: 'Nemovitosti', path: '/nemovitosti' },
  { label: 'Aktuality', path: '/aktuality' },
  { label: 'Shorts', path: '/shorts' },
];

export type YoutubeSeoPrepareInput = {
  video: YoutubeVideoMeta;
  source: NewsSource;
  channelTitle: string;
  teaser: string;
  bodyText: string;
  relevanceScore: number;
};

@Injectable()
export class NewsYoutubeSeoGateService {
  private readonly log = new Logger(NewsYoutubeSeoGateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly openai: OpenAiService,
    private readonly settings: NewsEditorialSettingsService,
  ) {}

  getGateSettings(): YoutubeSeoGateSettings {
    const cfg = this.settings.getCached();
    return {
      shortsOnlyMax: cfg.youtubeSeoShortsOnlyMax ?? DEFAULT_YOUTUBE_SEO_GATE_SETTINGS.shortsOnlyMax,
      postAndShortsMax: cfg.youtubeSeoPostAndShortsMax ?? DEFAULT_YOUTUBE_SEO_GATE_SETTINGS.postAndShortsMax,
      articleFeatureMin: cfg.youtubeSeoArticleFeatureMin ?? DEFAULT_YOUTUBE_SEO_GATE_SETTINGS.articleFeatureMin,
      indexableMin: cfg.youtubeSeoIndexableMin ?? DEFAULT_YOUTUBE_SEO_GATE_SETTINGS.indexableMin,
      minArticleWords: cfg.youtubeSeoMinArticleWords ?? DEFAULT_YOUTUBE_SEO_GATE_SETTINGS.minArticleWords,
      maxArticleWords: cfg.youtubeSeoMaxArticleWords ?? DEFAULT_YOUTUBE_SEO_GATE_SETTINGS.maxArticleWords,
      topicClusterDays: cfg.youtubeSeoTopicClusterDays ?? DEFAULT_YOUTUBE_SEO_GATE_SETTINGS.topicClusterDays,
    };
  }

  async prepareForImport(input: YoutubeSeoPrepareInput): Promise<YoutubeSeoGateResult> {
    const gateSettings = this.getGateSettings();
    const cleaned = sanitizeNewsSourceText(input.video.title, input.video.description);
    const topicCluster = detectTopicCluster(cleaned.title, cleaned.summary);
    const duplicateTopicBlocked = await this.hasStrongTopicArticle(topicCluster, gateSettings.topicClusterDays);

    let h1: string | null = null;
    let perex = input.teaser;
    let bodyMarkdown = input.bodyText;
    let seoTitle: string | null = null;
    let seoDescription: string | null = null;
    let suggestedLinks: Array<{ label: string; path: string }> = [];

    const preliminary = evaluateYoutubeSeoGate({
      videoTitle: cleaned.title,
      videoDescription: cleaned.summary,
      channelTitle: input.channelTitle,
      embeddable: input.video.embeddable,
      thumbnailUrl: input.video.thumbnailUrl,
      relevanceScore: input.relevanceScore,
      sourceTrustScore: input.source.trustScore ?? 60,
      teaser: input.teaser,
      bodyMarkdown: input.bodyText,
      duplicateTopicBlocked,
      settings: gateSettings,
    });

    const needsArticle =
      !duplicateTopicBlocked &&
      preliminary.seoQualityScore >= gateSettings.articleFeatureMin - 10;

    if (needsArticle) {
      const article = await this.generateArticleFeatureContent(input, gateSettings);
      if (article) {
        h1 = article.h1;
        perex = article.perex;
        bodyMarkdown = article.bodyMarkdown;
        seoTitle = article.seoTitle;
        seoDescription = article.seoDescription;
        suggestedLinks = article.internalLinks;
      }
    }

    const validatedLinks = await this.validateInternalLinks(suggestedLinks);
    const relatedPostIds = await this.findRelatedPosts(topicCluster, input.video.videoId);

    let result = evaluateYoutubeSeoGate({
      videoTitle: cleaned.title,
      videoDescription: cleaned.summary,
      channelTitle: input.channelTitle,
      embeddable: input.video.embeddable,
      thumbnailUrl: input.video.thumbnailUrl,
      relevanceScore: input.relevanceScore,
      sourceTrustScore: input.source.trustScore ?? 60,
      teaser: perex,
      bodyMarkdown,
      h1,
      perex,
      seoTitle: seoTitle ?? `${h1 ?? cleaned.title} | XXREALIT`,
      seoDescription: seoDescription ?? perex.slice(0, 160),
      internalLinks: validatedLinks,
      relatedPostIds,
      duplicateTopicBlocked,
      settings: gateSettings,
    });

    if (result.contentMode === 'ARTICLE_FEATURE') {
      const slugBase = generatePostSlug(h1 ?? cleaned.title, input.video.videoId);
      const slug = await ensureUniquePostSlug(this.prisma, slugBase);
      result.slug = slug;
      result.canonicalPath = `/prispevek/${slug}`;
      result.schemaJson = this.buildVideoSchema(input, result);
    } else if (result.contentMode === 'POST_AND_SHORTS') {
      result.slug = `video-${input.video.videoId}`;
      result.canonicalPath = `/prispevek/video-${input.video.videoId}`;
    } else {
      result.slug = null;
      result.canonicalPath = null;
    }

    result = {
      ...result,
      topicCluster,
    };

    this.log.debug(
      `[YOUTUBE-SEO-GATE] video=${input.video.videoId} score=${result.seoQualityScore} mode=${result.contentMode} indexable=${result.isIndexable}`,
    );

    return result;
  }

  async getPostSeoDetail(postId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: {
        newsSource: { select: { id: true, name: true, category: true, trustScore: true } },
      },
    });
    if (!post || post.type !== 'YOUTUBE_VIDEO') {
      throw new NotFoundException('YouTube příspěvek nenalezen.');
    }
    const row = post as typeof post & PostSeoRecord;
    const diagnostics = (row.editorialSeoDiagnosticsJson ?? {}) as Record<string, unknown>;
    const internalLinks = Array.isArray(row.editorialInternalLinksJson)
      ? (row.editorialInternalLinksJson as Array<{ label: string; path: string; valid?: boolean }>)
      : [];
    return {
      id: row.id,
      title: row.title,
      youtubeVideoId: row.youtubeVideoId,
      seoQualityScore: row.seoQualityScore,
      contentMode: row.editorialContentMode,
      isIndexable: row.isIndexable,
      robots: row.robots,
      category: row.newsSource?.category ?? null,
      location: row.editorialLocation,
      locationConfidence: row.editorialLocationConfidence,
      topicCluster: row.editorialTopicCluster,
      wordCount: countWords(`${row.editorialPerex ?? ''}\n${row.editorialBodyMarkdown ?? row.content ?? ''}`),
      internalLinksCount: internalLinks.filter((l) => l.valid !== false).length,
      relatedCount: row.editorialRelatedPostIds.length,
      badge: seoBadgeLabel(row.seoQualityScore),
      h1: row.editorialH1,
      perex: row.editorialPerex,
      bodyMarkdown: row.editorialBodyMarkdown,
      seoTitle: row.seoTitle,
      seoDescription: row.seoDescription,
      canonicalPath: row.canonicalPath,
      slug: row.slug,
      checks: (diagnostics.checks as YoutubeSeoGateResult['checks']) ?? [],
      breakdown: (diagnostics.breakdown as YoutubeSeoGateResult['breakdown']) ?? null,
      duplicateTopicBlocked: row.duplicateTopicBlocked,
      contentModeManual: row.contentModeManual,
      indexableManual: row.indexableManual,
      source: row.newsSource,
      thumbnailUrl: row.youtubeThumbnailUrl,
      channelTitle: row.youtubeChannelTitle,
    };
  }

  async listPostsSeo(params: {
    contentMode?: EditorialContentMode;
    minScore?: number;
    indexable?: boolean;
    category?: string;
    location?: string;
    sourceId?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 30));
    const where = {
      type: 'YOUTUBE_VIDEO',
      ...(params.contentMode ? { editorialContentMode: params.contentMode } : {}),
      ...(params.minScore != null ? { seoQualityScore: { gte: params.minScore } } : {}),
      ...(params.indexable != null ? { isIndexable: params.indexable } : {}),
      ...(params.location
        ? { editorialLocation: { contains: params.location, mode: 'insensitive' } }
        : {}),
      ...(params.sourceId ? { newsSourceId: params.sourceId } : {}),
      ...(params.category ? { newsSource: { category: params.category } } : {}),
      ...(params.search?.trim()
        ? {
            OR: [
              { title: { contains: params.search.trim(), mode: 'insensitive' } },
              { editorialH1: { contains: params.search.trim(), mode: 'insensitive' } },
              { youtubeChannelTitle: { contains: params.search.trim(), mode: 'insensitive' } },
            ],
          }
        : {}),
    } as Prisma.PostWhereInput;

    const [items, total] = await Promise.all([
      this.prisma.post.findMany({
        where,
        orderBy: [{ seoQualityScore: 'desc' }, { publishedAt: 'desc' }] as Prisma.PostOrderByWithRelationInput[],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          newsSource: { select: { id: true, name: true, category: true } },
        },
      }),
      this.prisma.post.count({ where }),
    ]);

    return {
      items: items.map((raw) => {
        const p = raw as typeof raw & PostSeoRecord & { newsSource: PostSeoRecord['newsSource'] };
        return {
          id: p.id,
          title: p.title,
          youtubeVideoId: p.youtubeVideoId,
          thumbnailUrl: p.youtubeThumbnailUrl,
          channelTitle: p.youtubeChannelTitle,
          publishedAt: p.publishedAt,
          seoQualityScore: p.seoQualityScore,
          contentMode: p.editorialContentMode,
          isIndexable: p.isIndexable,
          robots: p.robots,
          location: p.editorialLocation,
          topicCluster: p.editorialTopicCluster,
          badge: seoBadgeLabel(p.seoQualityScore),
          slug: p.slug,
          source: p.newsSource,
          wordCount: countWords(`${p.editorialPerex ?? ''}\n${p.editorialBodyMarkdown ?? p.content ?? ''}`),
          internalLinksCount: Array.isArray(p.editorialInternalLinksJson)
            ? (p.editorialInternalLinksJson as unknown[]).length
            : 0,
          relatedCount: p.editorialRelatedPostIds.length,
        };
      }),
      total,
      page,
      pageSize,
      hasMore: page * pageSize < total,
    };
  }

  async patchPostSeo(
    postId: string,
    patch: {
      contentMode?: EditorialContentMode;
      isIndexable?: boolean;
    },
  ) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post || post.type !== 'YOUTUBE_VIDEO') {
      throw new NotFoundException('YouTube příspěvek nenalezen.');
    }
    const data = {
      ...(patch.contentMode
        ? { editorialContentMode: patch.contentMode, contentModeManual: true }
        : {}),
      ...(patch.isIndexable != null
        ? {
            isIndexable: patch.isIndexable,
            indexableManual: true,
            robots: patch.isIndexable ? 'index,follow' : 'noindex,nofollow',
          }
        : {}),
    } as Prisma.PostUpdateInput;
    return this.prisma.post.update({ where: { id: postId }, data });
  }

  private async hasStrongTopicArticle(
    topicCluster: string | null,
    days: number,
  ): Promise<boolean> {
    if (!topicCluster) return false;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const existing = await this.prisma.post.findFirst({
      where: {
        type: 'YOUTUBE_VIDEO',
        editorialTopicCluster: topicCluster,
        editorialContentMode: 'ARTICLE_FEATURE',
        isIndexable: true,
        publishedAt: { gte: since },
      } as Prisma.PostWhereInput,
      select: { id: true },
    });
    return Boolean(existing);
  }

  private async validateInternalLinks(
    links: Array<{ label: string; path: string }>,
  ): Promise<Array<{ label: string; path: string; valid: boolean }>> {
    const merged = [...STATIC_INTERNAL_LINKS, ...links];
    const seen = new Set<string>();
    const unique = merged.filter((l) => {
      const key = l.path.trim();
      if (!key.startsWith('/') || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const results: Array<{ label: string; path: string; valid: boolean }> = [];
    for (const link of unique.slice(0, 8)) {
      const valid = await this.pathExists(link.path);
      results.push({ ...link, valid });
    }
    return results;
  }

  private async pathExists(path: string): Promise<boolean> {
    const p = path.trim();
    if (!p.startsWith('/')) return false;
    const staticPaths = new Set([
      '/makleri',
      '/firmy',
      '/nemovitosti',
      '/aktuality',
      '/shorts',
      '/o-portalu',
      '/ubytovani',
    ]);
    if (staticPaths.has(p)) return true;
    if (p.startsWith('/aktuality/')) {
      const slug = p.slice('/aktuality/'.length);
      const row = await this.prisma.newsArticle.findFirst({
        where: { slug, status: 'PUBLISHED', indexable: true },
        select: { id: true },
      });
      return Boolean(row);
    }
    if (p.startsWith('/prispevek/')) {
      const slug = p.slice('/prispevek/'.length);
      const row = await this.prisma.post.findFirst({
        where: { slug, type: 'YOUTUBE_VIDEO', isIndexable: true } as Prisma.PostWhereInput,
        select: { id: true },
      });
      return Boolean(row);
    }
    if (p.startsWith('/nemovitosti/')) {
      const slug = p.slice('/nemovitosti/'.length);
      const row = await this.prisma.property.findFirst({
        where: { slug, deletedAt: null, approved: true },
        select: { id: true },
      });
      return Boolean(row);
    }
    return false;
  }

  private async findRelatedPosts(topicCluster: string | null, excludeVideoId: string): Promise<string[]> {
    if (!topicCluster) return [];
    const rows = await this.prisma.post.findMany({
      where: {
        type: 'YOUTUBE_VIDEO',
        editorialTopicCluster: topicCluster,
        youtubeVideoId: { not: excludeVideoId },
        publishedAt: { not: null },
      } as Prisma.PostWhereInput,
      orderBy: { seoQualityScore: 'desc' } as Prisma.PostOrderByWithRelationInput,
      take: 6,
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  private async generateArticleFeatureContent(
    input: YoutubeSeoPrepareInput,
    settings: YoutubeSeoGateSettings,
  ): Promise<{
    h1: string;
    perex: string;
    bodyMarkdown: string;
    seoTitle: string;
    seoDescription: string;
    internalLinks: Array<{ label: string; path: string }>;
  } | null> {
    const cleaned = sanitizeNewsSourceText(input.video.title, input.video.description);
    try {
      const ai = await this.openai.complete({
        feature: 'editorial_news',
        systemPrompt: `Jsi SEO redaktor českého realitního portálu XXREALIT.
Vytvoř originální český článek k YouTube videu. NIKDY nekopíruj YouTube popis ani titulek — použij je jen jako kontext.
Cíl: ${settings.minArticleWords}–${settings.maxArticleWords} slov informačního textu bez vaty.
Vrať pouze validní JSON s klíči: h1, perex, bodyMarkdown, seoTitle, seoDescription, internalLinks (pole {label, path}).
internalLinks: pouze cesty začínající / (např. /makleri, /aktuality, /nemovitosti).`,
        userPrompt: `Kanál: ${input.channelTitle}
YouTube titulek (kontext): ${cleaned.title}
YouTube popis (kontext, NEKOPÍROVAT): ${cleaned.summary.slice(0, 1500)}
Kategorie zdroje: ${input.source.category ?? 'reality'}
Perex/teaser: ${input.teaser}`,
        maxOutputTokens: 2500,
      });
      const parsed = JSON.parse(ai.text?.trim() ?? '{}') as {
        h1?: string;
        perex?: string;
        bodyMarkdown?: string;
        seoTitle?: string;
        seoDescription?: string;
        internalLinks?: Array<{ label: string; path: string }>;
      };
      const body = parsed.bodyMarkdown?.trim() ?? '';
      if (!parsed.h1?.trim() || countWords(body) < 120) return null;
      return {
        h1: parsed.h1.trim(),
        perex: parsed.perex?.trim() ?? input.teaser,
        bodyMarkdown: body,
        seoTitle: parsed.seoTitle?.trim() ?? `${parsed.h1.trim()} | XXREALIT`,
        seoDescription: parsed.seoDescription?.trim() ?? parsed.perex?.trim() ?? input.teaser,
        internalLinks: Array.isArray(parsed.internalLinks) ? parsed.internalLinks : [],
      };
    } catch (err) {
      this.log.warn(`Article feature AI failed: ${err instanceof Error ? err.message : err}`);
      return null;
    }
  }

  private buildVideoSchema(
    input: YoutubeSeoPrepareInput,
    gate: YoutubeSeoGateResult,
  ): Record<string, unknown> {
    return {
      '@context': 'https://schema.org',
      '@type': 'VideoObject',
      name: gate.h1 ?? input.video.title,
      description: gate.seoDescription ?? gate.perex,
      thumbnailUrl: input.video.thumbnailUrl,
      uploadDate: input.video.publishedAt?.toISOString(),
      embedUrl: `https://www.youtube.com/embed/${input.video.videoId}`,
      contentUrl: input.video.videoUrl,
      publisher: {
        '@type': 'Organization',
        name: 'XXREALIT',
      },
    };
  }
}
