import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AiInfluencerReelJobStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AI_INFLUENCER_WORKER_TICK_MS } from './ai-influencer.constants';
import { AiInfluencerJobService } from './ai-influencer-job.service';
import { AiInfluencerProviderRegistry } from './ai-influencer-provider.registry';

@Injectable()
export class AiInfluencerWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(AiInfluencerWorkerService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: AiInfluencerJobService,
    private readonly registry: AiInfluencerProviderRegistry,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), AI_INFLUENCER_WORKER_TICK_MS);
    void this.registry.getDefaultProfile();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const active = await this.prisma.aiInfluencerReelJob.findMany({
        where: {
          status: {
            in: [
              AiInfluencerReelJobStatus.EVALUATING,
              AiInfluencerReelJobStatus.CANDIDATE,
              AiInfluencerReelJobStatus.VOICE_GENERATING,
              AiInfluencerReelJobStatus.VOICE_READY,
              AiInfluencerReelJobStatus.AVATAR_GENERATING,
              AiInfluencerReelJobStatus.AVATAR_READY,
            ],
          },
        },
        orderBy: { createdAt: 'asc' },
        take: 3,
        select: { id: true },
      });

      for (const row of active) {
        try {
          await this.jobs.advanceJob(row.id);
        } catch (err) {
          this.log.warn(
            `AI influencer job ${row.id} tick failed: ${err instanceof Error ? err.message : err}`,
          );
        }
      }
    } finally {
      this.running = false;
    }
  }
}
