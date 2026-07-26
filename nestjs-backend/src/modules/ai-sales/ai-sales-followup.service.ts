import { Injectable, NotFoundException } from '@nestjs/common';
import { AiSalesMessageStatus, AiSalesTaskStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AI_SALES_PROMPT_FEATURES } from './ai-sales.constants';
import { AiSalesKnowledgeService } from './ai-sales-knowledge.service';
import { AiSalesPromptResolverService } from './ai-sales-prompt-resolver.service';
import { AiSalesSettingsService } from './ai-sales-settings.service';
import { OpenAiService } from '../openai/openai.service';

@Injectable()
export class AiSalesFollowUpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AiSalesSettingsService,
    private readonly knowledge: AiSalesKnowledgeService,
    private readonly promptResolver: AiSalesPromptResolverService,
    private readonly openai: OpenAiService,
  ) {}

  async scanAndCreateSuggestions(userId?: string) {
    const cfg = await this.settings.getOrCreate();
    const now = Date.now();
    const firstMs = cfg.followUpFirstDays * 86400000;
    const secondMs = cfg.followUpSecondDays * 86400000;

    const sentMessages = await this.prisma.aiSalesMessage.findMany({
      where: {
        status: AiSalesMessageStatus.SENT,
        repliedAt: null,
        direction: 'OUTBOUND',
        prospect: { doNotContact: false },
      },
      include: { prospect: true },
      take: 200,
    });

    const created: Array<{ taskId: string; prospectId: string; tier: number }> = [];

    for (const msg of sentMessages) {
      if (!msg.sentAt || !msg.prospect) continue;
      const age = now - msg.sentAt.getTime();
      let tier: 1 | 2 | null = null;
      if (age >= secondMs) tier = 2;
      else if (age >= firstMs) tier = 1;
      if (!tier) continue;

      const title = tier === 1 ? 'Follow-up (1. připomínka)' : 'Follow-up (poslední připomínka)';
      const existing = await this.prisma.aiSalesTask.findFirst({
        where: {
          prospectId: msg.prospectId,
          title,
          status: { in: [AiSalesTaskStatus.PENDING, AiSalesTaskStatus.CONFIRMED] },
        },
      });
      if (existing) continue;

      const draft = await this.generateFollowUpDraft(msg.id, tier, userId);

      const task = await this.prisma.aiSalesTask.create({
        data: {
          prospectId: msg.prospectId,
          title,
          description: draft.body,
          status: AiSalesTaskStatus.PENDING,
          dueAt: new Date(),
          createdById: userId,
        },
      });

      created.push({ taskId: task.id, prospectId: msg.prospectId, tier });
    }

    return { scanned: sentMessages.length, created: created.length, tasks: created };
  }

  async listFollowUps(limit = 50) {
    return this.prisma.aiSalesTask.findMany({
      where: {
        status: { in: [AiSalesTaskStatus.PENDING, AiSalesTaskStatus.CONFIRMED] },
        title: { contains: 'Follow-up' },
      },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
      take: limit,
      include: {
        prospect: {
          select: {
            id: true,
            companyName: true,
            partnerType: true,
            fitScore: true,
            priority: true,
            email: true,
            status: true,
          },
        },
      },
    });
  }

  async generateFollowUpDraft(messageId: string, tier: 1 | 2, userId?: string) {
    const msg = await this.prisma.aiSalesMessage.findUnique({
      where: { id: messageId },
      include: { prospect: true },
    });
    if (!msg || !msg.prospect) throw new NotFoundException('Zpráva nenalezena.');

    const knowledge = await this.knowledge.retrieveRelevant({
      query: `follow-up ${msg.prospect.partnerType}`,
      limit: 3,
    });

    let systemPrompt: string;
    try {
      const resolved = await this.promptResolver.resolveActive(AI_SALES_PROMPT_FEATURES.FOLLOW_UP, {
        approvedKnowledge: knowledge.map((k) => k.answer).join('\n'),
        partnerType: msg.prospect.partnerType,
        companyName: msg.prospect.companyName,
        city: msg.prospect.city ?? '',
        publicInfo: msg.prospect.publicInfo ?? '',
      });
      systemPrompt = resolved.systemPrompt;
    } catch {
      systemPrompt =
        'Připrav stručný follow-up e-mail v češtině. Nevymýšlej fakta. Vrať JSON: { "subject": "...", "body": "..." }';
    }

    const userPrompt = `Follow-up úroveň ${tier} pro firmu ${msg.prospect.companyName}.
Původní předmět: ${msg.subject ?? '—'}
Původní text: ${msg.content.slice(0, 800)}
Použij pouze známé informace. Pokud něco nevíš, napiš Nezjištěno.`;

    const result = await this.openai.complete({
      feature: 'ai_sales',
      systemPrompt,
      userPrompt,
      userId,
      jsonMode: true,
      adminTest: false,
    });

    let parsed: { subject?: string; body?: string } = {};
    try {
      parsed = JSON.parse(result.text);
    } catch {
      parsed = { body: result.text, subject: `Re: ${msg.subject ?? msg.prospect.companyName}` };
    }

    return {
      messageId,
      tier,
      subject: parsed.subject ?? `Re: ${msg.subject ?? 'spolupráce XXREALIT'}`,
      body: parsed.body ?? result.text,
      usage: result,
    };
  }
}
