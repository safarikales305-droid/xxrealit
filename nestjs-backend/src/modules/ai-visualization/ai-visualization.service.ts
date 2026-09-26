import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  AiVisualizationEventName,
  AiVisualizationRenovationLevel,
  AiVisualizationStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { processUploadImage } from './ai-visualization-image.util';
import { buildRenovationImagePrompt } from './ai-visualization-prompt.util';
import { createPublicShareId, hashClientIp } from './ai-visualization-id.util';
import { AiVisualizationSettingsService } from './ai-visualization-settings.service';
import { AiVisualizationStorageService } from './ai-visualization-storage.service';
import { AiVisualizationWatermarkService } from './ai-visualization-watermark.service';
import { OpenAiRenovationImageProvider } from './providers/openai-renovation-image.provider';
import type { VisualizationPublicView } from './ai-visualization.types';

const IP_HASH_SALT = process.env.AI_VISUALIZATION_IP_SALT ?? 'xxrealit-ai-viz';

@Injectable()
export class AiVisualizationService {
  private readonly log = new Logger(AiVisualizationService.name);
  private readonly inFlightGenerations = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AiVisualizationSettingsService,
    private readonly storage: AiVisualizationStorageService,
    private readonly watermark: AiVisualizationWatermarkService,
    private readonly openAiProvider: OpenAiRenovationImageProvider,
  ) {}

  async getPublicConfig() {
    const s = await this.settings.getSettings();
    return {
      ...this.settings.getPublicConfig(s),
      storageConfigured: this.storage.isConfigured(),
      providerReady: this.openAiProvider.isReady(),
    };
  }

  toPublicView(row: {
    id: string;
    status: AiVisualizationStatus;
    progress: number;
    propertyType: string | null;
    style: string | null;
    renovationLevel: AiVisualizationRenovationLevel | null;
    userPrompt: string | null;
    originalPreviewUrl: string | null;
    resultPreviewUrl: string | null;
    publicShareId: string | null;
    errorMessage: string | null;
    createdAt: Date;
    completedAt: Date | null;
  }): VisualizationPublicView {
    return {
      id: row.id,
      status: row.status,
      progress: row.progress,
      propertyType: row.propertyType,
      style: row.style,
      renovationLevel: row.renovationLevel,
      userPrompt: row.userPrompt,
      originalPreviewUrl: row.originalPreviewUrl,
      resultPreviewUrl: row.resultPreviewUrl,
      publicShareId: row.publicShareId,
      errorMessage: row.errorMessage,
      createdAt: row.createdAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
    };
  }

  async trackEvent(input: {
    eventName: AiVisualizationEventName;
    visualizationId?: string;
    userId?: string | null;
    anonymousSessionId?: string;
    meta?: Record<string, unknown>;
  }) {
    await this.prisma.aiVisualizationEvent.create({
      data: {
        eventName: input.eventName,
        visualizationId: input.visualizationId,
        userId: input.userId ?? undefined,
        anonymousSessionId: input.anonymousSessionId,
        meta: (input.meta ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  private async assertGenerationAllowed(input: {
    userId?: string | null;
    anonymousSessionId: string;
    ipHash?: string;
  }) {
    const s = await this.settings.getSettings();
    if (!s.enabled) throw new ServiceUnavailableException('AI vizualizace je vypnutá.');
    if (!this.storage.isConfigured()) {
      throw new ServiceUnavailableException('Úložiště není nakonfigurováno.');
    }

    const since = new Date();
    since.setHours(0, 0, 0, 0);

    if (input.userId) {
      const count = await this.prisma.aiVisualization.count({
        where: {
          userId: input.userId,
          createdAt: { gte: since },
          status: { in: ['PENDING', 'PROCESSING', 'COMPLETED'] },
        },
      });
      if (count >= s.loggedInFreeGenerations) {
        throw new ForbiddenException('Denní limit generování byl vyčerpán.');
      }
      return;
    }

    if (!s.anonymousEnabled) {
      throw new ForbiddenException('Anonymní generování je vypnuté.');
    }

    const count = await this.prisma.aiVisualization.count({
      where: {
        anonymousSessionId: input.anonymousSessionId,
        createdAt: { gte: since },
        status: { in: ['PENDING', 'PROCESSING', 'COMPLETED'] },
      },
    });
    if (count >= s.anonymousFreeGenerations) {
      throw new ForbiddenException('Limit bezplatných generování byl vyčerpán. Přihlaste se pro další.');
    }
  }

  async createDraftFromUpload(input: {
    file: Express.Multer.File;
    anonymousSessionId: string;
    userId?: string | null;
    ip: string;
  }) {
    const s = await this.settings.getSettings();
    if (!s.enabled) throw new ServiceUnavailableException('AI vizualizace je vypnutá.');

    const processed = await processUploadImage(
      input.file.buffer,
      input.file.mimetype,
      s.maxUploadBytes,
    );

    const original = await this.storage.uploadOriginal(processed.previewJpegBuffer);

    const row = await this.prisma.aiVisualization.create({
      data: {
        userId: input.userId ?? undefined,
        anonymousSessionId: input.anonymousSessionId,
        status: 'DRAFT',
        originalCloudinaryId: original.publicId,
        originalPreviewUrl: original.secureUrl,
        ipHash: hashClientIp(input.ip, IP_HASH_SALT),
      },
    });

    await this.trackEvent({
      eventName: 'ai_visualization_upload',
      visualizationId: row.id,
      userId: input.userId,
      anonymousSessionId: input.anonymousSessionId,
    });

    return this.toPublicView(row);
  }

  async queueGeneration(input: {
    visualizationId: string;
    anonymousSessionId: string;
    userId?: string | null;
    propertyType: string;
    style: string;
    renovationLevel: AiVisualizationRenovationLevel;
    userPrompt?: string;
    idempotencyKey: string;
    parentId?: string;
    ip: string;
  }) {
    if (this.inFlightGenerations.has(input.idempotencyKey)) {
      const existing = await this.prisma.aiVisualization.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing) return this.toPublicView(existing);
      throw new BadRequestException('Generování již probíhá.');
    }

    const existing = await this.prisma.aiVisualization.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) return this.toPublicView(existing);

    let row = await this.prisma.aiVisualization.findUnique({ where: { id: input.visualizationId } });
    if (!row) throw new NotFoundException('Vizualizace nenalezena.');

    if (input.parentId) {
      const parent = await this.prisma.aiVisualization.findUnique({ where: { id: input.parentId } });
      if (!parent?.originalCloudinaryId) throw new BadRequestException('Původní vizualizace není k dispozici.');
      if (parent.anonymousSessionId !== input.anonymousSessionId && parent.userId !== input.userId) {
        throw new ForbiddenException('Nemáte přístup k původní vizualizaci.');
      }
      row = await this.prisma.aiVisualization.create({
        data: {
          userId: input.userId ?? parent.userId,
          anonymousSessionId: input.anonymousSessionId,
          status: 'DRAFT',
          parentId: parent.id,
          originalCloudinaryId: parent.originalCloudinaryId,
          originalPreviewUrl: parent.originalPreviewUrl,
          ipHash: hashClientIp(input.ip, IP_HASH_SALT),
        },
      });
    }

    if (row.anonymousSessionId !== input.anonymousSessionId && row.userId !== input.userId) {
      throw new ForbiddenException('Nemáte přístup k této vizualizaci.');
    }
    if (!row.originalCloudinaryId) {
      throw new BadRequestException('Chybí nahraná fotografie.');
    }

    await this.assertGenerationAllowed({
      userId: input.userId,
      anonymousSessionId: input.anonymousSessionId,
      ipHash: hashClientIp(input.ip, IP_HASH_SALT),
    });

    this.inFlightGenerations.add(input.idempotencyKey);

    try {
      const updated = await this.prisma.aiVisualization.update({
        where: { id: row.id },
        data: {
          status: 'PENDING',
          progress: 5,
          propertyType: input.propertyType,
          style: input.style,
          renovationLevel: input.renovationLevel,
          userPrompt: input.userPrompt?.trim() || null,
          idempotencyKey: input.idempotencyKey,
          parentId: input.parentId ?? row.parentId,
          userId: input.userId ?? row.userId,
          resultCloudinaryId: null,
          resultPreviewUrl: null,
          completedAt: null,
          errorMessage: null,
          errorCode: null,
          generationStartedAt: null,
        },
      });

      await this.trackEvent({
        eventName: input.parentId ? 'ai_visualization_variant' : 'ai_visualization_generate',
        visualizationId: updated.id,
        userId: input.userId,
        anonymousSessionId: input.anonymousSessionId,
      });

      return this.toPublicView(updated);
    } finally {
      this.inFlightGenerations.delete(input.idempotencyKey);
    }
  }

  async getVisualizationForClient(id: string, anonymousSessionId: string, userId?: string | null) {
    const row = await this.prisma.aiVisualization.findUnique({ where: { id } });
    if (!row) throw new NotFoundException();
    if (row.userId) {
      if (!userId || row.userId !== userId) throw new ForbiddenException();
    } else if (row.anonymousSessionId !== anonymousSessionId) {
      throw new ForbiddenException();
    }
    return this.toPublicView(row);
  }

  async getShareView(publicShareId: string) {
    const row = await this.prisma.aiVisualization.findUnique({ where: { publicShareId } });
    if (!row || !row.sharedAt) throw new NotFoundException();
    return {
      ...this.toPublicView(row),
      shareEnabled: true,
    };
  }

  async enableShare(id: string, anonymousSessionId: string, userId?: string | null) {
    const row = await this.prisma.aiVisualization.findUnique({ where: { id } });
    if (!row || row.status !== 'COMPLETED') throw new BadRequestException('Vizualizace není hotová.');
    if (row.userId && userId !== row.userId) throw new ForbiddenException();
    if (!row.userId && row.anonymousSessionId !== anonymousSessionId) throw new ForbiddenException();

    const publicShareId = row.publicShareId ?? createPublicShareId();
    const updated = await this.prisma.aiVisualization.update({
      where: { id },
      data: { publicShareId, sharedAt: new Date() },
    });

    await this.trackEvent({
      eventName: 'ai_visualization_share',
      visualizationId: id,
      userId,
      anonymousSessionId,
    });

    return { publicShareId: updated.publicShareId };
  }

  async claimVisualization(id: string, anonymousSessionId: string, userId: string) {
    const row = await this.prisma.aiVisualization.findUnique({ where: { id } });
    if (!row) throw new NotFoundException();
    if (row.userId && row.userId !== userId) throw new ForbiddenException();
    if (row.anonymousSessionId !== anonymousSessionId) throw new ForbiddenException();
    if (row.userId) return this.toPublicView(row);

    const updated = await this.prisma.aiVisualization.update({
      where: { id },
      data: { userId },
    });
    return this.toPublicView(updated);
  }

  async listMine(userId: string, limit = 40) {
    const rows = await this.prisma.aiVisualization.findMany({
      where: { userId, status: { in: ['COMPLETED', 'PROCESSING', 'PENDING', 'FAILED'] } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(100, limit),
    });
    return { items: rows.map((r) => this.toPublicView(r)) };
  }

  async deleteMine(id: string, userId: string) {
    const row = await this.prisma.aiVisualization.findUnique({ where: { id } });
    if (!row || row.userId !== userId) throw new ForbiddenException();
    await this.prisma.aiVisualization.delete({ where: { id } });
    return { ok: true };
  }

  async assertDownloadAllowed(id: string, userId: string) {
    const row = await this.prisma.aiVisualization.findUnique({ where: { id } });
    if (!row || row.status !== 'COMPLETED') throw new BadRequestException('Vizualizace není ke stažení.');
    if (row.userId !== userId) throw new ForbiddenException('Stažení vyžaduje přihlášení.');
    if (!row.resultCloudinaryId) throw new BadRequestException('Chybí výsledek.');
    return row;
  }

  async getAdminStats(days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const [total, completed, failed, anonymous, loggedIn, downloads, shares] = await Promise.all([
      this.prisma.aiVisualization.count({ where: { createdAt: { gte: since } } }),
      this.prisma.aiVisualization.count({ where: { createdAt: { gte: since }, status: 'COMPLETED' } }),
      this.prisma.aiVisualization.count({ where: { createdAt: { gte: since }, status: 'FAILED' } }),
      this.prisma.aiVisualization.count({
        where: { createdAt: { gte: since }, userId: null, status: 'COMPLETED' },
      }),
      this.prisma.aiVisualization.count({
        where: { createdAt: { gte: since }, userId: { not: null }, status: 'COMPLETED' },
      }),
      this.prisma.aiVisualizationEvent.count({
        where: { createdAt: { gte: since }, eventName: 'ai_visualization_download' },
      }),
      this.prisma.aiVisualizationEvent.count({
        where: { createdAt: { gte: since }, eventName: 'ai_visualization_share' },
      }),
    ]);

    const avg = await this.prisma.aiVisualization.aggregate({
      where: { createdAt: { gte: since }, status: 'COMPLETED', completedAt: { not: null } },
      _avg: { progress: true },
    });

    const settings = await this.settings.getSettings();
    const costSum = await this.prisma.aiVisualization.aggregate({
      where: { createdAt: { gte: since }, status: 'COMPLETED' },
      _sum: { estimatedCostCzk: true },
    });

    return {
      days,
      total,
      completed,
      failed,
      anonymousCompleted: anonymous,
      loggedInCompleted: loggedIn,
      downloads,
      shares,
      avgProgressCompleted: avg._avg.progress,
      estimatedCostCzkSum: costSum._sum.estimatedCostCzk,
      estimatedCostCzkConfigured: settings.estimatedCostCzkPerGeneration,
    };
  }

  /** Worker entry — processes one pending job. */
  async processPendingJob(jobId: string) {
    const settings = await this.settings.getSettings();
    const job = await this.prisma.aiVisualization.findUnique({ where: { id: jobId } });
    if (!job || job.status !== 'PENDING' || !job.originalCloudinaryId) return;

    if (!this.openAiProvider.isReady()) {
      await this.failJob(job.id, 'PROVIDER_UNAVAILABLE', 'AI provider není nakonfigurován.');
      return;
    }

    await this.prisma.aiVisualization.update({
      where: { id: job.id },
      data: { status: 'PROCESSING', progress: 20, generationStartedAt: new Date() },
    });

    try {
      const originalBuffer = await this.storage.downloadBuffer(job.originalCloudinaryId);
      const processed = await processUploadImage(originalBuffer, 'image/jpeg', settings.maxUploadBytes);

      const prompt = buildRenovationImagePrompt({
        propertyType: job.propertyType ?? 'other',
        style: job.style ?? 'modern',
        renovationLevel: job.renovationLevel ?? 'RENOVATION',
        userPrompt: job.userPrompt ?? undefined,
      });

      await this.prisma.aiVisualization.update({ where: { id: job.id }, data: { progress: 40 } });

      const result = await this.openAiProvider.generateRenovation({
        imagePngBuffer: processed.pngBuffer,
        prompt,
        model: settings.model,
        quality: settings.outputQuality,
      });

      await this.prisma.aiVisualization.update({ where: { id: job.id }, data: { progress: 65 } });

      let resultBuffer = result.imageBuffer;
      if (settings.watermarkOnDownload) {
        resultBuffer = await this.watermark.applyPreviewWatermark(
          resultBuffer,
          true,
          settings.watermarkPosition,
        );
      }

      const previewBuffer = await this.watermark.applyPreviewWatermark(
        resultBuffer,
        settings.watermarkEnabled,
        settings.watermarkPosition,
      );

      const storedFull = await this.storage.uploadResult(resultBuffer, 'png');
      const storedPreview = await this.storage.uploadResult(previewBuffer, 'jpg');

      await this.prisma.aiVisualization.update({
        where: { id: job.id },
        data: {
          status: 'COMPLETED',
          progress: 100,
          provider: result.provider,
          model: result.model,
          resultCloudinaryId: storedFull.publicId,
          resultPreviewUrl: storedPreview.secureUrl,
          estimatedCostCzk: settings.estimatedCostCzkPerGeneration ?? undefined,
          usageMeta: (result.usageMeta ?? undefined) as Prisma.InputJsonValue | undefined,
          completedAt: new Date(),
          errorMessage: null,
          errorCode: null,
        },
      });

      await this.trackEvent({
        eventName: 'ai_visualization_complete',
        visualizationId: job.id,
        userId: job.userId,
        anonymousSessionId: job.anonymousSessionId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Generování selhalo';
      this.log.warn(`[process] ${job.id}: ${message}`);
      await this.failJob(job.id, 'GENERATION_FAILED', message);
    }
  }

  private async failJob(id: string, code: string, message: string) {
    const job = await this.prisma.aiVisualization.update({
      where: { id },
      data: {
        status: 'FAILED',
        progress: 0,
        errorCode: code,
        errorMessage: 'Vizualizaci se nepodařilo dokončit.',
      },
    });
    await this.trackEvent({
      eventName: 'ai_visualization_failed',
      visualizationId: id,
      userId: job.userId,
      anonymousSessionId: job.anonymousSessionId,
      meta: { code, internal: message.slice(0, 500) },
    });
  }
}
