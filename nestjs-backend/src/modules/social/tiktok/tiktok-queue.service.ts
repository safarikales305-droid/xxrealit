import { Injectable, Logger } from '@nestjs/common';
import { TikTokPublishJobStatus } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { SocialAutopostSettingsService } from '../autopost/social-autopost-settings.service';
import { isPropertyPubliclyListed } from '../../properties/property-public-visibility';
import { TikTokOAuthService } from './tiktok-oauth.service';
import { TikTokPublisherService } from './tiktok-publisher.service';
import { TikTokSettingsService } from './tiktok-settings.service';
import { TIKTOK_MAX_ATTEMPTS, TIKTOK_RETRY_DELAY_MS } from './tiktok.constants';

@Injectable()
export class TikTokQueueService {
  private readonly logger = new Logger(TikTokQueueService.name);
  private processing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly publisher: TikTokPublisherService,
    private readonly oauth: TikTokOAuthService,
    private readonly portalSettings: TikTokSettingsService,
    private readonly socialSettings: SocialAutopostSettingsService,
  ) {}

  firePropertyCreated(propertyId: string) {
    void this.tryEnqueue(propertyId).catch((err) => {
      this.logger.warn(`TikTok enqueue ${propertyId}: ${err instanceof Error ? err.message : err}`);
    });
  }

  firePropertyApproved(propertyId: string) {
    void this.tryEnqueue(propertyId).catch((err) => {
      this.logger.warn(`TikTok enqueue approved ${propertyId}: ${err instanceof Error ? err.message : err}`);
    });
  }

  private async tryEnqueue(propertyId: string) {
    await this.portalSettings.reload();
    await this.socialSettings.reload();

    const tiktokPlatform = this.socialSettings.getSettings().tiktok;
    const portal = this.portalSettings.getSettings();
    if (!tiktokPlatform.enabled || !portal.autoPublish) return;

    const conn = await this.oauth.getActiveConnection();
    if (!conn?.isActive) return;

    const property = await this.prisma.property.findUnique({ where: { id: propertyId } });
    if (!property || !isPropertyPubliclyListed(property)) return;
    if (!property.videoUrl?.trim()) return;

    const existing = await this.prisma.tikTokPublishJob.findFirst({
      where: {
        listingId: propertyId,
        status: { in: ['WAITING', 'UPLOADING', 'UPLOADED'] },
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });
    if (existing) return;

    await this.publisher.createJobForListing(propertyId);
  }

  async enqueueManual(listingId: string): Promise<{ jobId: string }> {
    return this.publisher.createJobForListing(listingId);
  }

  async cancelJob(jobId: string) {
    await this.prisma.tikTokPublishJob.updateMany({
      where: { id: jobId, status: { in: ['WAITING', 'FAILED', 'NEEDS_REAUTH'] } },
      data: { status: 'FAILED', errorMessage: 'Zrušeno administrátorem.' },
    });
  }

  async retryJob(jobId: string) {
    await this.prisma.tikTokPublishJob.update({
      where: { id: jobId },
      data: { status: 'WAITING', errorMessage: null, attempts: 0 },
    });
    await this.processNext();
  }

  async processNext(): Promise<{ processed: boolean }> {
    if (this.processing) return { processed: false };

    const job = await this.prisma.tikTokPublishJob.findFirst({
      where: { status: 'WAITING' },
      orderBy: { createdAt: 'asc' },
    });
    if (!job) return { processed: false };

    if (job.attempts > 0) {
      const lastLog = await this.prisma.tikTokPublishLog.findFirst({
        where: { jobId: job.id },
        orderBy: { createdAt: 'desc' },
      });
      if (lastLog && Date.now() - lastLog.createdAt.getTime() < TIKTOK_RETRY_DELAY_MS) {
        return { processed: false };
      }
    }

    if (job.attempts >= TIKTOK_MAX_ATTEMPTS) {
      await this.prisma.tikTokPublishJob.update({
        where: { id: job.id },
        data: { status: 'FAILED', errorMessage: 'Vyčerpány všechny pokusy o publikování.' },
      });
      return { processed: false };
    }

    this.processing = true;
    try {
      await this.publisher.publishJob(job.id);
      return { processed: true };
    } catch (err) {
      this.logger.warn(`TikTok job ${job.id} failed: ${err instanceof Error ? err.message : err}`);
      return { processed: true };
    } finally {
      this.processing = false;
    }
  }

  async listJobs(filter?: { status?: TikTokPublishJobStatus; limit?: number }) {
    const limit = Math.min(filter?.limit ?? 50, 200);
    return this.prisma.tikTokPublishJob.findMany({
      where: filter?.status ? { status: filter.status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        logs: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
    });
  }

  async getListingStatus(listingId: string) {
    const jobs = await this.prisma.tikTokPublishJob.findMany({
      where: { listingId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { logs: { orderBy: { createdAt: 'desc' }, take: 3 } },
    });
    const latest = jobs[0];
    return {
      listingId,
      status: latest?.status ?? 'NOT_PUBLISHED',
      publishedAt: latest?.publishedAt?.toISOString() ?? null,
      tiktokVideoUrl: latest?.tiktokVideoUrl ?? null,
      errorMessage: latest?.errorMessage ?? null,
      isDraftInbox: latest?.isDraftInbox ?? false,
      jobs,
    };
  }
}
