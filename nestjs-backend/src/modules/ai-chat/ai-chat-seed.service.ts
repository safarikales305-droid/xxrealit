import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { AiKnowledgeStatus, AiPromptStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { SEED_KNOWLEDGE_DRAFTS, SEED_PROMPTS } from './ai-chat-default-prompts';

@Injectable()
export class AiChatSeedService implements OnModuleInit {
  private readonly log = new Logger(AiChatSeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      await this.seedIfEmpty();
    } catch (err) {
      this.log.warn(`AI chat seed selhal: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async seedIfEmpty() {
    for (const p of SEED_PROMPTS) {
      const existing = await this.prisma.aiPromptVersion.findUnique({
        where: { feature_version: { feature: p.feature, version: p.version } },
      });
      if (existing) continue;

      if (p.status === 'ACTIVE') {
        await this.prisma.aiPromptVersion.updateMany({
          where: { feature: p.feature, status: AiPromptStatus.ACTIVE },
          data: { status: AiPromptStatus.ARCHIVED, archivedAt: new Date() },
        });
      }

      await this.prisma.aiPromptVersion.create({
        data: {
          feature: p.feature,
          name: p.name,
          version: p.version,
          systemPrompt: p.systemPrompt,
          status: p.status as AiPromptStatus,
          changeDescription: p.changeDescription,
          activatedAt: p.status === 'ACTIVE' ? new Date() : null,
        },
      });
      this.log.log(`Seed prompt: ${p.feature} v${p.version}`);
    }

    for (const k of SEED_KNOWLEDGE_DRAFTS) {
      const dup = await this.prisma.aiKnowledgeItem.findFirst({
        where: { title: k.title, category: k.category },
      });
      if (dup) continue;

      await this.prisma.aiKnowledgeItem.create({
        data: {
          title: k.title,
          category: k.category,
          question: k.question,
          answer: k.answer,
          keywordsJson: k.keywords,
          priority: k.priority,
          status: AiKnowledgeStatus.DRAFT,
          source: 'SEED',
        },
      });
      this.log.log(`Seed knowledge draft: ${k.title}`);
    }
  }
}
