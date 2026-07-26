import { Injectable } from '@nestjs/common';
import { AiKnowledgeStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class AiChatKnowledgeService {
  constructor(private readonly prisma: PrismaService) {}

  async searchApproved(query: string, limit = 5) {
    const q = query.trim().slice(0, 200);
    if (!q) return [];
    return this.prisma.aiKnowledgeItem.findMany({
      where: {
        status: AiKnowledgeStatus.APPROVED,
        OR: [
          { question: { contains: q, mode: 'insensitive' } },
          { answer: { contains: q, mode: 'insensitive' } },
          { title: { contains: q, mode: 'insensitive' } },
        ],
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: { id: true, title: true, category: true, question: true, answer: true },
    });
  }

  async list(filters?: { status?: AiKnowledgeStatus; category?: string; q?: string }) {
    return this.prisma.aiKnowledgeItem.findMany({
      where: {
        ...(filters?.status ? { status: filters.status } : {}),
        ...(filters?.category ? { category: filters.category } : {}),
        ...(filters?.q?.trim()
          ? {
              OR: [
                { title: { contains: filters.q.trim(), mode: 'insensitive' } },
                { question: { contains: filters.q.trim(), mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
  }

  async create(input: {
    title: string;
    category: string;
    question: string;
    answer: string;
    keywordsJson?: string[];
    createdById?: string;
    source?: string;
  }) {
    return this.prisma.aiKnowledgeItem.create({
      data: {
        title: input.title,
        category: input.category,
        question: input.question,
        answer: input.answer,
        keywordsJson: input.keywordsJson ?? [],
        createdById: input.createdById,
        source: input.source ?? 'MANUAL',
        status: AiKnowledgeStatus.DRAFT,
      },
    });
  }

  async update(id: string, patch: Partial<{
    title: string;
    category: string;
    question: string;
    answer: string;
    keywordsJson: string[];
  }>) {
    return this.prisma.aiKnowledgeItem.update({
      where: { id },
      data: { ...patch, version: { increment: 1 } },
    });
  }

  async approve(id: string, approvedById?: string) {
    return this.prisma.aiKnowledgeItem.update({
      where: { id },
      data: {
        status: AiKnowledgeStatus.APPROVED,
        approvedById,
        approvedAt: new Date(),
      },
    });
  }

  async archive(id: string) {
    return this.prisma.aiKnowledgeItem.update({
      where: { id },
      data: { status: AiKnowledgeStatus.ARCHIVED },
    });
  }

  async createDraftFromFeedback(input: {
    question: string;
    answer: string;
    category?: string;
    createdById?: string;
  }) {
    return this.create({
      title: input.question.slice(0, 120),
      category: input.category ?? 'Podpora',
      question: input.question,
      answer: input.answer,
      source: 'FEEDBACK_REVIEW',
      createdById: input.createdById,
    });
  }
}
