import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  NewsArticleStatus,
  PostCategory,
  PostSource,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { SocialPublishEnqueueService } from '../social/autopost/social-publish-enqueue.service';
import { NewsAuditService } from './news-audit.service';
import { NewsArticleService } from './news-article.service';
import { NewsEditorialSettingsService } from './news-editorial-settings.service';
import { NewsSystemUserService } from './news-system-user.service';
import {
  buildNewsArticleCanonicalUrl,
  buildNewsFacebookPostText,
  buildNewsPortalPostContent,
  buildNewsPortalPostSlug,
  buildNewsSocialExcerpt,
  buildNewsSocialTitle,
  mapNewsCategoryToPostCategory,
  resolveNewsArticleImageUrl,
} from './news-portal-post.util';

@Injectable()
export class NewsPortalPostService {
  private readonly log = new Logger(NewsPortalPostService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: NewsAuditService,
    private readonly articles: NewsArticleService,
    private readonly settings: NewsEditorialSettingsService,
    private readonly socialPublish: SocialPublishEnqueueService,
    private readonly systemUser: NewsSystemUserService,
  ) {}

  private async resolveSystemUserId(): Promise<string> {
    return this.systemUser.getSystemUserId();
  }

  async syncFromArticle(
    articleId: string,
    opts?: { enqueueFacebook?: boolean; forceFacebook?: boolean },
  ) {
    const article = await this.articles.getArticle(articleId);
    if (article.status !== NewsArticleStatus.PUBLISHED) {
      return { ok: false, reason: 'Článek není publikovaný' };
    }

    const cfg = this.settings.getCached();
    if (!cfg.createPortalPost) {
      await this.audit.log('PORTAL_POST_SKIPPED', 'Vytváření portálového příspěvku je vypnuto', {
        articleId,
      });
      return { ok: false, reason: 'createPortalPost vypnuto' };
    }

    const systemUserId = await this.resolveSystemUserId();
    if (!systemUserId) {
      await this.audit.log('PORTAL_POST_SKIPPED', 'Systémový autor AI redakce není dostupný', {
        articleId,
      });
      return { ok: false, reason: 'SYSTEM_USER_NOT_FOUND' };
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
    const facebookText = buildNewsFacebookPostText({
      socialTitle,
      socialExcerpt,
      articleUrl,
      addHashtags: cfg.addHashtags !== false,
    });
    const systemUser = await this.systemUser.getSystemUser();
    const primarySource = article.sources?.[0];
    const postSlug = buildNewsPortalPostSlug(article.slug);
    const postCategory = mapNewsCategoryToPostCategory(article.category);

    const payload = {
      title: socialTitle.slice(0, 200),
      description: facebookText,
      content: portalContent,
      imageUrl,
      previewImage: imageUrl,
      previewTitle: socialTitle,
      previewDescription: socialExcerpt,
      previewSiteName: systemUser.name || cfg.portalPostAuthorLabel || 'AI redakce XXrealit',
      externalUrl: articleUrl,
      seoTitle: article.seoTitle,
      seoDescription: article.seoDescription,
      slug: postSlug,
      category: postCategory as PostCategory,
      city: article.region ?? '',
      publishedAt: article.publishedAt ?? new Date(),
      ...(primarySource
        ? {
            newsSourceId: primarySource.sourceId ?? undefined,
            editorialSourceName: primarySource.sourceName,
            editorialSourceUrl: primarySource.sourceUrl,
            editorialExternalId: primarySource.sourceItemId ?? undefined,
          }
        : {}),
    };

    let postId = article.portalPostId;
    if (postId) {
      const existing = await this.prisma.post.findUnique({ where: { id: postId } });
      if (existing) {
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
        postId = null;
      }
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
        data: { ...payload, newsArticleId: article.id },
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
          media: {
            create: [{ url: imageUrl, type: 'image', order: 0 }],
          },
        },
      });
      postId = post.id;
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
      metadata: { postId, imageUrl },
    });

    let facebookResult: Record<string, unknown> | null = null;
    if (opts?.enqueueFacebook && cfg.createFacebookPost) {
      facebookResult = await this.enqueueFacebook(postId, {
        force: opts.forceFacebook,
        triggeredByUserId: undefined,
      });
    }

    return { ok: true, postId, imageUrl, facebook: facebookResult };
  }

  async hideFromArticle(articleId: string) {
    const article = await this.prisma.newsArticle.findUnique({
      where: { id: articleId },
      select: { portalPostId: true },
    });
    if (!article?.portalPostId) return { ok: true, hidden: false };

    await this.prisma.post.delete({ where: { id: article.portalPostId } }).catch(() => null);
    await this.prisma.newsArticle.update({
      where: { id: articleId },
      data: { portalPostId: null },
    });
    await this.audit.log('PORTAL_POST_HIDDEN', 'Portálový příspěvek odstraněn', { articleId });
    return { ok: true, hidden: true };
  }

  async enqueueFacebook(
    postId: string,
    opts?: { force?: boolean; triggeredByUserId?: string },
  ) {
    const result = await this.socialPublish.enqueueManual({
      contentType: 'POST',
      contentId: postId,
      force: opts?.force,
      triggeredByUserId: opts?.triggeredByUserId,
    });

    const article = await this.prisma.newsArticle.findFirst({
      where: { portalPostId: postId },
      select: { id: true },
    });
    if (article) {
      await this.prisma.newsArticle.update({
        where: { id: article.id },
        data: { facebookQueued: true },
      });
      await this.audit.log('FACEBOOK_POST_QUEUED', 'Facebook fronta pro aktualitu', {
        articleId: article.id,
        metadata: result as object,
      });
    }

    return result;
  }

  async republishFacebook(articleId: string, adminUserId?: string) {
    const article = await this.articles.getArticle(articleId);
    if (!article.portalPostId) {
      throw new NotFoundException('Článek nemá portálový příspěvek.');
    }
    return this.enqueueFacebook(article.portalPostId, {
      force: true,
      triggeredByUserId: adminUserId,
    });
  }
}
