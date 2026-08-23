import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { SocialPublishEnqueueService } from '../social/autopost/social-publish-enqueue.service';
import { NewsAuditService } from './news-audit.service';
import { NewsArticleService } from './news-article.service';
import { EditorialPortalPostService } from './editorial-portal-post.service';

/** Thin wrapper — canonical logic lives in EditorialPortalPostService. */
@Injectable()
export class NewsPortalPostService {
  private readonly log = new Logger(NewsPortalPostService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: NewsAuditService,
    private readonly articles: NewsArticleService,
    private readonly editorial: EditorialPortalPostService,
    private readonly socialPublish: SocialPublishEnqueueService,
  ) {}

  async syncFromArticle(
    articleId: string,
    opts?: { enqueueFacebook?: boolean; forceFacebook?: boolean },
  ) {
    const result = await this.editorial.createPostFromArticle(articleId, opts);
    if (!result.ok) {
      return { ok: false, reason: result.reason, postId: result.postId };
    }
    return {
      ok: true,
      postId: result.postId,
      feedVisible: result.feedVisible,
      facebook: null,
    };
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
