import { Injectable } from '@nestjs/common';
import { AiKnowledgeStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class AiSalesKnowledgeService {
  constructor(private readonly prisma: PrismaService) {}

  async retrieveRelevant(input: {
    query: string;
    category?: string;
    limit?: number;
  }) {
    const limit = Math.min(6, input.limit ?? 4);
    const q = input.query.trim().toLowerCase();
    const now = new Date();

    const rows = await this.prisma.aiKnowledgeItem.findMany({
      where: {
        status: AiKnowledgeStatus.APPROVED,
        category: input.category
          ? input.category
          : {
              in: [
                'XXREALIT_GENERAL',
                'AGENT_OFFER',
                'AGENCY_OFFER',
                'CONSTRUCTION_COMPANY_OFFER',
                'DEVELOPER_OFFER',
                'FINANCIAL_ADVISOR_OFFER',
                'INVESTOR_OFFER',
                'PRICING',
                'REGISTRATION',
                'MARKETING',
                'LEADS',
                'SOCIAL_PUBLISHING',
                'CONTACT_RULES',
                'LEGAL_AND_PRIVACY',
                'FREQUENT_OBJECTIONS',
              ],
            },
        OR: [{ validFrom: null }, { validFrom: { lte: now } }],
        AND: [{ OR: [{ validTo: null }, { validTo: { gte: now } }] }],
      },
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
      take: 80,
    });

    const terms = q.split(/\s+/).filter((t) => t.length > 2);

    return rows
      .map((row) => {
        let score = row.priority;
        const hay = `${row.title} ${row.question} ${row.answer} ${JSON.stringify(row.keywordsJson ?? [])}`.toLowerCase();
        for (const term of terms) {
          if (hay.includes(term)) score += 10;
        }
        if (q && row.question.toLowerCase().includes(q)) score += 15;
        return { row, score };
      })
      .filter((s) => s.score > 0 || !q)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ row, score }) => ({
        id: row.id,
        title: row.title,
        category: row.category,
        question: row.question,
        answer: row.answer,
        score,
      }));
  }
}
