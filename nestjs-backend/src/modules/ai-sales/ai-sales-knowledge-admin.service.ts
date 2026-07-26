import { Injectable, NotFoundException } from '@nestjs/common';
import { AiKnowledgeStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AI_SALES_KNOWLEDGE_CATEGORIES } from './ai-sales.constants';

const SALES_CATEGORIES = new Set<string>(AI_SALES_KNOWLEDGE_CATEGORIES);

@Injectable()
export class AiSalesKnowledgeAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async list(filters?: { status?: AiKnowledgeStatus; category?: string; q?: string }) {
    return this.prisma.aiKnowledgeItem.findMany({
      where: {
        category: { in: [...SALES_CATEGORIES] },
        ...(filters?.status ? { status: filters.status } : {}),
        ...(filters?.category ? { category: filters.category } : {}),
        ...(filters?.q
          ? {
              OR: [
                { title: { contains: filters.q, mode: 'insensitive' } },
                { question: { contains: filters.q, mode: 'insensitive' } },
                { answer: { contains: filters.q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
      take: 200,
    });
  }

  async getById(id: string) {
    const row = await this.prisma.aiKnowledgeItem.findUnique({ where: { id } });
    if (!row || !SALES_CATEGORIES.has(row.category)) throw new NotFoundException('Znalost nenalezena.');
    return row;
  }

  async create(input: {
    title: string;
    category: string;
    question: string;
    answer: string;
    keywords?: string[];
    priority?: number;
    createdById?: string;
  }) {
    return this.prisma.aiKnowledgeItem.create({
      data: {
        title: input.title,
        category: input.category,
        question: input.question,
        answer: input.answer,
        keywordsJson: input.keywords ?? [],
        priority: input.priority ?? 50,
        status: AiKnowledgeStatus.DRAFT,
        source: 'AI_SALES_ADMIN',
        createdById: input.createdById,
      },
    });
  }

  async update(
    id: string,
    patch: Partial<{
      title: string;
      category: string;
      question: string;
      answer: string;
      keywords: string[];
      priority: number;
      status: AiKnowledgeStatus;
    }>,
  ) {
    await this.getById(id);
    return this.prisma.aiKnowledgeItem.update({
      where: { id },
      data: {
        ...(patch.title ? { title: patch.title } : {}),
        ...(patch.category ? { category: patch.category } : {}),
        ...(patch.question ? { question: patch.question } : {}),
        ...(patch.answer ? { answer: patch.answer } : {}),
        ...(patch.keywords ? { keywordsJson: patch.keywords } : {}),
        ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
        ...(patch.status ? { status: patch.status } : {}),
      },
    });
  }

  async approve(id: string, userId?: string) {
    await this.getById(id);
    return this.prisma.aiKnowledgeItem.update({
      where: { id },
      data: { status: AiKnowledgeStatus.APPROVED, approvedById: userId, approvedAt: new Date() },
    });
  }
}
