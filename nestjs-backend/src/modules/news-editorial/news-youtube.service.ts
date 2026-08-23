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
  type YoutubeVideoMeta,
} from './news-youtube-api.util';

export type YoutubeTestResult = {
  ok: boolean;
  channel?: { id: string; title: string; url: string };
  channelId?: string;
  api: 'OK' | 'FAIL';
  error?: string;
  recentVideos?: Array<{
    videoId: string;
    title: string;
    publishedAt: string;
    thumbnailOk: boolean;
  }>;
  latestVideo?: {
    videoId: string;
    title: string;
    publishedAt: string;
    thumbnailUrl: string;
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
  steps: Array<{ step: string; status: 'PASS' | 'FAIL' | 'SKIP'; detail?: string }>;
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

  async pollDueSources(limit = 3) {
    const cfg = this.settings.getCached();
    if (!cfg.youtubeMonitoringEnabled) return { polled: 0 };

    const intervalMs = (cfg.youtubeCheckIntervalMinutes ?? 30) * 60_000;
    const now = Date.now();
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
      .filter((s) => !s.lastCheckedAt || now - s.lastCheckedAt.getTime() >= intervalMs)
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
    return { polled: processed };
  }

  async pollSource(
    sourceId: string,
    opts?: { enqueueFacebook?: boolean; maxVideos?: number; forceAll?: boolean },
  ) {
    const source = await this.prisma.newsSource.findUnique({ where: { id: sourceId } });
    if (!source || source.type !== NewsSourceType.YOUTUBE_CHANNEL) {
      throw new Error('Zdroj není YouTube kanál.');
    }

    await this.prisma.newsSource.update({
      where: { id: sourceId },
      data: { lastCheckedAt: new Date() },
    });

    if (!getYouTubeApiKey()) {
      await this.markSourceError(sourceId, 'YOUTUBE_API_KEY chybí');
      throw new Error('YOUTUBE_API_KEY není nastaveno.');
    }

    const channel = await resolveYoutubeChannel(source.url, source.channelId);
    if (!source.channelId || source.channelId !== channel.channelId) {
      await this.prisma.newsSource.update({
        where: { id: sourceId },
        data: { channelId: channel.channelId },
      });
    }

    const maxVideos = opts?.maxVideos ?? 5;
    const videos = await fetchPlaylistVideos(
      channel.uploadsPlaylistId,
      maxVideos,
      source.lastVideoPublishedAt,
    );

    const cfg = this.settings.getCached();
    let created = 0;
    let skipped = 0;

    for (const video of videos.sort(
      (a, b) => a.publishedAt.getTime() - b.publishedAt.getTime(),
    )) {
      const result = await this.processVideo(source, video, channel.channelTitle, {
        enqueueFacebook: opts?.enqueueFacebook ?? false,
        forceAll: opts?.forceAll ?? false,
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
        data: { lastSuccessAt: new Date(), lastError: null },
      });
    }

    await this.audit.log('YOUTUBE_POLL', `YouTube ${source.name}: ${created} nových, ${skipped} přeskočeno`, {
      metadata: { sourceId, created, skipped, dailyLimit: cfg.youtubeMaxPostsPerDay },
    });

    return { sourceId, created, skipped, checked: videos.length };
  }

  private async processVideo(
    source: NewsSource,
    video: YoutubeVideoMeta,
    channelTitle: string,
    opts: { enqueueFacebook: boolean; forceAll: boolean },
  ): Promise<{ created: boolean; reason?: string }> {
    if (!isValidYoutubeVideoId(video.videoId)) {
      return { created: false, reason: 'INVALID_VIDEO_ID' };
    }

    const existing = await this.prisma.post.findUnique({
      where: { youtubeVideoId: video.videoId },
      select: { id: true },
    });
    if (existing) return { created: false, reason: 'SKIP_DUPLICATE' };

    const cfg = this.settings.getCached();
    if (!(await this.canPublishYoutubeToday(cfg.youtubeMaxPostsPerDay))) {
      return { created: false, reason: 'DAILY_LIMIT' };
    }

    const relevanceScore = await this.scoreVideoRelevance(video, source.category);
    const minRelevance = Math.max(
      this.sourceMinRelevance(source),
      cfg.youtubeMinRelevance ?? 70,
    );
    const publishAll =
      opts.forceAll || source.youtubePublishMode === NewsYoutubePublishMode.ALL;
    if (!publishAll && relevanceScore < minRelevance) {
      return { created: false, reason: 'LOW_RELEVANCE' };
    }

    const createPost = source.youtubeCreatePost && cfg.youtubeCreatePortalPost !== false;
    if (!createPost) return { created: false, reason: 'CREATE_POST_DISABLED' };

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

    return { created: true };
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
      '🎥 VIDEO',
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
        previewSiteName: cfg.portalPostAuthorLabel ?? 'XXREALIT Aktuality',
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

  async testChannel(sourceId: string): Promise<YoutubeTestResult> {
    const source = await this.prisma.newsSource.findUnique({ where: { id: sourceId } });
    if (!source || source.type !== NewsSourceType.YOUTUBE_CHANNEL) {
      return { ok: false, api: 'FAIL', error: 'Zdroj není YouTube kanál.' };
    }

    if (!getYouTubeApiKey()) {
      return { ok: false, api: 'FAIL', error: 'YOUTUBE_API_KEY není nastaveno na serveru.' };
    }

    try {
      const channel = await resolveYoutubeChannel(source.url, source.channelId);
      const videos = await fetchPlaylistVideos(channel.uploadsPlaylistId, 5);
      const latest = videos[0] ?? null;

      if (channel.channelId !== source.channelId) {
        await this.prisma.newsSource.update({
          where: { id: sourceId },
          data: { channelId: channel.channelId },
        });
      }

      return {
        ok: true,
        api: 'OK',
        channel: { id: channel.channelId, title: channel.channelTitle, url: source.url },
        channelId: channel.channelId,
        recentVideos: videos.map((v) => ({
          videoId: v.videoId,
          title: v.title,
          publishedAt: v.publishedAt.toISOString(),
          thumbnailOk: Boolean(v.thumbnailUrl),
        })),
        latestVideo: latest
          ? {
              videoId: latest.videoId,
              title: latest.title,
              publishedAt: latest.publishedAt.toISOString(),
              thumbnailUrl: latest.thumbnailUrl,
            }
          : null,
      };
    } catch (err) {
      return {
        ok: false,
        api: 'FAIL',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async testImportOne(sourceId: string): Promise<YoutubeImportResult> {
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

    try {
      const channel = await resolveYoutubeChannel(source.url, source.channelId);
      steps.push({ step: 'API', status: 'PASS', detail: channel.channelId });

      const videos = await fetchPlaylistVideos(channel.uploadsPlaylistId, 1);
      if (!videos.length) {
        return {
          ok: false,
          videoFound: false,
          duplicate: false,
          steps: [...steps, { step: 'VIDEO', status: 'FAIL', detail: 'Žádné video' }],
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
          steps: [...steps, { step: 'DUPLICATE', status: 'SKIP' }],
        };
      }

      const relevanceScore = await this.scoreVideoRelevance(video, source.category);
      steps.push({ step: 'RELEVANCE', status: 'PASS', detail: String(relevanceScore) });

      const teaser = await this.generateTeaser(video);
      steps.push({ step: 'TEASER', status: 'PASS' });

      const postId = await this.createYoutubePost({
        video,
        channelTitle: channel.channelTitle,
        teaser,
        category: source.category,
        sourceName: source.name,
      });
      steps.push({ step: 'PORTAL_POST', status: 'PASS', detail: postId });
      steps.push({ step: 'FACEBOOK', status: 'SKIP', detail: 'Test bez FB' });
      steps.push({ step: 'FEED', status: 'PASS' });
      steps.push({ step: 'PLAYER', status: video.embeddable ? 'PASS' : 'SKIP' });

      return {
        ok: true,
        videoFound: true,
        duplicate: false,
        relevanceScore,
        portalPostId: postId,
        postId,
        steps,
      };
    } catch (err) {
      steps.push({
        step: 'PIPELINE',
        status: 'FAIL',
        detail: err instanceof Error ? err.message : String(err),
      });
      return { ok: false, videoFound: false, duplicate: false, steps };
    }
  }

  async testPipeline(sourceId: string): Promise<YoutubeImportResult> {
    return this.testImportOne(sourceId);
  }

  async backfillRecent(sourceId: string, count: number) {
    const safeCount = Math.min(20, Math.max(1, count));
    const source = await this.prisma.newsSource.findUnique({ where: { id: sourceId } });
    if (!source || source.type !== NewsSourceType.YOUTUBE_CHANNEL) {
      throw new Error('Zdroj není YouTube kanál.');
    }

    const channel = await resolveYoutubeChannel(source.url, source.channelId);
    const videos = await fetchPlaylistVideos(channel.uploadsPlaylistId, safeCount, null);

    let created = 0;
    let skipped = 0;
    for (const video of videos) {
      const result = await this.processVideo(source, video, channel.channelTitle, {
        enqueueFacebook: false,
        forceAll: true,
      });
      if (result.created) created += 1;
      else skipped += 1;
    }

    return { created, skipped, total: videos.length };
  }

  async getVideoMeta(videoId: string) {
    if (!isValidYoutubeVideoId(videoId)) return null;
    const rows = await fetchVideoDetails([videoId]);
    return rows[0] ?? null;
  }
}
