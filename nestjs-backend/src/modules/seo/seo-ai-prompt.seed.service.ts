import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AiPromptStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { SEO_AI_PROMPT_SEEDS } from './seo-ai-prompt.defaults';

@Injectable()
export class SeoAiPromptSeedService implements OnModuleInit {
  private readonly log = new Logger(SeoAiPromptSeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.seedPromptsIfMissing();
    } catch (err) {
      this.log.warn(`SEO AI prompt seed skipped: ${err instanceof Error ? err.message : err}`);
    }
  }

  async seedPromptsIfMissing() {
    for (const seed of SEO_AI_PROMPT_SEEDS) {
      const existing = await this.prisma.aiPromptVersion.findUnique({
        where: { feature_version: { feature: seed.feature, version: seed.version } },
      });
      if (existing) continue;
      await this.prisma.aiPromptVersion.create({
        data: {
          feature: seed.feature,
          version: seed.version,
          name: seed.name,
          systemPrompt: seed.systemPrompt,
          status: seed.feature === 'SEO_PAGE_GENERATION' ? AiPromptStatus.ACTIVE : AiPromptStatus.DRAFT,
          activatedAt: seed.feature === 'SEO_PAGE_GENERATION' ? new Date() : undefined,
          changeDescription: 'Výchozí SEO AI prompt',
        },
      });
      this.log.log(`Seeded SEO AI prompt ${seed.feature}@${seed.version}`);
    }
  }
}
