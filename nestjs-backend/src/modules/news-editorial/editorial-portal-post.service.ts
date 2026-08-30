import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  NewsArticleStatus,
  NewsPublishMode,
  NewsSource,
  NewsYoutubePublishMode,
  PostCategory,
  PostSource,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { PostsService } from '../posts/posts.service';
import { SocialPublishEnqueueService } from '../social/autopost/social-publish-enqueue.service';
import { NewsAuditService } from './news-audit.service';
import { NewsArticleService } from './news-article.service';
import { NewsEditorialSettingsService } from './news-editorial-settings.service';
import {
  buildNewsArticleCanonicalUrl,
  buildNewsPortalPostContent,
  buildNewsPortalPostSlug,
  buildNewsSocialExcerpt,
  buildNewsSocialTitle,
  mapNewsCategoryToPostCategory,
  resolveNewsArticleImageUrl,
} from './news-portal-post.util';
import { isValidNewsHeroImageUrl } from './news-hero-image.util';
import { NewsSystemUserService } from './news-system-user.service';
import type { YoutubeVideoMeta } from './news-youtube-api.util';
import { EditorialReelJobService } from '../editorial-reel/editorial-reel-job.service';

export type EditorialPostResult = {
  ok: boolean;
  postId?: string;
  created?: boolean;
  feedVisible?: boolean;
  reason?: string;
};

export type EditorialDistributionDiagnostics = {
  publishedArticles: number;
  articlesWithPortalPost: number;
  articlesMissingPost: number;
  importedYoutubeVideos: number;
  youtubePostsTotal: number;
  youtubeMissingPost: number;
  feedVisibleNewsPosts: number;
  feedVisibleYoutubePosts: number;
};

export type EditorialRepairResult = {
  articles: { found: number; created: number; errors: number };
  youtube: {
    imported: number;
    alreadyHadPost: number;
    published: number;
    created: number;
    errors: number;
    message: string;
  };
};

@Injectable()
export class EditorialPortalPostService {
  private readonly log = new Logger(EditorialPortalPostService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: NewsAuditService,
    private readonly articles: NewsArticleService,
    private readonly settings: NewsEditorialSettingsService,
    private readonly systemUser: NewsSystemUserService,
    private readonly posts: PostsService,
    private readonly socialPublish: SocialPublishEnqueueService,
    private readonly reelJobs: EditorialReelJobService,
  ) {}

  private async systemUserId(): Promise<string> {
    return this.systemUser.getSystemUserId();
  }

  private shouldPublishYoutubeToFeed(
    cfg: ReturnType<NewsEditorialSettingsService['getCached']>,
    source: NewsSource,
    forcePublish?: boolean,
  ): boolean {
    if (forcePublish) return true;
    if (source.youtubePublishToShorts === false) return false;
    if (source.youtubeCreatePost !== false) return true;
    return (
      cfg.publishMode === NewsPublishMode.AUTOMATIC ||
      cfg.autoPublishArticles ||
      source.youtubePublishMode === NewsYoutubePublishMode.ALL
    );
  }

