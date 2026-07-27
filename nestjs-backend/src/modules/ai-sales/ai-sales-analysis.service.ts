import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import {
  AiSalesAnalysisStatus,
  AiSalesPriority,
  AiSalesProspectStatus,
} from '@prisma/client';
import { OpenAiService } from '../openai/openai.service';
import { PrismaService } from '../../database/prisma.service';
import { AI_SALES_PROMPT_FEATURES } from './ai-sales.constants';
import {
  AiSalesAdminException,
  buildSalesAdminError,
  mapOpenAiToSalesError,
} from './ai-sales-errors.util';
import { AiSalesKnowledgeService } from './ai-sales-knowledge.service';
import { AiSalesPromptResolverService } from './ai-sales-prompt-resolver.service';
import { AiSalesProspectService } from './ai-sales-prospect.service';
import { AiSalesSettingsService } from './ai-sales-settings.service';
import {
  parsePartnerAnalysisJson,
  validatePartnerAnalysisOutput,
  type PartnerAnalysisOutput,
} from './ai-sales-analysis.validator';

const ANALYSIS_TIMEOUT_MS = 90_000;

@Injectable()
export class AiSalesAnalysisService {
  private readonly log = new Logger(AiSalesAnalysisService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly prospects: AiSalesProspectService,
    private readonly knowledge: AiSalesKnowledgeService,
    private readonly promptResolver: AiSalesPromptResolverService,
    private readonly openai: OpenAiService,
    private readonly settings: AiSalesSettingsService,
  ) {}

