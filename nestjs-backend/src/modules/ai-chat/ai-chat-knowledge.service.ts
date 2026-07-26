import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AiKnowledgeStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

export type KnowledgeSearchResult = {
  id: string;
  title: string;
  category: string;
  question: string;
  answer: string;
  score: number;
};

@Injectable()
export class AiChatKnowledgeService {
  constructor(private readonly prisma: PrismaService) {}

  async retrieveRelevant(input: {
    query: string;
    intent?: string | null;
    limit?: number;
  }): Promise<KnowledgeSearchResult[]> {
    const limit = Math.min(6, input.limit ?? 4);
    const q = input.query.trim().slice(0, 200);
    const now = new Date();

    const rows = await this.prisma.aiKnowledgeItem.findMany({
      where: {
        status: AiKnowledgeStatus.APPROVED,
        OR: [{ validFrom: null }, { validFrom: { lte: now } }],
        AND: [{ OR: [{ validTo: null }, { validTo: { gte: now } }] }],
      },
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
      take: 100,
    });

    const terms = [
      ...q.toLowerCase().split(/\s+/).filter((t) => t.length > 2),
      ...(input.intent ? [input.intent.toLowerCase()] : []),
    ];

    const scored = rows
      .map((row) => {
        let score = row.priority;
        const hay = `${row.title} ${row.question} ${row.answer} ${JSON.stringify(row.keywordsJson ?? [])}`.toLowerCase();
        for (const term of terms) {
          if (hay.includes(term)) score += 10;
        }
        if (input.intent && row.category.includes(input.intent.replace('_', ''))) score += 5;
        if (q && row.question.toLowerCase().includes(q.toLowerCase())) score += 15;
        return { row, score };
      })
      .filter((s) => s.score > 0 || !q)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return scored.map(({ row, score }) => ({
      id: row.id,
      title: row.title,
      category: row.category,
      question: row.question,
      answer: row.answer,
      score,
    }));
  }

  async searchApproved(query: string, limit = 5) {
    return this.retrieveRelevant({ query, limit });
  }

