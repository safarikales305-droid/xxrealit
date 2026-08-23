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
import { NewsAuditService } from './news-audit.service';
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: NewsAuditService,
    private readonly settings: NewsEditorialSettingsService,
    private readonly openai: OpenAiService,
    private readonly socialPublish: SocialPublishEnqueueService,
  ) {}

  private resolveSystemUserId(): string | null {
    return process.env.PORTAL_SYSTEM_USER_ID?.trim() || null;
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

  async pollDueSources(limit = 3) {
    const cfg = this.settings.getCached();
    if (!cfg.youtubeMonitoringEnabled) return { polled: 0 };

    const intervalMs = (cfg.youtubeCheckIntervalMinutes ?? 30) * 60_000;
    const now = Date.now();
    const apiConfigured = Boolean(getYouTubeApiKey());
    if (apiConfigured) {
      await this.clearStaleYoutubeSourceErrors();
    }

    const sources = await this.prisma.newsSource.findMany({
      where: {
        type: NewsSourceType.YOUTUBE_CHANNEL,
        enabled: true,
        health: { notIn: [NewsSourceHealth.DISABLED] },
      },
      orderBy: [{ priority: 'desc' }, { lastCheckedAt: 'asc' }],
      take: limit * 3,
    });

    const due = sources
      .filter((s) => this.isSourceDueForPoll(s, intervalMs, now, apiConfigured))
      .slice(0, limit);

    let processed = 0;
    for (const source of due) {
      try {
        await this.pollSource(source.id, { enqueueFacebook: true });
        processed += 1;
      } catch (err) {
        this.log.warn(
          `YouTube poll failed ${source.name}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    return { polled: processed, due: due.length };
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
    if (!source.channelId || source.channelId !== channel.channelId) {
      await this.prisma.newsSource.update({
        where: { id: sourceId },
        data: { channelId: channel.channelId, health: NewsSourceHealth.ACTIVE, lastError: null },
      });
    }

    const maxVideos =
      opts?.maxVideos ??
      (isFirstSync ? (cfg.youtubeInitialSyncVideos ?? 5) : 5);
    const publishedAfter = isFirstSync ? null : source.lastVideoPublishedAt;
    const forceAll =
      opts?.forceAll ??
      (isFirstSync && (cfg.youtubeInitialSyncIgnoreRelevance ?? true));

    const videos = await fetchPlaylistVideos(
      channel.uploadsPlaylistId,
      maxVideos,
      publishedAfter,
    );

    let created = 0;
    let skipped = 0;

    for (const video of videos.sort(
      (a, b) => a.publishedAt.getTime() - b.publishedAt.getTime(),
    )) {
      const result = await this.processVideo(source, video, channel.channelTitle, {
        enqueueFacebook: opts?.enqueueFacebook ?? false,
        forceAll,
        forceImportForTest: false,
      });
      if (result.created) created += 1;
      else skipped += 1;

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

    return { sourceId, created, skipped, checked: videos.length };
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
    opts: { enqueueFacebook: boolean; forceAll: boolean; forceImportForTest: boolean },
  ): Promise<{ created: boolean; reason?: string; relevanceScore?: number; postId?: string }> {
    if (!isValidYoutubeVideoId(video.videoId)) {
      return { created: false, reason: 'INVALID_VIDEO_ID' };
    }

    const existing = await this.prisma.post.findUnique({
      where: { youtubeVideoId: video.videoId },
      select: { id: true },
    });
    if (existing) return { created: false, reason: 'SKIP_DUPLICATE' };

    const cfg = this.settings.getCached();
    if (!opts.forceImportForTest && !(await this.canPublishYoutubeToday(cfg.youtubeMaxPostsPerDay))) {
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
    const postId = await this.createYoutubePost({
      video,
      channelTitle,
      teaser,
      category: source.category,
      sourceName: source.name,
    });

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

  private async createYoutubePost(input: {
    video: YoutubeVideoMeta;
    channelTitle: string;
    teaser: string;
    category?: string | null;
    sourceName: string;
  }): Promise<string> {
    const systemUserId = this.resolveSystemUserId();
    if (!systemUserId) throw new Error('PORTAL_SYSTEM_USER_ID chybí');

    const cfg = this.settings.getCached();
    const siteBase = process.env.PUBLIC_SITE_URL?.replace(/\/$/, '') ?? 'https://xxrealit.cz';
    const postSlug = `video-${input.video.videoId}`;
    const portalContent = [
      '🎥 YOUTUBE',
      '',
      input.video.title,
      '',
      input.teaser,
      '',
      `Kanál: ${input.channelTitle}`,
      `Zdroj: YouTube — ${input.sourceName}`,
    ].join('\n');

    const post = await this.prisma.post.create({
      data: {
        userId: systemUserId,
        type: 'YOUTUBE_VIDEO',
        source: PostSource.YOUTUBE,
        title: input.video.title.slice(0, 200),
        description: '',
        content: portalContent,
        externalUrl: input.video.videoUrl,
        previewTitle: input.video.title,
        previewDescription: input.teaser,
        previewImage: input.video.thumbnailUrl,
        previewSiteName: cfg.portalPostAuthorLabel ?? 'Redakce XXREALIT',
        imageUrl: input.video.thumbnailUrl,
        youtubeVideoId: input.video.videoId,
        youtubeChannelId: input.video.channelId,
        youtubeChannelTitle: input.channelTitle,
        youtubeThumbnailUrl: input.video.thumbnailUrl,
        youtubeEmbeddable: input.video.embeddable,
        publishedAt: input.video.publishedAt,
        slug: postSlug,
        likesAutopilotEnabled: true,
        lastAutopilotLikesAt: new Date(),
      },
    });

    const facebookText = [
      '🎥 Nové video k tématu bydlení a realit',
      '',
      input.video.title,
      '',
      input.teaser,
      '',
      'Podívejte se na video na XXREALIT:',
      `${siteBase}/prispevky/${post.id}`,
      '',
      '#XXREALIT #reality #bydleni',
    ].join('\n');

    await this.prisma.post.update({
      where: { id: post.id },
      data: { description: facebookText },
    });

    await this.audit.log('YOUTUBE_POST_CREATED', `YouTube post ${post.id} — ${input.video.title}`, {
      metadata: { postId: post.id, videoId: input.video.videoId },
    });

    return post.id;
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
    const safeCount = Math.min(20, Math.max(1, count));
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
    };
  }

  async getVideoMeta(videoId: string) {
    if (!isValidYoutubeVideoId(videoId)) return null;
    const rows = await fetchVideoDetails([videoId]);
    return rows[0] ?? null;
  }
}