  async createPostFromArticle(
    articleId: string,
    opts?: { enqueueFacebook?: boolean; forceFacebook?: boolean },
  ): Promise<EditorialPostResult> {
    const article = await this.articles.getArticle(articleId);
    if (article.status !== NewsArticleStatus.PUBLISHED) {
      return { ok: false, reason: 'Článek není publikovaný' };
    }

    if (!isValidNewsHeroImageUrl(article.ogImageUrl) && !isValidNewsHeroImageUrl(article.socialImageUrl)) {
      return { ok: false, reason: 'IMAGE_REQUIRED' };
    }

    const cfg = this.settings.getCached();
    if (!cfg.createPortalPost) {
      await this.audit.log('PORTAL_POST_SKIPPED', 'Vytváření portálového příspěvku je vypnuto', {
        articleId,
      });
      return { ok: false, reason: 'createPortalPost vypnuto' };
    }

    let systemUserId: string;
    try {
      systemUserId = await this.systemUserId();
    } catch (err) {
      return {
        ok: false,
        reason: err instanceof Error ? err.message : 'SYSTEM_USER_NOT_FOUND',
      };
    }

    const articleUrl = buildNewsArticleCanonicalUrl(article);
    const socialTitle = buildNewsSocialTitle(article);
    const socialExcerpt = buildNewsSocialExcerpt(article, cfg.maxTeaserLength ?? 280);
    const imageUrl = resolveNewsArticleImageUrl(article, cfg.defaultOgImageUrl);
    const portalContent = buildNewsPortalPostContent({
      socialTitle,
      socialExcerpt,
      category: article.category,
      articleUrl,
    });
    const systemUser = await this.systemUser.getSystemUser();
    const primarySource = article.sources?.[0];
    const postSlug = buildNewsPortalPostSlug(article.slug);
    const postCategory = mapNewsCategoryToPostCategory(article.category);
    const publishedAt = article.publishedAt ?? new Date();

    const payload = {
      title: socialTitle.slice(0, 200),
      description: socialExcerpt,
      content: portalContent,
      imageUrl,
      previewImage: imageUrl,
      previewTitle: socialTitle,
      previewDescription: socialExcerpt,
      previewSiteName: systemUser.name || cfg.portalPostAuthorLabel || 'AI redakce XXrealit',
      externalUrl: articleUrl,
      videoUrl: null,
      seoTitle: article.seoTitle,
      seoDescription: article.seoDescription,
      slug: postSlug,
      category: postCategory as PostCategory,
      city: article.region ?? '',
      publishedAt,
      ...(primarySource?.sourceId ? { newsSourceId: primarySource.sourceId } : {}),
      ...(primarySource
        ? {
            editorialSourceName: primarySource.sourceName,
            editorialSourceUrl: primarySource.sourceUrl,
            editorialExternalId: primarySource.sourceItemId ?? undefined,
          }
        : {}),
    };

    let postId = article.portalPostId;
    let created = false;

    if (postId) {
      const existing = await this.prisma.post.findUnique({ where: { id: postId } });
      if (!existing) postId = null;
    }

    if (!postId) {
      const byArticle = await this.prisma.post.findFirst({
        where: { newsArticleId: article.id },
        select: { id: true },
      });
      postId = byArticle?.id ?? null;
    }

    if (postId) {
      await this.prisma.post.update({
        where: { id: postId },
        data: {
          ...payload,
          newsArticleId: article.id,
        },
      });
      await this.prisma.media.deleteMany({ where: { postId } });
      await this.prisma.media.create({
        data: { postId, url: imageUrl, type: 'image', order: 0 },
      });
    } else {
      const post = await this.prisma.post.create({
        data: {
          userId: systemUserId,
          type: 'NEWS_ARTICLE',
          source: PostSource.INTERNAL,
          likesAutopilotEnabled: true,
          lastAutopilotLikesAt: new Date(),
          newsArticleId: article.id,
          ...payload,
          media: { create: [{ url: imageUrl, type: 'image', order: 0 }] },
        },
      });
      postId = post.id;
      created = true;
    }

    await this.prisma.newsArticle.update({
      where: { id: articleId },
      data: {
        portalPostId: postId,
        socialTitle,
        socialExcerpt,
        socialImageUrl: imageUrl,
      },
    });

    await this.audit.log('PORTAL_POST_SYNCED', `Portálový příspěvek ${postId}`, {
      articleId,
      metadata: { postId, imageUrl, created },
    });

    this.posts.finalizeEditorialPost(systemUserId, postId);
    const feedVisible = await this.posts.isPostVisibleInCommunityFeed(postId);

    if (opts?.enqueueFacebook && cfg.createFacebookPost) {
      await this.socialPublish.enqueueManual({
        contentType: 'POST',
        contentId: postId,
        force: opts.forceFacebook,
      });
      await this.prisma.newsArticle.update({
        where: { id: articleId },
        data: { facebookQueued: true },
      });
    }

    return { ok: true, postId, created, feedVisible };
  }

