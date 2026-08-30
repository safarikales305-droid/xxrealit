import { Injectable, Logger } from '@nestjs/common';
import {
  NewsSourceHealth,
  NewsSourceType,
  NewsYoutubePublishMode,
  PostSource,
  type NewsSource,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { OpenAiService } from '../openai/openai.service';
import { SocialPublishEnqueueService } from '../social/autopost/social-publish-enqueue.service';
import { PostsService } from '../posts/posts.service';
import { EditorialPortalPostService } from './editorial-portal-post.service';
import { NewsAuditService } from './news-audit.service';
import { NewsPublishMode } from '@prisma/client';
import { NewsEditorialSettingsService } from './news-editorial-settings.service';
import { scoreNewsRelevance } from './news-editorial.util';
import { sanitizeNewsSourceText } from './news-text-sanitizer.util';
import {
  buildYoutubeWatchUrl,
  fetchPlaylistVideos,
  fetchVideoDetails,
  getYouTubeApiKey,
  isValidYoutubeVideoId,
  resolveYoutubeChannel,
  testYouTubeApiConnection,
  YoutubeApiError,
  type YoutubeVideoMeta,
} from './news-youtube-api.util';
import {
  getLastYoutubeApiTest,
  getNewsWorkerHeartbeat,
  getNewsWorkerLastError,
  isNewsWorkerProcessing,
  setLastYoutubeApiTest,
  setNewsWorkerLastError,
} from './news-editorial-worker.state';
import { NewsSystemUserService } from './news-system-user.service';

export function isStaleYoutubeApiKeyError(message: string | null | undefined): boolean {
  if (!message?.trim()) return false;
  return /YOUTUBE_API_KEY|API key chybí|API key není|api key chybí/i.test(message);
}

export type YoutubeVideoDecision = {
  videoId: string;
  title: string;
  relevanceScore?: number;
  decision:
    | 'IMPORTED'
    | 'SKIPPED_DUPLICATE'
    | 'SKIPPED_LOW_RELEVANCE'
    | 'SKIPPED_NOT_EMBEDDABLE'
    | 'SKIPPED_DAILY_LIMIT'
    | 'SKIPPED_CREATE_POST_DISABLED'
    | 'SKIPPED_INVALID_VIDEO_ID'
    | 'ERROR';
  detail?: string;
  postId?: string;
};

export type YoutubeTestResult = {
  ok: boolean;
  channel?: { id: string; title: string; url: string };
  channelId?: string;
  uploadsPlaylistId?: string;
  channelResolution?: 'OK' | 'ERROR';
  api: 'OK' | 'FAIL' | 'MISSING_KEY';
  apiConfigured?: boolean;
  lastApiHttp?: number | null;
  lastApiError?: string | null;
  videosReturned?: number;
  error?: string;
  recentVideos?: Array<{
    videoId: string;
    title: string;
    publishedAt: string;
    thumbnailOk: boolean;
    embeddable: boolean;
    relevanceScore?: number;
  }>;
  latestVideo?: {
    videoId: string;
    title: string;
    publishedAt: string;
    thumbnailUrl: string;
    embeddable: boolean;
  } | null;
};

export type YoutubeImportResult = {
  ok: boolean;
  videoFound: boolean;
  duplicate: boolean;
  relevanceScore?: number;
  skippedReason?: string;
  portalPostId?: string;
  postId?: string;
  forceImportForTest?: boolean;
  steps: Array<{ step: string; status: 'PASS' | 'FAIL' | 'SKIP'; detail?: string }>;
};

export type YoutubeBackfillResult = {
  loaded: number;
  found: number;
  duplicates: number;
  lowRelevance: number;
  notEmbeddable: number;
  dailyLimit: number;
  created: number;
  new: number;
  imported: number;
  skipped: number;
  total: number;
  errors: number;
  postsCreated: string[];
  decisions: YoutubeVideoDecision[];
};

export type YoutubeDiagnoseResult = {
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  health: string;
  lastError: string | null;
  apiConfigured: boolean;
  apiStatus: 'OK' | 'ERROR' | 'MISSING_KEY';
  urlResolved: boolean;
  channelId: string | null;
  channelTitle: string | null;
  uploadsPlaylistId: string | null;
  lastApiHttp: number | null;
  lastApiError: string | null;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  videosReturned: number;
  eligible: number;
  duplicates: number;
  lowRelevance: number;
  imported: number;
  postsCreated: number;
  workerOnline: boolean;
  workerLastHeartbeat: string | null;
  candidates: YoutubeVideoDecision[];
};

@Injectable()
export class NewsYoutubeService {
  private readonly log = new Logger(NewsYoutubeService.name);
  private readonly syncLocks = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: NewsAuditService,
    private readonly settings: NewsEditorialSettingsService,
    private readonly openai: OpenAiService,
    private readonly socialPublish: SocialPublishEnqueueService,
    private readonly systemUser: NewsSystemUserService,
    private readonly posts: PostsService,
    private readonly editorialPosts: EditorialPortalPostService,
  ) {}

  private editorialError(code: string, message: string): Error {
    const err = new Error(message);
    (err as Error & { code: string }).code = code;
    return err;
  }

  private sourceMinRelevance(source: NewsSource): number {
    return source.minRelevanceScore ?? source.trustScore ?? 70;
  }

  private apiKeyStatus(): 'OK' | 'MISSING_KEY' {
    return getYouTubeApiKey() ? 'OK' : 'MISSING_KEY';
  }

  async clearStaleYoutubeSourceErrors(): Promise<{ cleared: number; historicalErrors: string[] }> {
    if (!getYouTubeApiKey()) return { cleared: 0, historicalErrors: [] };

    const sources = await this.prisma.newsSource.findMany({
      where: {
        type: NewsSourceType.YOUTUBE_CHANNEL,
        lastError: { not: null },
      },
      select: { id: true, lastError: true },
    });

    const historicalErrors: string[] = [];
    let cleared = 0;
    for (const source of sources) {
      if (!isStaleYoutubeApiKeyError(source.lastError)) continue;
      historicalErrors.push(source.lastError!);
      await this.prisma.newsSource.update({
        where: { id: source.id },
        data: {
          lastError: null,
          health: NewsSourceHealth.ACTIVE,
          failureCount: 0,
        },
      });
      cleared += 1;
    }

    const workerErr = getNewsWorkerLastError();
    if (workerErr && isStaleYoutubeApiKeyError(workerErr)) {
      historicalErrors.push(workerErr);
      setNewsWorkerLastError(null);
    }

    return { cleared, historicalErrors };
  }

  async testApiConnection() {
    const result = await testYouTubeApiConnection();
    const snapshot = {
      ok: result.ok,
      httpStatus: result.httpStatus,
      responseTimeMs: result.responseTimeMs,
      testedAt: new Date().toISOString(),
      error: result.error,
    };
    setLastYoutubeApiTest(snapshot);

    if (result.ok) {
      await this.clearStaleYoutubeSourceErrors();
    }

    return {
      ...snapshot,
      apiConfigured: Boolean(getYouTubeApiKey()),
      apiKey: 'configured',
    };
  }

  private isSourceDueForPoll(
    source: NewsSource,
    intervalMs: number,
    now: number,
    apiConfigured: boolean,
  ): boolean {
    if (apiConfigured && isStaleYoutubeApiKeyError(source.lastError)) return true;
    if (source.youtubeImportedCount === 0 && !source.lastSuccessAt) return true;
    if (!source.lastCheckedAt) return true;
    return now - source.lastCheckedAt.getTime() >= intervalMs;
  }

  async pollDueSources(limit = 15) {
    const cfg = this.settings.getCached();
    if (!cfg.youtubeMonitoringEnabled) return { polled: 0 };

    await this.publishDraftYoutubePosts(50);

    const intervalMs = (cfg.youtubeCheckIntervalMinutes ?? 10) * 60_000;
    const now = Date.now();
    const apiConfigured = Boolean(getYouTubeApiKey());
    if (apiConfigured) {
      await this.clearStaleYoutubeSourceErrors();
    }

    const sources = await this.prisma.newsSource.findMany({
      where: {
        type: NewsSourceType.YOUTUBE_CHANNEL,
        enabled: true,
        youtubeAutoImport: true,
        health: { notIn: [NewsSourceHealth.DISABLED] },
      },
      orderBy: [{ priority: 'desc' }, { lastCheckedAt: 'asc' }],
      take: limit * 3,
    });

    const due = sources
      .filter((s) => this.isSourceDueForPoll(s, intervalMs, now, apiConfigured))
      .slice(0, Math.max(1, limit));

    let processed = 0;
    let errors = 0;
    for (const source of due) {
      try {
        const result = await this.withSourceLock(source.id, () =>
          this.pollSource(source.id, { enqueueFacebook: true }),
        );
        if (result) processed += 1;
      } catch (err) {
        errors += 1;
        this.log.warn(
          `YouTube poll failed ${source.name}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    return { polled: processed, due: due.length, errors };
  }

  async syncAllActiveSources() {
    const sources = await this.prisma.newsSource.findMany({
      where: {
        type: NewsSourceType.YOUTUBE_CHANNEL,
        enabled: true,
        health: { notIn: [NewsSourceHealth.DISABLED] },
      },
      select: { id: true },
    });
    let processed = 0;
    let errors = 0;
    for (const source of sources) {
      try {
        const result = await this.withSourceLock(source.id, () =>
          this.pollSource(source.id, { enqueueFacebook: true, forcePoll: true }),
        );
        if (result) processed += 1;
      } catch {
        errors += 1;
      }
    }
    return { polled: processed, total: sources.length, errors };
  }

  async runInitialSync(sourceId: string) {
    const cfg = this.settings.getCached();
    const maxVideos = cfg.youtubeInitialSyncVideos ?? 30;
    return this.withSourceLock(sourceId, () =>
      this.pollSource(sourceId, {
        enqueueFacebook: true,
        maxVideos,
        forceAll: cfg.youtubeInitialSyncIgnoreRelevance ?? true,
        forcePoll: true,
        skipDailyLimit: true,
      }),
    );
  }

  private async withSourceLock<T>(
    sourceId: string,
    fn: () => Promise<T>,
  ): Promise<T | null> {
    if (this.syncLocks.has(sourceId)) {
      this.log.debug(`[youtube] sync skipped — already running source=${sourceId}`);
      return null;
    }
    this.syncLocks.add(sourceId);
    try {
      return await fn();
    } finally {
      this.syncLocks.delete(sourceId);
    }
  }

  private async publishDraftYoutubePosts(limit = 50): Promise<number> {
    const drafts = await this.prisma.post.findMany({
      where: { type: 'YOUTUBE_VIDEO', publishedAt: null, youtubeVideoId: { not: null } },
      select: { id: true, userId: true, createdAt: true },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
    let published = 0;
    for (const post of drafts) {
      try {
        await this.prisma.post.update({
          where: { id: post.id },
          data: { publishedAt: post.createdAt ?? new Date() },
        });
        this.posts.finalizeEditorialPost(post.userId, post.id);
        published += 1;
      } catch (err) {
        this.log.warn(
          `YouTube draft publish ${post.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    return published;
  }

  async pollSourceNow(sourceId: string, opts?: { maxVideos?: number; ignoreRelevance?: boolean }) {
    return this.pollSource(sourceId, {
      enqueueFacebook: true,
      maxVideos: opts?.maxVideos,
      forceAll: opts?.ignoreRelevance ?? false,
      forcePoll: true,
    });
  }

  async pollSource(
    sourceId: string,
    opts?: {
      enqueueFacebook?: boolean;
      maxVideos?: number;
      forceAll?: boolean;
      forcePoll?: boolean;
      skipDailyLimit?: boolean;
    },
  ) {
    const source = await this.prisma.newsSource.findUnique({ where: { id: sourceId } });
    if (!source || source.type !== NewsSourceType.YOUTUBE_CHANNEL) {
      throw new Error('Zdroj není YouTube kanál.');
    }

    if (!getYouTubeApiKey()) {
      await this.markSourceConfigError(sourceId, 'YOUTUBE_API_KEY chybí nebo není platný.');
      throw new YoutubeApiError('YOUTUBE_API_KEY není nastaveno.', 0);
    }

    const cfg = this.settings.getCached();
    const isFirstSync = !source.lastVideoId && source.youtubeImportedCount === 0;

    const channel = await resolveYoutubeChannel(source.url, source.channelId);
    const channelPatch: {
      channelId: string;
      uploadsPlaylistId?: string;
      youtubeChannelTitle?: string;
      health: NewsSourceHealth;
      lastError: null;
    } = {
      channelId: channel.channelId,
      health: NewsSourceHealth.ACTIVE,
      lastError: null,
    };
    if (channel.uploadsPlaylistId) channelPatch.uploadsPlaylistId = channel.uploadsPlaylistId;
    if (channel.channelTitle) channelPatch.youtubeChannelTitle = channel.channelTitle;
    if (!source.channelId || source.channelId !== channel.channelId || !source.uploadsPlaylistId) {
      await this.prisma.newsSource.update({
        where: { id: sourceId },
        data: channelPatch,
      });
    }

    const uploadsPlaylistId = channel.uploadsPlaylistId ?? source.uploadsPlaylistId;
    if (!uploadsPlaylistId) {
      throw new YoutubeApiError('Uploads playlist kanálu není dostupný.', 404);
    }
    const maxVideos =
      opts?.maxVideos ??
      (isFirstSync ? (cfg.youtubeInitialSyncVideos ?? 30) : 10);
    const publishedAfter = isFirstSync ? null : source.lastVideoPublishedAt;
    const forceAll =
      opts?.forceAll ??
      (isFirstSync && (cfg.youtubeInitialSyncIgnoreRelevance ?? true));

    const videos = await fetchPlaylistVideos(
      uploadsPlaylistId,
      maxVideos,
      publishedAfter,
    );

    let created = 0;
    let skipped = 0;
    let duplicates = 0;

    for (const video of videos.sort(
      (a, b) => a.publishedAt.getTime() - b.publishedAt.getTime(),
    )) {
      const result = await this.processVideo(source, video, channel.channelTitle, {
        enqueueFacebook: opts?.enqueueFacebook ?? false,
        forceAll,
        forceImportForTest: false,
        skipDailyLimit: opts?.skipDailyLimit ?? isFirstSync,
      });
      if (result.created) created += 1;
      else {
        skipped += 1;
        if (result.reason === 'SKIP_DUPLICATE') duplicates += 1;
      }

      await this.prisma.newsSource.update({
        where: { id: sourceId },
        data: {
          lastVideoId: video.videoId,
          lastVideoPublishedAt: video.publishedAt,
          lastSuccessAt: new Date(),
          lastError: null,
          failureCount: 0,
          health: NewsSourceHealth.ACTIVE,
        },
      });
    }

    if (!videos.length) {
      await this.prisma.newsSource.update({
        where: { id: sourceId },
        data: {
          lastCheckedAt: new Date(),
          lastSuccessAt: new Date(),
          lastError: null,
          health: NewsSourceHealth.ACTIVE,
        },
      });
    } else {
      await this.prisma.newsSource.update({
        where: { id: sourceId },
        data: {
          lastCheckedAt: new Date(),
          lastSuccessAt: new Date(),
          lastError: null,
          failureCount: 0,
          health: NewsSourceHealth.ACTIVE,
        },
      });
    }

    await this.audit.log('YOUTUBE_POLL', `YouTube ${source.name}: ${created} nových, ${skipped} přeskočeno`, {
      metadata: { sourceId, created, skipped, dailyLimit: cfg.youtubeMaxPostsPerDay, videosFound: videos.length },
    });

    return {
      sourceId,
      created,
      skipped,
      checked: videos.length,
      found: videos.length,
      new: created,
      duplicates,
      alreadyExisted: duplicates,
      message: `Kontrola dokončena: nalezeno ${videos.length} videí, ${created} nových importováno, ${duplicates} již existovalo, ${skipped - duplicates} přeskočeno.`,
    };
  }

  private mapSkipReason(reason?: string): YoutubeVideoDecision['decision'] {
    switch (reason) {
      case 'SKIP_DUPLICATE':
        return 'SKIPPED_DUPLICATE';
      case 'LOW_RELEVANCE':
        return 'SKIPPED_LOW_RELEVANCE';
      case 'NOT_EMBEDDABLE':
        return 'SKIPPED_NOT_EMBEDDABLE';
      case 'DAILY_LIMIT':
        return 'SKIPPED_DAILY_LIMIT';
      case 'CREATE_POST_DISABLED':
        return 'SKIPPED_CREATE_POST_DISABLED';
      case 'INVALID_VIDEO_ID':
        return 'SKIPPED_INVALID_VIDEO_ID';
      default:
        return 'ERROR';
    }
  }

  private async processVideo(
    source: NewsSource,
    video: YoutubeVideoMeta,
    channelTitle: string,
    opts: {
      enqueueFacebook: boolean;
      forceAll: boolean;
      forceImportForTest: boolean;
      skipDailyLimit?: boolean;
    },
  ): Promise<{ created: boolean; reason?: string; relevanceScore?: number; postId?: string }> {
    if (!isValidYoutubeVideoId(video.videoId)) {
      return { created: false, reason: 'INVALID_VIDEO_ID' };
    }

    const existing = await this.prisma.post.findUnique({
      where: { youtubeVideoId: video.videoId },
      select: { id: true, publishedAt: true },
    });
    if (existing) {
      await this.ensureYoutubePostFeedVisible(existing.id, video, existing.publishedAt);
      return { created: false, reason: 'SKIP_DUPLICATE' };
    }

    const cfg = this.settings.getCached();
    if (
      !opts.forceImportForTest &&
      !opts.skipDailyLimit &&
      !(await this.canPublishYoutubeToday(cfg.youtubeMaxPostsPerDay))
    ) {
      return { created: false, reason: 'DAILY_LIMIT' };
    }

    const relevanceScore = await this.scoreVideoRelevance(video, source.category);
    const minRelevance = Math.max(
      this.sourceMinRelevance(source),
      cfg.youtubeMinRelevance ?? 70,
    );
    const publishAll =
      opts.forceAll ||
      opts.forceImportForTest ||
      source.youtubePublishMode === NewsYoutubePublishMode.ALL;

    if (!publishAll && relevanceScore < minRelevance) {
      return { created: false, reason: 'LOW_RELEVANCE', relevanceScore };
    }

    const createPost = source.youtubeCreatePost && cfg.youtubeCreatePortalPost !== false;
    if (!createPost && !opts.forceImportForTest) {
      return { created: false, reason: 'CREATE_POST_DISABLED', relevanceScore };
    }

    const teaser = await this.generateTeaser(video);
    let postId: string;
    try {
      const bodyText = await this.generateVideoBody(video, teaser);
      const created = await this.editorialPosts.createPostFromYoutubeVideo({
        video,
        channelTitle,
        teaser,
        bodyText,
        source,
        forcePublish: opts.forceImportForTest,
      });
      if (!created.ok || !created.postId) {
        return {
          created: false,
          reason: created.reason ?? 'ARTICLE_CREATE_FAILED',
          relevanceScore,
        };
      }
      postId = created.postId;
    } catch (err) {
      const code = (err as Error & { code?: string }).code ?? 'ARTICLE_CREATE_FAILED';
      return { created: false, reason: code, relevanceScore };
    }

    const enqueueFb =
      opts.enqueueFacebook &&
      source.youtubeFacebookPost &&
      cfg.youtubeCreateFacebookPost !== false;

    if (enqueueFb && postId) {
      await this.socialPublish.enqueueManual({
        contentType: 'POST',
        contentId: postId,
        force: false,
      });
    }

    await this.prisma.newsSource.update({
      where: { id: source.id },
      data: { youtubeImportedCount: { increment: 1 } },
    });

    return { created: true, relevanceScore, postId };
  }

  private async ensureYoutubePostFeedVisible(
    postId: string,
    video: YoutubeVideoMeta,
    currentPublishedAt: Date | null,
  ) {
    await this.prisma.post.update({
      where: { id: postId },
      data: {
        publishedAt: currentPublishedAt ?? video.publishedAt ?? new Date(),
        youtubeThumbnailUrl: video.thumbnailUrl,
        youtubeEmbeddable: video.embeddable,
        youtubeChannelId: video.channelId,
        youtubeChannelTitle: video.channelTitle,
      },
    });
  }

  private async canPublishYoutubeToday(maxPerDay: number): Promise<boolean> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const count = await this.prisma.post.count({
      where: { type: 'YOUTUBE_VIDEO', publishedAt: { gte: todayStart } },
    });
    return count < maxPerDay;
  }

  async scoreVideoRelevance(video: YoutubeVideoMeta, category?: string | null): Promise<number> {
    const base = scoreNewsRelevance(video.title, video.description);
    const catBoost = category ? 5 : 0;
    return Math.min(100, base + catBoost);
  }

  async generateTeaser(video: YoutubeVideoMeta): Promise<string> {
    const cfg = this.settings.getCached();
    if (cfg.youtubeUseAiTeaser === false) {
      return `Nové video „${video.title}“ na kanálu ${video.channelTitle}.`;
    }

    const cleaned = sanitizeNewsSourceText(video.title, video.description);
    const title = cleaned.title;
    const description = cleaned.summary.slice(0, 1200);

    try {
      const ai = await this.openai.complete({
        feature: 'editorial_news',
        systemPrompt:
          'Jsi redaktor českého realitního portálu XXREALIT. Napiš 1–2 věty českého teasera k YouTube videu. Nevymýšlej fakta mimo poskytnutá metadata. Bez URL a hashtagů.',
        userPrompt: `Kanál: ${video.channelTitle}\nTitulek: ${title}\nPopis:\n${description}`,
        maxOutputTokens: 200,
      });
      const text = ai.text?.trim();
      if (text && text.length >= 20) return text.slice(0, 400);
    } catch (err) {
      this.log.warn(`YouTube teaser AI failed: ${err instanceof Error ? err.message : err}`);
    }
    return `Nové video „${title}“ na kanálu ${video.channelTitle}.`;
  }

  async generateVideoBody(video: YoutubeVideoMeta, teaser: string): Promise<string> {
    const cleaned = sanitizeNewsSourceText(video.title, video.description);
    const description = cleaned.summary.slice(0, 2000);

    try {
      const ai = await this.openai.complete({
        feature: 'editorial_news',
        systemPrompt:
          'Jsi redaktor českého realitního portálu XXREALIT. Napiš 2–4 odstavce českého doprovodného textu k YouTube videu. Používej pouze fakta z metadat. Bez URL, hashtagů a technického JSON. Text musí být čitelný a věcný.',
        userPrompt: `Kanál: ${video.channelTitle}\nTitulek: ${cleaned.title}\nPerex: ${teaser}\nPopis videa:\n${description}`,
        maxOutputTokens: 600,
      });
      const text = ai.text?.trim();
      if (text && text.length >= 80) return text.slice(0, 2500);
    } catch (err) {
      this.log.warn(`YouTube body AI failed: ${err instanceof Error ? err.message : err}`);
    }

    return [teaser, description.slice(0, 600)].filter(Boolean).join('\n\n');
  }

  private async markSourceConfigError(sourceId: string, message: string) {
    await this.prisma.newsSource.update({
      where: { id: sourceId },
      data: {
        lastError: message,
        failureCount: { increment: 1 },
        health: NewsSourceHealth.ERROR,
      },
    });
  }

  private async markSourceError(sourceId: string, message: string) {
    await this.prisma.newsSource.update({
      where: { id: sourceId },
      data: {
        lastError: message,
        failureCount: { increment: 1 },
        health: NewsSourceHealth.DEGRADED,
      },
    });
  }

  private async evaluateCandidates(
    source: NewsSource,
    videos: YoutubeVideoMeta[],
    opts?: { ignoreRelevance?: boolean; forceImportForTest?: boolean },
  ): Promise<YoutubeVideoDecision[]> {
    const cfg = this.settings.getCached();
    const minRelevance = Math.max(
      this.sourceMinRelevance(source),
      cfg.youtubeMinRelevance ?? 70,
    );
    const publishAll =
      opts?.ignoreRelevance ||
      opts?.forceImportForTest ||
      source.youtubePublishMode === NewsYoutubePublishMode.ALL;

    const decisions: YoutubeVideoDecision[] = [];

    for (const video of videos) {
      const relevanceScore = await this.scoreVideoRelevance(video, source.category);
      const existing = await this.prisma.post.findUnique({
        where: { youtubeVideoId: video.videoId },
        select: { id: true },
      });
      if (existing) {
        decisions.push({
          videoId: video.videoId,
          title: video.title,
          relevanceScore,
          decision: 'SKIPPED_DUPLICATE',
          detail: existing.id,
        });
        continue;
      }
      if (!publishAll && relevanceScore < minRelevance) {
        decisions.push({
          videoId: video.videoId,
          title: video.title,
          relevanceScore,
          decision: 'SKIPPED_LOW_RELEVANCE',
          detail: `Min ${minRelevance}`,
        });
        continue;
      }
      decisions.push({
        videoId: video.videoId,
        title: video.title,
        relevanceScore,
        decision: 'IMPORTED',
        detail: video.embeddable ? 'embeddable' : 'not_embeddable_but_importable',
      });
    }

    return decisions;
  }

  async testChannel(sourceId: string): Promise<YoutubeTestResult> {
    const source = await this.prisma.newsSource.findUnique({ where: { id: sourceId } });
    if (!source || source.type !== NewsSourceType.YOUTUBE_CHANNEL) {
      return { ok: false, api: 'FAIL', error: 'Zdroj není YouTube kanál.' };
    }

    const apiConfigured = Boolean(getYouTubeApiKey());
    if (!apiConfigured) {
      return {
        ok: false,
        api: 'MISSING_KEY',
        apiConfigured: false,
        channelResolution: 'ERROR',
        error: 'YouTube API key chybí / není platný.',
      };
    }

    try {
      const channel = await resolveYoutubeChannel(source.url, source.channelId);
      const videos = await fetchPlaylistVideos(channel.uploadsPlaylistId, 10);
      const latest = videos[0] ?? null;

      if (channel.channelId !== source.channelId) {
        await this.prisma.newsSource.update({
          where: { id: sourceId },
          data: {
            channelId: channel.channelId,
            health: NewsSourceHealth.ACTIVE,
            lastError: null,
            failureCount: 0,
          },
        });
      }

      const recentWithScores = await Promise.all(
        videos.map(async (v) => ({
          videoId: v.videoId,
          title: v.title,
          publishedAt: v.publishedAt.toISOString(),
          thumbnailOk: Boolean(v.thumbnailUrl),
          embeddable: v.embeddable,
          relevanceScore: await this.scoreVideoRelevance(v, source.category),
        })),
      );

      return {
        ok: true,
        api: 'OK',
        apiConfigured: true,
        channelResolution: 'OK',
        channel: { id: channel.channelId, title: channel.channelTitle, url: source.url },
        channelId: channel.channelId,
        uploadsPlaylistId: channel.uploadsPlaylistId,
        videosReturned: videos.length,
        recentVideos: recentWithScores,
        latestVideo: latest
          ? {
              videoId: latest.videoId,
              title: latest.title,
              publishedAt: latest.publishedAt.toISOString(),
              thumbnailUrl: latest.thumbnailUrl,
              embeddable: latest.embeddable,
            }
          : null,
      };
    } catch (err) {
      const httpStatus = err instanceof YoutubeApiError ? err.httpStatus : null;
      const message = err instanceof Error ? err.message : String(err);
      await this.markSourceError(sourceId, message);
      return {
        ok: false,
        api: 'FAIL',
        apiConfigured: true,
        channelResolution: 'ERROR',
        lastApiHttp: httpStatus,
        lastApiError: message,
        error: message,
      };
    }
  }

  async testImportOne(
    sourceId: string,
    opts?: { forceImportForTest?: boolean },
  ): Promise<YoutubeImportResult> {
    const forceImportForTest = opts?.forceImportForTest !== false;
    const steps: YoutubeImportResult['steps'] = [];
    const source = await this.prisma.newsSource.findUnique({ where: { id: sourceId } });
    if (!source || source.type !== NewsSourceType.YOUTUBE_CHANNEL) {
      return {
        ok: false,
        videoFound: false,
        duplicate: false,
        steps: [{ step: 'SOURCE', status: 'FAIL', detail: 'Neplatný zdroj' }],
      };
    }

    if (!getYouTubeApiKey()) {
      return {
        ok: false,
        videoFound: false,
        duplicate: false,
        steps: [{ step: 'API', status: 'FAIL', detail: 'YOUTUBE_API_KEY chybí' }],
      };
    }

    try {
      const channel = await resolveYoutubeChannel(source.url, source.channelId);
      steps.push({
        step: 'CHANNEL',
        status: 'PASS',
        detail: `${channel.channelTitle} (${channel.channelId})`,
      });

      if (channel.channelId !== source.channelId) {
        await this.prisma.newsSource.update({
          where: { id: sourceId },
          data: { channelId: channel.channelId, health: NewsSourceHealth.ACTIVE, lastError: null },
        });
      }

      const videos = await fetchPlaylistVideos(channel.uploadsPlaylistId, 1);
      if (!videos.length) {
        return {
          ok: false,
          videoFound: false,
          duplicate: false,
          steps: [...steps, { step: 'VIDEO', status: 'FAIL', detail: 'Žádné video v playlistu' }],
        };
      }
      const video = videos[0]!;
      steps.push({ step: 'VIDEO', status: 'PASS', detail: video.videoId });

      const dup = await this.prisma.post.findUnique({
        where: { youtubeVideoId: video.videoId },
        select: { id: true },
      });
      if (dup) {
        return {
          ok: true,
          videoFound: true,
          duplicate: true,
          portalPostId: dup.id,
          postId: dup.id,
          forceImportForTest,
          steps: [...steps, { step: 'DUPLICATE', status: 'SKIP', detail: dup.id }],
        };
      }

      const relevanceScore = await this.scoreVideoRelevance(video, source.category);
      steps.push({ step: 'RELEVANCE', status: 'PASS', detail: String(relevanceScore) });

      const result = await this.processVideo(source, video, channel.channelTitle, {
        enqueueFacebook: false,
        forceAll: forceImportForTest,
        forceImportForTest,
      });

      if (!result.created) {
        const reason = result.reason ?? 'UNKNOWN';
        steps.push({ step: 'IMPORT', status: 'SKIP', detail: reason });
        return {
          ok: false,
          videoFound: true,
          duplicate: false,
          relevanceScore,
          skippedReason: reason,
          forceImportForTest,
          steps,
        };
      }

      steps.push({ step: 'PORTAL_POST', status: 'PASS', detail: result.postId });
      steps.push({ step: 'FACEBOOK', status: 'SKIP', detail: 'Test bez FB' });
      steps.push({ step: 'FEED', status: 'PASS' });
      steps.push({ step: 'PLAYER', status: video.embeddable ? 'PASS' : 'SKIP' });

      await this.prisma.newsSource.update({
        where: { id: sourceId },
        data: {
          health: NewsSourceHealth.ACTIVE,
          lastError: null,
          lastSuccessAt: new Date(),
          lastVideoId: video.videoId,
          lastVideoPublishedAt: video.publishedAt,
        },
      });

      return {
        ok: true,
        videoFound: true,
        duplicate: false,
        relevanceScore,
        portalPostId: result.postId,
        postId: result.postId,
        forceImportForTest,
        steps,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.markSourceError(sourceId, message);
      steps.push({ step: 'PIPELINE', status: 'FAIL', detail: message });
      return { ok: false, videoFound: false, duplicate: false, forceImportForTest, steps };
    }
  }

  async testPipeline(sourceId: string): Promise<YoutubeImportResult> {
    return this.testImportOne(sourceId, { forceImportForTest: true });
  }

  async backfillRecent(
    sourceId: string,
    count: number,
    opts?: { ignoreRelevance?: boolean },
  ): Promise<YoutubeBackfillResult> {
    const safeCount = Math.min(50, Math.max(1, count));
    const source = await this.prisma.newsSource.findUnique({ where: { id: sourceId } });
    if (!source || source.type !== NewsSourceType.YOUTUBE_CHANNEL) {
      throw new Error('Zdroj není YouTube kanál.');
    }

    if (!getYouTubeApiKey()) {
      throw new YoutubeApiError('YOUTUBE_API_KEY chybí.', 0);
    }

    const channel = await resolveYoutubeChannel(source.url, source.channelId);
    if (channel.channelId !== source.channelId) {
      await this.prisma.newsSource.update({
        where: { id: sourceId },
        data: { channelId: channel.channelId, health: NewsSourceHealth.ACTIVE, lastError: null },
      });
    }

    const videos = await fetchPlaylistVideos(channel.uploadsPlaylistId, safeCount, null);
    const decisions: YoutubeVideoDecision[] = [];
    let created = 0;
    let skipped = 0;
    let duplicates = 0;
    let lowRelevance = 0;
    let notEmbeddable = 0;
    let dailyLimit = 0;
    let errors = 0;
    const postsCreated: string[] = [];

    for (const video of videos) {
      try {
        const relevanceScore = await this.scoreVideoRelevance(video, source.category);
        const result = await this.processVideo(source, video, channel.channelTitle, {
          enqueueFacebook: false,
          forceAll: opts?.ignoreRelevance ?? false,
          forceImportForTest: opts?.ignoreRelevance ?? false,
        });

        if (result.created && result.postId) {
          created += 1;
          postsCreated.push(result.postId);
          decisions.push({
            videoId: video.videoId,
            title: video.title,
            relevanceScore: result.relevanceScore,
            decision: 'IMPORTED',
            postId: result.postId,
          });
        } else {
          skipped += 1;
          const decision = this.mapSkipReason(result.reason);
          if (decision === 'SKIPPED_DUPLICATE') duplicates += 1;
          if (decision === 'SKIPPED_LOW_RELEVANCE') lowRelevance += 1;
          if (decision === 'SKIPPED_NOT_EMBEDDABLE') notEmbeddable += 1;
          if (decision === 'SKIPPED_DAILY_LIMIT') dailyLimit += 1;
          decisions.push({
            videoId: video.videoId,
            title: video.title,
            relevanceScore: result.relevanceScore ?? relevanceScore,
            decision,
            detail: result.reason,
          });
        }
      } catch (err) {
        errors += 1;
        skipped += 1;
        decisions.push({
          videoId: video.videoId,
          title: video.title,
          decision: 'ERROR',
          detail: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (created > 0 || videos.length > 0) {
      const latest = videos[0];
      await this.prisma.newsSource.update({
        where: { id: sourceId },
        data: {
          health: NewsSourceHealth.ACTIVE,
          lastError: null,
          lastSuccessAt: new Date(),
          lastCheckedAt: new Date(),
          ...(latest
            ? { lastVideoId: latest.videoId, lastVideoPublishedAt: latest.publishedAt }
            : {}),
        },
      });
    }

    return {
      loaded: videos.length,
      found: videos.length,
      duplicates,
      lowRelevance,
      notEmbeddable,
      dailyLimit,
      created,
      new: created,
      imported: created,
      skipped,
      total: videos.length,
      errors,
      postsCreated,
      decisions,
    };
  }

  async diagnoseSource(sourceId: string): Promise<YoutubeDiagnoseResult> {
    const source = await this.prisma.newsSource.findUnique({ where: { id: sourceId } });
    if (!source || source.type !== NewsSourceType.YOUTUBE_CHANNEL) {
      throw new Error('Zdroj není YouTube kanál.');
    }

    const apiConfigured = Boolean(getYouTubeApiKey());
    const heartbeat = getNewsWorkerHeartbeat();
    const base: YoutubeDiagnoseResult = {
      sourceId: source.id,
      sourceName: source.name,
      sourceUrl: source.url,
      health: source.health,
      lastError: source.lastError,
      apiConfigured,
      apiStatus: apiConfigured ? 'OK' : 'MISSING_KEY',
      urlResolved: false,
      channelId: source.channelId,
      channelTitle: null,
      uploadsPlaylistId: null,
      lastApiHttp: null,
      lastApiError: source.lastError,
      lastCheckedAt: source.lastCheckedAt?.toISOString() ?? null,
      lastSuccessAt: source.lastSuccessAt?.toISOString() ?? null,
      videosReturned: 0,
      eligible: 0,
      duplicates: 0,
      lowRelevance: 0,
      imported: source.youtubeImportedCount,
      postsCreated: source.youtubeImportedCount,
      workerOnline: heartbeat != null && Date.now() - heartbeat.getTime() < 5 * 60_000,
      workerLastHeartbeat: heartbeat?.toISOString() ?? null,
      candidates: [],
    };

    if (!apiConfigured) return base;

    try {
      const channel = await resolveYoutubeChannel(source.url, source.channelId);
      const videos = await fetchPlaylistVideos(channel.uploadsPlaylistId, 10, null);
      const candidates = await this.evaluateCandidates(source, videos);

      if (channel.channelId !== source.channelId) {
        await this.prisma.newsSource.update({
          where: { id: sourceId },
          data: { channelId: channel.channelId, health: NewsSourceHealth.ACTIVE, lastError: null },
        });
      }

      return {
        ...base,
        apiStatus: 'OK',
        urlResolved: true,
        channelId: channel.channelId,
        channelTitle: channel.channelTitle,
        uploadsPlaylistId: channel.uploadsPlaylistId,
        lastApiError: null,
        health: NewsSourceHealth.ACTIVE,
        videosReturned: videos.length,
        eligible: candidates.filter((c) => c.decision === 'IMPORTED').length,
        duplicates: candidates.filter((c) => c.decision === 'SKIPPED_DUPLICATE').length,
        lowRelevance: candidates.filter((c) => c.decision === 'SKIPPED_LOW_RELEVANCE').length,
        candidates,
      };
    } catch (err) {
      const httpStatus = err instanceof YoutubeApiError ? err.httpStatus : null;
      const message = err instanceof Error ? err.message : String(err);
      await this.markSourceError(sourceId, message);
      return {
        ...base,
        apiStatus: 'ERROR',
        lastApiHttp: httpStatus,
        lastApiError: message,
      };
    }
  }

  async getAdminStatus() {
    const apiConfigured = Boolean(getYouTubeApiKey());
    const { historicalErrors } = apiConfigured
      ? await this.clearStaleYoutubeSourceErrors()
      : { historicalErrors: [] as string[] };

    const heartbeat = getNewsWorkerHeartbeat();
    const cfg = this.settings.getCached();
    const now = Date.now();

    const sources = await this.prisma.newsSource.findMany({
      where: { type: NewsSourceType.YOUTUBE_CHANNEL },
      select: {
        id: true,
        name: true,
        enabled: true,
        health: true,
        lastCheckedAt: true,
        lastSuccessAt: true,
        lastError: true,
        youtubeImportedCount: true,
        checkIntervalMinutes: true,
      },
    });

    const active = sources.filter((s) => s.enabled);
    const dueForPoll = active.filter((s) =>
      this.isSourceDueForPoll(
        s as NewsSource,
        (s.checkIntervalMinutes ?? 30) * 60_000,
        now,
        apiConfigured,
      ),
    );

    const lastChecked = sources
      .map((s) => s.lastCheckedAt)
      .filter((d): d is Date => d != null)
      .sort((a, b) => b.getTime() - a.getTime())[0];

    const lastSuccessfulCheck = sources
      .map((s) => s.lastSuccessAt)
      .filter((d): d is Date => d != null)
      .sort((a, b) => b.getTime() - a.getTime())[0];

    const currentErrorSource = sources
      .filter((s) => s.lastError && !isStaleYoutubeApiKeyError(s.lastError))
      .sort((a, b) => (b.lastCheckedAt?.getTime() ?? 0) - (a.lastCheckedAt?.getTime() ?? 0))[0];

    const workerErr = getNewsWorkerLastError();
    const currentError =
      currentErrorSource?.lastError ??
      (workerErr && !isStaleYoutubeApiKeyError(workerErr) ? workerErr : null);

    const lastHistoricalError = historicalErrors[0] ?? null;
    const apiTest = getLastYoutubeApiTest();
    const systemAuthor = await this.systemUser.getSystemAuthorStatus();

    return {
      apiConfigured,
      apiStatus: apiConfigured ? 'Configured' : 'Missing',
      apiTestStatus: apiTest?.ok ? 'OK' : apiTest ? 'ERROR' : null,
      apiTestHttp: apiTest?.httpStatus ?? null,
      apiTestResponseTimeMs: apiTest?.responseTimeMs ?? null,
      apiTestedAt: apiTest?.testedAt ?? null,
      workerRunning: heartbeat != null && Date.now() - heartbeat.getTime() < 5 * 60_000,
      workerLastHeartbeat: heartbeat?.toISOString() ?? null,
      activeSources: active.length,
      sourcesDueForPoll: dueForPoll.length,
      queueCount: dueForPoll.length,
      queueStatus: {
        waiting: dueForPoll.length,
        active: isNewsWorkerProcessing() ? 1 : 0,
        completed: sources.filter((s) => s.lastSuccessAt).length,
        failed: sources.filter(
          (s) => s.health === NewsSourceHealth.ERROR || s.health === NewsSourceHealth.DEGRADED,
        ).length,
        retrying: 0,
      },
      youtubeSources: sources.length,
      lastCheck: lastChecked?.toISOString() ?? null,
      lastSuccessfulCheck: lastSuccessfulCheck?.toISOString() ?? null,
      currentError,
      lastHistoricalError,
      lastError: currentError,
      totalImported: sources.reduce((sum, s) => sum + s.youtubeImportedCount, 0),
      pollingIntervalMinutes: cfg.youtubeCheckIntervalMinutes ?? 30,
      systemAuthor: {
        ok: systemAuthor.ok,
        status: systemAuthor.ok ? 'OK' : 'ERROR',
        name: systemAuthor.name,
        userId: systemAuthor.userId,
        error: systemAuthor.error ?? null,
        errorCode: systemAuthor.errorCode ?? null,
      },
    };
  }

  async getVideoMeta(videoId: string) {
    if (!isValidYoutubeVideoId(videoId)) return null;
    const rows = await fetchVideoDetails([videoId]);
    return rows[0] ?? null;
  }
}
