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
  companyName?: string;
  website?: string;
  city?: string;
  region?: string;
  companyType?: string;
  specialization?: string[];
  companySize?: string;
  services?: string[];
  references?: string;
  publicContacts?: string;
  socialNetworks?: string;
  serviceArea?: string;
  industries?: string[];
  fitScore?: number;
  priority?: string;
  recommendedOffer?: string;
  reasons?: string[];
  risks?: string[];
  strengths?: string[];
  weaknesses?: string[];
  servicesOffered?: string[];
  xxrealitBenefits?: string[];
  cooperationProbability?: string;
  missingInformation?: string[];
  recommendedNextStep?: string;
  recommendedTone?: string;
  summary?: string;
  aiRecommendation?: string;
  activityType?: string;
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
E-mail: ${prospect.email ?? prospect.primaryEmail ?? '—'}
Telefon: ${prospect.phone ?? prospect.primaryPhone ?? '—'}
Specializace: ${prospect.specialization ?? '—'}
Veřejné informace: ${prospect.publicInfo ?? '—'}
Zdroj: ${prospect.source}`;

    let result: Awaited<ReturnType<OpenAiService['complete']>>;
    try {
      result = await this.openai.complete({
        feature: 'ai_sales',
        systemPrompt: prompt.systemPrompt,
        userPrompt,
        userId,
        jsonMode: true,
        adminTest: testMode,
      });
    } catch (err) {
      if (!testMode) {
        await this.prisma.aiSalesProspect.update({
          where: { id: prospectId },
          data: { analysisStatus: AiSalesAnalysisStatus.FAILED },
        });
      }
      throw err;
    }

    let parsed: PartnerAnalysisResult = {};
    try {
      parsed = JSON.parse(result.text) as PartnerAnalysisResult;
    } catch {
      parsed = { summary: result.text, fitScore: 50 };
    }

    const fitScore = Math.max(0, Math.min(100, Number(parsed.fitScore) || 50));
    const priority = this.mapPriority(parsed.priority, fitScore);
    const companyProfile = {
      companyName: parsed.companyName ?? prospect.companyName,
      website: parsed.website ?? prospect.website ?? 'Nezjištěno',
      city: parsed.city ?? prospect.city ?? 'Nezjištěno',
      region: parsed.region ?? prospect.region ?? 'Nezjištěno',
      companyType: parsed.companyType ?? parsed.activityType ?? 'Nezjištěno',
      specialization: parsed.specialization ?? [],
      companySize: parsed.companySize ?? prospect.companySize ?? 'Nezjištěno',
      services: parsed.services ?? parsed.servicesOffered ?? [],
      references: parsed.references ?? 'Nezjištěno',
      publicContacts: parsed.publicContacts ?? 'Nezjištěno',
      socialNetworks: parsed.socialNetworks ?? 'Nezjištěno',
      serviceArea: parsed.serviceArea ?? 'Nezjištěno',
      industries: parsed.industries ?? [],
      strengths: parsed.strengths ?? [],
      weaknesses: parsed.weaknesses ?? parsed.risks ?? [],
      xxrealitBenefits: parsed.xxrealitBenefits ?? [],
      cooperationProbability: parsed.cooperationProbability ?? 'Nezjištěno',
    };

    const aiRecommendation = {
      action: parsed.aiRecommendation ?? parsed.recommendedNextStep ?? 'Zkontrolovat profil administrátorem',
      recommendedOffer: parsed.recommendedOffer ?? 'Nezjištěno',
      fitScore,
      priority,
    };

    if (!testMode) {
      await this.prisma.aiSalesProspect.update({
        where: { id: prospectId },
        data: {
          fitScore,
          priority,
          fitReasonsJson: parsed.reasons ?? [],
          fitRisksJson: parsed.risks ?? parsed.weaknesses ?? [],
          analysisJson: parsed,
          companyProfileJson: companyProfile,
          aiRecommendationJson: aiRecommendation,
          analysisStatus: AiSalesAnalysisStatus.COMPLETED,
          analyzedAt: new Date(),
          publicInfo: parsed.summary ?? prospect.publicInfo,
          serviceArea: parsed.serviceArea !== 'Nezjištěno' ? parsed.serviceArea : prospect.serviceArea,
          companySize: parsed.companySize !== 'Nezjištěno' ? parsed.companySize : prospect.companySize,
          specialization: Array.isArray(parsed.specialization)
            ? parsed.specialization.join(', ')
            : prospect.specialization,
          status:
            fitScore >= 60 ? AiSalesProspectStatus.ANALYZED : AiSalesProspectStatus.NEEDS_REVIEW,
        },
      });

      await this.prisma.aiSalesPartnerMemory.create({
        data: {
          prospectId,
          memoryType: 'ANALYSIS',
          content: `AI analýza: ${parsed.summary ?? '—'}. Doporučení: ${aiRecommendation.action}`,
          source: 'ANALYSIS',
          createdById: userId,
        },
      });
    }

    return {
      prospectId,
      analysis: parsed,
      companyProfile,
      aiRecommendation,
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
