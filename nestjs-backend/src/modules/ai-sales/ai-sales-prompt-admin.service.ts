import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AiPromptStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AI_SALES_PROMPT_FEATURES } from './ai-sales.constants';

const SALES_FEATURES = new Set(Object.values(AI_SALES_PROMPT_FEATURES));

@Injectable()
export class AiSalesPromptAdminService {
  constructor(private readonly prisma: PrismaService) {}

  private assertSalesFeature(feature: string) {
    if (!SALES_FEATURES.has(feature as never) && !feature.startsWith('AI_SALES_')) {
      throw new BadRequestException('Neplatný typ promptu AI obchodníka.');
    }
  }

  async list() {
    return this.prisma.aiPromptVersion.findMany({
      where: { feature: { startsWith: 'AI_SALES_' } },
      orderBy: [{ feature: 'asc' }, { createdAt: 'desc' }],
      take: 200,
    });
  }

  async getById(id: string) {
    const row = await this.prisma.aiPromptVersion.findUnique({ where: { id } });
    if (!row || !row.feature.startsWith('AI_SALES_')) throw new NotFoundException('Prompt nenalezen.');
    return row;
  }

  async create(input: {
    feature: string;
    name: string;
    version: string;
    systemPrompt: string;
    changeDescription?: string;
    createdById?: string;
  }) {
    this.assertSalesFeature(input.feature);
    return this.prisma.aiPromptVersion.create({
      data: {
        feature: input.feature,
        name: input.name,
        version: input.version,
        systemPrompt: input.systemPrompt,
        changeDescription: input.changeDescription,
        status: AiPromptStatus.DRAFT,
        createdById: input.createdById,
      },
    });
  }

  async update(
    id: string,
    patch: Partial<{ name: string; systemPrompt: string; changeDescription: string }>,
    userId?: string,
  ) {
    const existing = await this.getById(id);
    if (existing.status === AiPromptStatus.ACTIVE && patch.systemPrompt) {
      throw new BadRequestException('Aktivní prompt upravte vytvořením nové verze.');
    }
    return this.prisma.aiPromptVersion.update({
      where: { id },
      data: {
        ...(patch.name ? { name: patch.name } : {}),
        ...(patch.systemPrompt ? { systemPrompt: patch.systemPrompt } : {}),
        ...(patch.changeDescription ? { changeDescription: patch.changeDescription } : {}),
        ...(userId ? { createdById: userId } : {}),
      },
    });
  }

  async activate(id: string, userId?: string) {
    const row = await this.getById(id);
    await this.prisma.aiPromptVersion.updateMany({
      where: { feature: row.feature, status: AiPromptStatus.ACTIVE },
      data: { status: AiPromptStatus.ARCHIVED, archivedAt: new Date() },
    });
    return this.prisma.aiPromptVersion.update({
      where: { id },
      data: { status: AiPromptStatus.ACTIVE, activatedAt: new Date(), approvedById: userId },
    });
  }
}