  async analyzeProspect(prospectId: string, userId?: string, testMode = false) {
    if (!testMode) {
      await this.assertDailyAnalysisLimit();
      await this.assertSalesEnabled();
    }

    const prospect = await this.prospects.getById(prospectId);
    const requestId = `analysis-${prospectId}-${Date.now()}`;

    if (!testMode) {
      await this.prisma.aiSalesProspect.update({
        where: { id: prospectId },
        data: {
          analysisStatus: AiSalesAnalysisStatus.RUNNING,
          analysisStartedAt: new Date(),
          analysisFailedAt: null,
          analysisErrorCode: null,
          analysisErrorMessage: null,
        },
      });
    }

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
Zdroj: ${prospect.source}

Vrať JSON s poli: companySummary, partnerType, fitScore (0-100), priority (LOW|MEDIUM|HIGH),
servicesDetected[], locationsDetected[], recommendedProducts[], recommendedOffer,
personalizationPoints[], risks[], missingInformation[], recommendedTone, recommendedNextStep.`;

    let result: Awaited<ReturnType<OpenAiService['complete']>>;
    try {
      result = await this.openai.complete({
        feature: 'ai_sales',
        systemPrompt: prompt.systemPrompt,
        userPrompt,
        userId,
        jsonMode: true,
        adminTest: testMode,
        timeoutMs: ANALYSIS_TIMEOUT_MS,
        salesOperation: !testMode,
      });
    } catch (err) {
      const mapped = mapOpenAiToSalesError(err, 'analysis');
      this.log.warn(
        `Analysis failed requestId=${requestId} code=${mapped.code} upstream=${mapped.technicalContext?.upstreamStatus ?? 'n/a'} duration=n/a`,
      );
      if (!testMode) {
        await this.markAnalysisFailed(prospectId, mapped.code, mapped.message);
      }
      throw new AiSalesAdminException(mapped);
    }

    let parsed: unknown;
    try {
      parsed = parsePartnerAnalysisJson(result.text);
    } catch {
      const mapped = buildSalesAdminError(
        'OPENAI_INVALID_RESPONSE',
        'OpenAI vrátilo neplatný JSON.',
        422,
        'analysis',
      );
      if (!testMode) await this.markAnalysisFailed(prospectId, mapped.code, mapped.message);
      throw new AiSalesAdminException(mapped);
    }

    const validation = validatePartnerAnalysisOutput(parsed);
    if (!validation.ok) {
      const mapped = buildSalesAdminError(
        'OPENAI_INVALID_RESPONSE',
        `Neplatná struktura analýzy: ${validation.errors.join(' ')}`,
        422,
        'analysis',
      );
      if (!testMode) await this.markAnalysisFailed(prospectId, mapped.code, mapped.message);
      throw new AiSalesAdminException(mapped);
    }

    const output = validation.data;
    const fitScore = output.fitScore;
    const priority = this.mapPriority(output.priority, fitScore);
    const companyProfile = this.buildCompanyProfile(output, prospect);
    const aiRecommendation = {
      action: output.recommendedNextStep,
      recommendedOffer: output.recommendedOffer,
      fitScore,
      priority,
    };

    if (!testMode) {
      await this.prisma.aiSalesProspect.update({
        where: { id: prospectId },
        data: {
          fitScore,
          priority,
          fitReasonsJson: output.personalizationPoints,
          fitRisksJson: output.risks,
          analysisJson: output as unknown as object,
          companyProfileJson: companyProfile,
          aiRecommendationJson: aiRecommendation,
          analysisStatus: AiSalesAnalysisStatus.COMPLETED,
          analyzedAt: new Date(),
          analysisFailedAt: null,
          analysisErrorCode: null,
          analysisErrorMessage: null,
          publicInfo: output.companySummary || prospect.publicInfo,
          status:
            fitScore >= 60 ? AiSalesProspectStatus.ANALYZED : AiSalesProspectStatus.NEEDS_REVIEW,
        },
      });

      await this.prisma.aiSalesPartnerMemory.create({
        data: {
          prospectId,
          memoryType: 'ANALYSIS',
          content: `AI analýza: ${output.companySummary}. Doporučení: ${output.recommendedNextStep}`,
          source: 'ANALYSIS',
          createdById: userId,
        },
      });
    }

    this.log.log(
      `Analysis completed requestId=${requestId} model=${result.model} tokens=${result.totalTokens} durationMs=${result.durationMs} fitScore=${fitScore}`,
    );

    return {
      prospectId,
      analysis: output,
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

  async runDryAnalysis(input: {
    companyName: string;
    partnerType: string;
    city?: string;
    website?: string;
    publicInformation?: string;
    userId?: string;
  }) {
    await this.assertSalesEnabled();
    const publicInfo = input.publicInformation ?? '';
    const knowledge = await this.knowledge.retrieveRelevant({
      query: `${input.partnerType} ${input.companyName}`,
      limit: 4,
    });

    const prompt = await this.promptResolver.resolveActive(
      AI_SALES_PROMPT_FEATURES.PARTNER_ANALYSIS,
      {
        approvedKnowledge: knowledge.map((k) => k.answer).join('\n'),
        partnerType: input.partnerType,
        companyName: input.companyName,
        city: input.city ?? '',
        publicInfo,
      },
    );

    const userPrompt = `Firma: ${input.companyName}
Typ: ${input.partnerType}
Město: ${input.city ?? '—'}
Web: ${input.website ?? '—'}
Veřejné informace: ${publicInfo || '—'}`;

    const started = Date.now();
    const result = await this.openai.complete({
      feature: 'ai_sales',
      systemPrompt: prompt.systemPrompt,
      userPrompt,
      userId: input.userId,
      jsonMode: true,
      adminTest: true,
      timeoutMs: ANALYSIS_TIMEOUT_MS,
    });

    let parsed: unknown;
    try {
      parsed = parsePartnerAnalysisJson(result.text);
    } catch {
      throw new AiSalesAdminException(
        buildSalesAdminError('OPENAI_INVALID_RESPONSE', 'OpenAI vrátilo neplatný JSON.', 422, 'analysis_test'),
      );
    }

    const validation = validatePartnerAnalysisOutput(parsed);
    if (!validation.ok) {
      throw new AiSalesAdminException(
        buildSalesAdminError(
          'OPENAI_INVALID_RESPONSE',
          validation.errors.join(' '),
          422,
          'analysis_test',
        ),
      );
    }

    return {
      success: true,
      analysis: validation.data,
      model: result.model,
      durationMs: Date.now() - started,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      totalTokens: result.totalTokens,
      fitScore: validation.data.fitScore,
      recommendedOffer: validation.data.recommendedOffer,
      saved: false,
    };
  }

  private buildCompanyProfile(
    output: PartnerAnalysisOutput,
    prospect: Awaited<ReturnType<AiSalesProspectService['getById']>>,
  ) {
    return {
      companyName: prospect.companyName,
      website: prospect.website ?? 'Nezjištěno',
      city: prospect.city ?? 'Nezjištěno',
      region: prospect.region ?? 'Nezjištěno',
      companyType: output.partnerType,
      specialization: output.servicesDetected,
      services: output.servicesDetected,
      locations: output.locationsDetected,
      recommendedProducts: output.recommendedProducts,
      strengths: output.personalizationPoints,
      weaknesses: output.risks,
      summary: output.companySummary,
    };
  }

  private async markAnalysisFailed(prospectId: string, code: string, message: string) {
    await this.prisma.aiSalesProspect.update({
      where: { id: prospectId },
      data: {
        analysisStatus: AiSalesAnalysisStatus.FAILED,
        analysisFailedAt: new Date(),
        analysisErrorCode: code,
        analysisErrorMessage: message.slice(0, 2000),
      },
    });
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

  private async assertSalesEnabled() {
    const settings = await this.settings.getOrCreate();
    if (!settings.enabled) {
      throw new AiSalesAdminException(
        buildSalesAdminError('AI_SALES_DISABLED', 'AI obchodník je vypnutý v nastavení.', 403, 'analysis'),
      );
    }
  }
}