  async list(filters?: {
    status?: AiKnowledgeStatus;
    category?: string;
    q?: string;
    minPriority?: number;
  }) {
    return this.prisma.aiKnowledgeItem.findMany({
      where: {
        ...(filters?.status ? { status: filters.status } : {}),
        ...(filters?.category ? { category: filters.category } : {}),
        ...(filters?.minPriority != null ? { priority: { gte: filters.minPriority } } : {}),
        ...(filters?.q?.trim()
          ? {
              OR: [
                { title: { contains: filters.q.trim(), mode: 'insensitive' } },
                { question: { contains: filters.q.trim(), mode: 'insensitive' } },
                { answer: { contains: filters.q.trim(), mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
      take: 200,
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        approvedBy: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async getById(id: string) {
    const row = await this.prisma.aiKnowledgeItem.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        approvedBy: { select: { id: true, name: true, email: true } },
      },
    });
    if (!row) throw new NotFoundException('Znalost nenalezena.');
    const audit = await this.prisma.aiKnowledgeAuditLog.findMany({
      where: { knowledgeId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return { ...row, audit };
  }

  async create(input: {
    title: string;
    category: string;
    question: string;
    answer: string;
    keywordsJson?: string[];
    priority?: number;
    source?: string;
    validFrom?: Date;
    validTo?: Date;
    createdById?: string;
  }) {
    const row = await this.prisma.aiKnowledgeItem.create({
      data: {
        title: input.title,
        category: input.category,
        question: input.question,
        answer: input.answer,
        keywordsJson: input.keywordsJson ?? [],
        priority: input.priority ?? 0,
        validFrom: input.validFrom ?? null,
        validTo: input.validTo ?? null,
        createdById: input.createdById,
        source: input.source ?? 'MANUAL',
        status: AiKnowledgeStatus.DRAFT,
      },
    });
    await this.logAudit(row.id, 'CREATE', null, row.answer, 'Vytvoření', input.createdById);
    return row;
  }

  async update(
    id: string,
    patch: Partial<{
      title: string;
      category: string;
      question: string;
      answer: string;
      keywordsJson: string[];
      priority: number;
      validFrom: Date | null;
      validTo: Date | null;
    }>,
    userId?: string,
  ) {
    const existing = await this.prisma.aiKnowledgeItem.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Znalost nenalezena.');

    const updated = await this.prisma.aiKnowledgeItem.update({
      where: { id },
      data: { ...patch, version: { increment: 1 } },
    });

    if (patch.answer) {
      await this.logAudit(id, 'UPDATE', existing.answer, patch.answer, 'Úprava odpovědi', userId);
    }
    return updated;
  }

  async approve(id: string, approvedById?: string) {
    const existing = await this.prisma.aiKnowledgeItem.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Znalost nenalezena.');
    const updated = await this.prisma.aiKnowledgeItem.update({
      where: { id },
      data: {
        status: AiKnowledgeStatus.APPROVED,
        approvedById,
        approvedAt: new Date(),
        archivedAt: null,
      },
    });
    await this.logAudit(id, 'APPROVE', existing.answer, existing.answer, 'Schválení', approvedById);
    return updated;
  }

  async archive(id: string, userId?: string) {
    const existing = await this.prisma.aiKnowledgeItem.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Znalost nenalezena.');
    const updated = await this.prisma.aiKnowledgeItem.update({
      where: { id },
      data: { status: AiKnowledgeStatus.ARCHIVED, archivedAt: new Date() },
    });
    await this.logAudit(id, 'ARCHIVE', existing.answer, existing.answer, 'Archivace', userId);
    return updated;
  }

  async duplicate(id: string, createdById?: string) {
    const row = await this.prisma.aiKnowledgeItem.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Znalost nenalezena.');
    return this.create({
      title: `${row.title} (kopie)`,
      category: row.category,
      question: row.question,
      answer: row.answer,
      keywordsJson: (row.keywordsJson as string[]) ?? [],
      priority: row.priority,
      source: 'DUPLICATE',
      createdById,
    });
  }

  async delete(id: string, userId?: string) {
    const row = await this.prisma.aiKnowledgeItem.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Znalost nenalezena.');
    if (row.status === AiKnowledgeStatus.APPROVED) {
      throw new BadRequestException('Schválenou znalost nelze smazat. Nejprve archivujte.');
    }
    await this.logAudit(id, 'DELETE', row.answer, null, 'Smazání', userId);
    await this.prisma.aiKnowledgeItem.delete({ where: { id } });
    return { success: true };
  }

  async testInChat(id: string, testQuestion: string) {
    const row = await this.prisma.aiKnowledgeItem.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Znalost nenalezena.');

    const results = await this.retrieveRelevant({ query: testQuestion, limit: 6 });
    const matched = results.find((r) => r.id === id);
    const wouldUseApprovedOnly = row.status === AiKnowledgeStatus.APPROVED;

    return {
      knowledgeId: id,
      status: row.status,
      testQuestion,
      matched: Boolean(matched),
      relevanceScore: matched?.score ?? 0,
      wouldBeIncludedInPrompt: wouldUseApprovedOnly && Boolean(matched),
      topResults: results,
    };
  }

  async createDraftFromFeedback(input: {
    question: string;
    answer: string;
    category?: string;
    createdById?: string;
  }) {
    return this.create({
      title: input.question.slice(0, 120),
      category: input.category ?? 'SUPPORT',
      question: input.question,
      answer: input.answer,
      source: 'FEEDBACK_REVIEW',
      createdById: input.createdById,
    });
  }

  private async logAudit(
    knowledgeId: string,
    action: string,
    previousAnswer: string | null,
    newAnswer: string | null,
    changeDescription?: string,
    performedById?: string,
  ) {
    try {
      await this.prisma.aiKnowledgeAuditLog.create({
        data: {
          knowledgeId,
          action,
          previousAnswer,
          newAnswer,
          changeDescription: changeDescription ?? null,
          performedById: performedById ?? null,
        },
      });
    } catch {
      // audit nesmí blokovat operaci
    }
  }
}