  async createPostFromYoutubeVideo(input: {
    video: YoutubeVideoMeta;
    channelTitle: string;
    teaser: string;
    bodyText: string;
    source: NewsSource;
    forcePublish?: boolean;
  }): Promise<EditorialPostResult> {
    if (!input.video.videoId?.trim()) {
      return { ok: false, reason: 'INVALID_VIDEO_ID' };
    }

    const existing = await this.prisma.post.findUnique({
      where: { youtubeVideoId: input.video.videoId },
      select: { id: true, userId: true, publishedAt: true },
    });
    if (existing) {
      if (!existing.publishedAt) {
        const publishedAt = input.video.publishedAt ?? new Date();
        await this.prisma.post.update({
          where: { id: existing.id },
          data: { publishedAt },
        });
        this.posts.finalizeEditorialPost(existing.userId, existing.id);
      }
      const feedVisible = await this.posts.isPostVisibleInCommunityFeed(existing.id);
      return { ok: true, postId: existing.id, created: false, feedVisible };
    }

    let systemUserId: string;
    try {
      systemUserId = await this.systemUserId();
    } catch (err) {
      return {
        ok: false,
        reason: err instanceof Error ? err.message : 'SYSTEM_USER_NOT_FOUND',
      };
    }

    const systemUser = await this.systemUser.getSystemUser();
    const cfg = this.settings.getCached();
    const publishToFeed = this.shouldPublishYoutubeToFeed(cfg, input.source, input.forcePublish);
    const publishedAt = publishToFeed ? input.video.publishedAt ?? new Date() : null;

    const portalContent = [
      input.teaser,
      '',
      input.bodyText,
      '',
      `Zdroj: ${input.source.name}`,
      `Kanál: ${input.channelTitle}`,
      `Originál: ${input.video.videoUrl}`,
    ].join('\n');

    const post = await this.prisma.post.create({
      data: {
        userId: systemUserId,
        type: 'YOUTUBE_VIDEO',
        source: PostSource.YOUTUBE,
        title: input.video.title.slice(0, 200),
        description: input.teaser,
        content: portalContent,
        externalUrl: input.video.videoUrl,
        previewTitle: input.video.title,
        previewDescription: input.teaser,
        previewImage: input.video.thumbnailUrl,
        previewSiteName: systemUser.name || cfg.portalPostAuthorLabel,
        imageUrl: input.video.thumbnailUrl,
        youtubeVideoId: input.video.videoId,
        youtubeChannelId: input.video.channelId,
        youtubeChannelTitle: input.channelTitle,
        youtubeThumbnailUrl: input.video.thumbnailUrl,
        youtubeEmbeddable: input.video.embeddable,
        publishedAt,
        slug: `video-${input.video.videoId}`,
        newsSourceId: input.source.id,
        editorialSourceName: input.source.name,
        editorialSourceUrl: input.source.url,
        editorialExternalId: input.video.videoId,
        likesAutopilotEnabled: true,
        lastAutopilotLikesAt: new Date(),
      },
    });

    if (publishedAt) {
      this.posts.finalizeEditorialPost(systemUserId, post.id);
    }

    await this.audit.log('YOUTUBE_POST_CREATED', `YouTube post ${post.id} — ${input.video.title}`, {
      metadata: { postId: post.id, videoId: input.video.videoId },
    });

    const feedVisible = publishedAt
      ? await this.posts.isPostVisibleInCommunityFeed(post.id)
      : false;

    if (publishedAt && post.id) {
      await this.prisma.newsSource.update({
        where: { id: input.source.id },
        data: {
          lastAutoImportedAt: new Date(),
          lastPublishedToShortsAt: new Date(),
        },
      });
      try {
        await this.reelJobs.enqueueFromNewPost(post.id, input.source.id);
      } catch (err) {
        this.log.warn(
          `Reel enqueue failed for post ${post.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    return { ok: true, postId: post.id, created: true, feedVisible };
  }

  async createPostFromYoutubeVideoId(
    youtubeVideoId: string,
    opts?: { forcePublish?: boolean },
  ): Promise<EditorialPostResult> {
    const post = await this.prisma.post.findUnique({
      where: { youtubeVideoId },
      include: { newsSource: true },
    });
    if (!post) {
      return { ok: false, reason: 'YOUTUBE_POST_NOT_FOUND' };
    }
    if (!post.publishedAt || opts?.forcePublish) {
      const publishedAt = post.publishedAt ?? new Date();
      if (!post.publishedAt) {
        await this.prisma.post.update({
          where: { id: post.id },
          data: { publishedAt },
        });
        this.posts.finalizeEditorialPost(post.userId, post.id);
      }
    }
    const feedVisible = await this.posts.isPostVisibleInCommunityFeed(post.id);
    return { ok: true, postId: post.id, created: false, feedVisible };
  }

  async getDistributionDiagnostics(): Promise<EditorialDistributionDiagnostics> {
    const [
      publishedArticles,
      articlesWithPortalPost,
      importedYoutubeVideos,
      youtubePostsTotal,
      feedVisibleNewsPosts,
      feedVisibleYoutubePosts,
    ] = await Promise.all([
      this.prisma.newsArticle.count({ where: { status: NewsArticleStatus.PUBLISHED } }),
      this.prisma.newsArticle.count({
        where: { status: NewsArticleStatus.PUBLISHED, portalPostId: { not: null } },
      }),
      this.prisma.newsSource.aggregate({
        _sum: { youtubeImportedCount: true },
        where: { type: 'YOUTUBE_CHANNEL' },
      }),
      this.prisma.post.count({ where: { type: 'YOUTUBE_VIDEO' } }),
      this.prisma.post.count({
        where: { type: 'NEWS_ARTICLE', publishedAt: { not: null } },
      }),
      this.prisma.post.count({
        where: { type: 'YOUTUBE_VIDEO', publishedAt: { not: null } },
      }),
    ]);

    const imported = importedYoutubeVideos._sum.youtubeImportedCount ?? 0;

    return {
      publishedArticles,
      articlesWithPortalPost,
      articlesMissingPost: publishedArticles - articlesWithPortalPost,
      importedYoutubeVideos: imported,
      youtubePostsTotal,
      youtubeMissingPost: Math.max(0, imported - youtubePostsTotal),
      feedVisibleNewsPosts,
      feedVisibleYoutubePosts,
    };
  }

  async repairMissingPosts(): Promise<EditorialRepairResult> {
    const articles = await this.prisma.newsArticle.findMany({
      where: { status: NewsArticleStatus.PUBLISHED, portalPostId: null },
      select: { id: true },
      orderBy: { publishedAt: 'asc' },
    });

    let articleCreated = 0;
    let articleErrors = 0;
    for (const row of articles) {
      try {
        const res = await this.createPostFromArticle(row.id, { enqueueFacebook: false });
        if (res.ok) articleCreated += 1;
        else articleErrors += 1;
      } catch (err) {
        articleErrors += 1;
        this.log.warn(
          `Article repair ${row.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    const [importedTotal, draftPosts, existingPublished] = await Promise.all([
      this.prisma.newsSource.aggregate({
        _sum: { youtubeImportedCount: true },
        where: { type: 'YOUTUBE_CHANNEL' },
      }),
      this.prisma.post.findMany({
        where: { type: 'YOUTUBE_VIDEO', publishedAt: null },
        select: { id: true, userId: true, youtubeVideoId: true, createdAt: true },
      }),
      this.prisma.post.count({
        where: { type: 'YOUTUBE_VIDEO', publishedAt: { not: null } },
      }),
    ]);

    let youtubePublished = 0;
    let youtubeErrors = 0;
    for (const post of draftPosts) {
      try {
        const publishedAt = post.createdAt ?? new Date();
        await this.prisma.post.update({
          where: { id: post.id },
          data: { publishedAt },
        });
        this.posts.finalizeEditorialPost(post.userId, post.id);
        youtubePublished += 1;
      } catch (err) {
        youtubeErrors += 1;
        this.log.warn(
          `YouTube repair ${post.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    const imported = importedTotal._sum.youtubeImportedCount ?? 0;
    const message = `Importovaných videí: ${imported}, Post existuje: ${existingPublished + draftPosts.length}, Nově publikováno: ${youtubePublished}, Chyby: ${youtubeErrors}`;

    await this.audit.log('EDITORIAL_DISTRIBUTION_REPAIR', message, {
      metadata: { articleCreated, articleErrors, youtubePublished, youtubeErrors },
    });

    return {
      articles: { found: articles.length, created: articleCreated, errors: articleErrors },
      youtube: {
        imported,
        alreadyHadPost: existingPublished,
        published: youtubePublished,
        created: 0,
        errors: youtubeErrors,
        message,
      },
    };
  }

  async testFeedVisibility(postId: string): Promise<{
    postId: string;
    foundInFeedApi: boolean;
    publishedAt: string | null;
    type: string | null;
  }> {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, type: true, publishedAt: true },
    });
    if (!post) throw new NotFoundException('Post nenalezen');
    const foundInFeedApi = await this.posts.isPostVisibleInCommunityFeed(postId);
    return {
      postId,
      foundInFeedApi,
      publishedAt: post.publishedAt?.toISOString() ?? null,
      type: post.type,
    };
  }
}
