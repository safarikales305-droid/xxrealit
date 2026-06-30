import { Injectable, Logger } from '@nestjs/common';
import { SeoIndexContentType, SeoIndexStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { getSiteOriginForOg } from '../properties/property-og-media.util';
import { GoogleIndexingService } from './google-indexing.service';
import {
  buildListingPublicSeoUrl,
  buildPostPublicUrl,
  postHasVideo,
} from './post-seo.util';

@Injectable()
export class SeoIndexQueueService {
  private readonly log = new Logger(SeoIndexQueueService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly googleIndexing: GoogleIndexingService,
  ) {}

  private origin(): string {
    return getSiteOriginForOg();
  }

  async enqueuePost(postId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: {
        media: { orderBy: { order: 'asc' } },
        user: { select: { publicProfile: true } },
      },
    });
    if (!post || !post.user?.publicProfile || !post.slug) return null;

    const hasVideo = postHasVideo(post);
    const url = buildPostPublicUrl(this.origin(), post);
    const contentType = hasVideo ? SeoIndexContentType.VIDEO_POST : SeoIndexContentType.POST;

    return this.upsertQueue(contentType, postId, url);
  }

  async enqueueProperty(propertyId: string) {
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, deletedAt: null, approved: true, isActive: true, isVisible: true },
      select: { id: true, slug: true, listingType: true, videoUrl: true },
    });
    if (!property?.slug) return null;

    const isShorts =
      String(property.listingType ?? '').toUpperCase() === 'SHORTS' ||
      Boolean(property.videoUrl?.trim());
    const contentType = isShorts ? SeoIndexContentType.SHORTS : SeoIndexContentType.PROPERTY;
    const url = buildListingPublicSeoUrl(this.origin(), property, isShorts ? 'shorts' : 'classic');

    return this.upsertQueue(contentType, propertyId, url);
  }

  private async upsertQueue(contentType: SeoIndexContentType, contentId: string, url: string) {
    const row = await this.prisma.seoIndexQueue.upsert({
      where: { contentType_contentId: { contentType, contentId } },
      create: {
        contentType,
        contentId,
        url,
        inSitemap: true,
        status: SeoIndexStatus.PENDING,
      },
      update: {
        url,
        inSitemap: true,
        status: SeoIndexStatus.PENDING,
        lastError: null,
      },
    });
    void this.processPendingForContent(contentType, contentId).catch((err) => {
      this.log.warn(
        `SEO index queue async process failed: ${err instanceof Error ? err.message : err}`,
      );
    });
    return row;
  }

  async processPendingBatch(limit = 10) {
    const due = await this.prisma.seoIndexQueue.findMany({
      where: { status: SeoIndexStatus.PENDING },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    let submitted = 0;
    for (const row of due) {
      const ok = await this.submitRow(row.id);
      if (ok) submitted += 1;
    }
    return { processed: due.length, submitted };
  }

  async processPendingForContent(contentType: SeoIndexContentType, contentId: string) {
    const row = await this.prisma.seoIndexQueue.findUnique({
      where: { contentType_contentId: { contentType, contentId } },
    });
    if (!row || row.status !== SeoIndexStatus.PENDING) return;
    await this.submitRow(row.id);
  }

  async submitRow(id: string): Promise<boolean> {
    const row = await this.prisma.seoIndexQueue.findUnique({ where: { id } });
    if (!row) return false;

    const result = await this.googleIndexing.submitUrl(row.url);
    if (result.ok) {
      await this.prisma.seoIndexQueue.update({
        where: { id },
        data: {
          status: SeoIndexStatus.SUBMITTED,
          lastSubmittedAt: new Date(),
          lastError: null,
        },
      });
      return true;
    }

    await this.prisma.seoIndexQueue.update({
      where: { id },
      data: {
        status: SeoIndexStatus.FAILED,
        lastError: result.error ?? 'Neznámá chyba',
      },
    });
    return false;
  }

  async requestReindex(id: string) {
    const row = await this.prisma.seoIndexQueue.findUnique({ where: { id } });
    if (!row) return { ok: false, error: 'Záznam nenalezen' };
    await this.prisma.seoIndexQueue.update({
      where: { id },
      data: { status: SeoIndexStatus.PENDING, lastError: null },
    });
    const ok = await this.submitRow(id);
    return { ok, status: ok ? SeoIndexStatus.SUBMITTED : SeoIndexStatus.FAILED };
  }

  async listAdmin(opts: { q?: string; status?: SeoIndexStatus; limit?: number; offset?: number }) {
    const limit = Math.min(100, Math.max(1, opts.limit ?? 50));
    const offset = Math.max(0, opts.offset ?? 0);
    const where = {
      ...(opts.status ? { status: opts.status } : {}),
      ...(opts.q?.trim()
        ? {
            OR: [
              { url: { contains: opts.q.trim(), mode: 'insensitive' as const } },
              { contentId: { contains: opts.q.trim(), mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.seoIndexQueue.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.seoIndexQueue.count({ where }),
    ]);
    return { items, total, limit, offset };
  }
}
