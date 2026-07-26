import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AiSalesAnalysisStatus,
  AiSalesPartnerType,
  AiSalesPriority,
  AiSalesProspectStatus,
} from '@prisma/client';
import { OpenAiService } from '../openai/openai.service';
import { PrismaService } from '../../database/prisma.service';
import { AI_SALES_PROMPT_FEATURES } from './ai-sales.constants';
import { AiSalesKnowledgeService } from './ai-sales-knowledge.service';
import { AiSalesPromptResolverService } from './ai-sales-prompt-resolver.service';
import { AiSalesProspectService } from './ai-sales-prospect.service';
import { AiSalesSettingsService } from './ai-sales-settings.service';

type PartnerAnalysisResult = {
  partnerType?: string;
  fitScore?: number;
  priority?: string;
  recommendedOffer?: string;
  reasons?: string[];
  risks?: string[];
  missingInformation?: string[];
  recommendedNextStep?: string;
  recommendedTone?: string;
  summary?: string;
  activityType?: string;
  serviceArea?: string;
  personalizationPoints?: string[];
};

@Injectable()
export class AiSalesAnalysisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly prospects: AiSalesProspectService,
    private readonly knowledge: AiSalesKnowledgeService,
    private readonly promptResolver: AiSalesPromptResolverService,
    private readonly openai: OpenAiService,
    private readonly settings: AiSalesSettingsService,
  ) {}

  async analyzeProspect(prospectId: string, userId?: string, testMode = false) {
    if (!testMode) await this.assertDailyAnalysisLimit();
    const prospect = await this.prospects.getById(prospectId);

    const knowledge = await this.knowledge.retrieveRelevant({
      query: `${prospect.companyName} ${prospect.partnerType} ${prospect.city ?? ''}`,
      limit: 4,
    });

    const prompt = await this.promptResolver.resolveActive(
      AI_SALES_PROMPT_FEATURES.PARTNER_ANALYSIS,
      {
        approvedKnowledge: knowledge.map((k) => `Q: ${k.question}\nA: ${k.answer}`).join('\n\n'),
        partnerType: prospect.partnerType,
        companyName: prospect.companyName,
        city: prospect.city ?? '',
        publicInfo: prospect.publicInfo ?? '',
      },
    );

    const userPrompt = `Analyzuj tohoto potenciálního partnera:

Firma: ${prospect.companyName}
Typ: ${prospect.partnerType}
Kontakt: ${prospect.contactName ?? '—'}
Město: ${prospect.city ?? '—'}
Kraj: ${prospect.region ?? '—'}
Web: ${prospect.website ?? '—'}
Specializace: ${prospect.specialization ?? '—'}
Veřejné informace: ${prospect.publicInfo ?? '—'}
Zdroj: ${prospect.source}`;

    const result = await this.openai.complete({
      feature: 'ai_sales',
      systemPrompt: prompt.systemPrompt,
      userPrompt,
      userId,
      jsonMode: true,
      adminTest: testMode,
    });

    let parsed: PartnerAnalysisResult = {};
    try {
      parsed = JSON.parse(result.text) as PartnerAnalysisResult;
    } catch {
      parsed = { summary: result.text, fitScore: 50 };
    }

    const fitScore = Math.max(0, Math.min(100, Number(parsed.fitScore) || 50));
    const priority = this.mapPriority(parsed.priority, fitScore);

    if (!testMode) {
      await this.prisma.aiSalesProspect.update({
        where: { id: prospectId },
        data: {
          fitScore,
          priority,
          fitReasonsJson: parsed.reasons ?? [],
          fitRisksJson: parsed.risks ?? [],
          analysisJson: parsed,
          analysisStatus: AiSalesAnalysisStatus.COMPLETED,
          analyzedAt: new Date(),
          status:
            fitScore >= 60
              ? AiSalesProspectStatus.READY_FOR_OUTREACH
              : AiSalesProspectStatus.NEEDS_REVIEW,
        },
      });
    }

    return {
      prospectId,
      analysis: parsed,
      fitScore,
      priority,
      knowledge,
      promptVersionId: prompt.id,
      usage: {
        model: result.model,
        totalTokens: result.totalTokens,
        estimatedCostCzk: result.estimatedCostCzk,
        durationMs: result.durationMs,
      },
    };
  }

  async generateOutreachMessage(
    prospectId: string,
    userId?: string,
    options?: { campaignId?: string; testMode?: boolean },
  ) {
    const prospect = await this.prospects.getById(prospectId);
    if (prospect.doNotContact) {
      throw new ForbiddenException('Kontakt je v režimu DO_NOT_CONTACT.');
    }
    if (
      !options?.testMode &&
      prospect.status !== AiSalesProspectStatus.APPROVED &&
      prospect.status !== AiSalesProspectStatus.READY_FOR_OUTREACH
    ) {
      throw new ForbiddenException('Partner musí být nejdříve schválen administrátorem.');
    }

    const analysis = (prospect.analysisJson ?? {}) as PartnerAnalysisResult;
    const knowledge = await this.knowledge.retrieveRelevant({
      query: `${prospect.partnerType} ${prospect.companyName}`,
      limit: 5,
    });

    const prompt = await this.promptResolver.resolveActive(
      AI_SALES_PROMPT_FEATURES.FIRST_OUTREACH,
      {
        approvedKnowledge: knowledge.map((k) => `Q: ${k.question}\nA: ${k.answer}`).join('\n\n'),
        partnerType: prospect.partnerType,
        companyName: prospect.companyName,
        city: prospect.city ?? '',
        publicInfo: prospect.publicInfo ?? '',
      },
    );

    const userPrompt = `Připrav první obchodní e-mail pro:

Firma: ${prospect.companyName}
Typ partnera: ${prospect.partnerType}
Kontakt: ${prospect.contactName ?? 'vážený partner'}
Město: ${prospect.city ?? '—'}
Doporučená nabídka: ${analysis.recommendedOffer ?? 'prezentace na XXREALIT'}
Důvody vhodnosti: ${(analysis.reasons ?? []).join('; ') || '—'}
Personalizační body: ${(analysis.personalizationPoints ?? []).join('; ') || '—'}`;

    const result = await this.openai.complete({
      feature: 'ai_sales',
      systemPrompt: prompt.systemPrompt,
      userPrompt,
      userId,
      jsonMode: true,
      adminTest: options?.testMode,
    });

    let parsed: {
      subject?: string;
      greeting?: string;
      body?: string;
      outreachReason?: string;
      recommendedOffer?: string;
      callToAction?: string;
    } = {};
    try {
      parsed = JSON.parse(result.text);
    } catch {
      parsed = { body: result.text, subject: `Spolupráce s XXREALIT — ${prospect.companyName}` };
    }

    const greeting = parsed.greeting ?? `Dobrý den${prospect.contactName ? `, ${prospect.contactName}` : ''},`;
    const fullContent = `${greeting}\n\n${parsed.body ?? ''}\n\nS pozdravem,\nTým XXREALIT`;

    if (options?.testMode) {
      return {
        subject: parsed.subject,
        content: fullContent,
        outreachReason: parsed.outreachReason,
        recommendedOffer: parsed.recommendedOffer,
        knowledge,
        promptVersionId: prompt.id,
        usage: result,
      };
    }

    const message = await this.prisma.aiSalesMessage.create({
      data: {
        prospectId,
        campaignId: options?.campaignId,
        messageType: 'FIRST_OUTREACH',
        subject: parsed.subject ?? `Možnost spolupráce — ${prospect.companyName}`,
        content: fullContent,
        status: 'PENDING_APPROVAL',
        outreachReason: parsed.outreachReason ?? analysis.reasons?.[0],
        recommendedOffer: parsed.recommendedOffer ?? analysis.recommendedOffer,
        knowledgeUsedJson: knowledge,
        promptVersionId: prompt.id,
        promptFeature: AI_SALES_PROMPT_FEATURES.FIRST_OUTREACH,
        createdById: userId,
      },
    });

    await this.prisma.aiSalesProspect.update({
      where: { id: prospectId },
      data: { status: AiSalesProspectStatus.READY_FOR_OUTREACH },
    });

    return { message, knowledge, usage: result };
  }

  private mapPriority(raw: string | undefined, fitScore: number): AiSalesPriority {
    if (raw === 'HIGH' || fitScore >= 80) return AiSalesPriority.HIGH;
    if (raw === 'LOW' || fitScore < 30) return AiSalesPriority.LOW;
    return AiSalesPriority.MEDIUM;
  }

  private async assertDailyAnalysisLimit() {
    const settings = await this.settings.getOrCreate();
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const count = await this.prisma.aiSalesProspect.count({
      where: { analyzedAt: { gte: dayStart }, analysisStatus: AiSalesAnalysisStatus.COMPLETED },
    });
    if (count >= settings.dailyAnalysisLimit) {
      throw new ForbiddenException(`Denní limit AI analýz (${settings.dailyAnalysisLimit}) byl překročen.`);
    }
  }
}
