import { Injectable, Logger } from '@nestjs/common';
import { AiKnowledgeStatus, AiPromptStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  SEED_AI_SALES_KNOWLEDGE,
  SEED_AI_SALES_PROMPTS,
  SEED_TEST_PROSPECT,
} from './ai-sales-default-prompts';

@Injectable()
export class AiSalesSeedService {
  private readonly log = new Logger(AiSalesSeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  async seedIfEmpty() {
    await this.prisma.aiSalesSettings.upsert({
      where: { id: 'default' },
      create: { id: 'default' },
      update: {},
    });

    for (const p of SEED_AI_SALES_PROMPTS) {
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
          status: p.status,
          changeDescription: p.changeDescription,
          activatedAt: p.status === 'ACTIVE' ? new Date() : null,
        },
      });
      this.log.log(`Seed AI sales prompt: ${p.feature}`);
    }

    for (const k of SEED_AI_SALES_KNOWLEDGE) {
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
          status: AiKnowledgeStatus.APPROVED,
          source: 'AI_SALES_SEED',
        },
      });
      this.log.log(`Seed AI sales knowledge: ${k.title}`);
    }

    const testProspect = await this.prisma.aiSalesProspect.findFirst({
      where: { companyName: SEED_TEST_PROSPECT.companyName, source: 'SEED_TEST' },
    });
    if (!testProspect) {
      await this.prisma.aiSalesProspect.create({
        data: {
          ...SEED_TEST_PROSPECT,
          status: 'NEW',
          verificationStatus: 'UNVERIFIED',
        },
      });
      this.log.log('Seed test prospect: Test Reality Pardubice');
    }
  }
}
