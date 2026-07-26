import { Injectable } from '@nestjs/common';
import { OpenAiService } from '../openai/openai.service';
import { AiSalesKnowledgeService } from './ai-sales-knowledge.service';
import { AiSalesPromptResolverService } from './ai-sales-prompt-resolver.service';
import { AI_SALES_PROMPT_FEATURES } from './ai-sales.constants';

@Injectable()
export class AiSalesAdminService {
  constructor(
    private readonly openai: OpenAiService,
    private readonly knowledge: AiSalesKnowledgeService,
    private readonly promptResolver: AiSalesPromptResolverService,
  ) {}

  async runTest(input: {
    companyName: string;
    partnerType: string;
    city?: string;
    website?: string;
    publicInfo?: string;
    userId?: string;
  }) {
    const knowledge = await this.knowledge.retrieveRelevant({
      query: `${input.partnerType} ${input.companyName} ${input.city ?? ''}`,
      limit: 5,
    });

    const mainPrompt = await this.promptResolver.resolveActive(AI_SALES_PROMPT_FEATURES.MAIN, {
      approvedKnowledge: knowledge.map((k) => `Q: ${k.question}\nA: ${k.answer}`).join('\n\n'),
      partnerType: input.partnerType,
      companyName: input.companyName,
      city: input.city ?? '',
      publicInfo: input.publicInfo ?? '',
    });

    const analysisPrompt = await this.promptResolver.resolveActive(
      AI_SALES_PROMPT_FEATURES.PARTNER_ANALYSIS,
      { approvedKnowledge: '', partnerType: input.partnerType, companyName: input.companyName, city: input.city ?? '', publicInfo: input.publicInfo ?? '' },
    );

    const userPrompt = `Testovací firma:
Název: ${input.companyName}
Typ: ${input.partnerType}
Město: ${input.city ?? '—'}
Web: ${input.website ?? '—'}
Veřejné info: ${input.publicInfo ?? '—'}`;

    const analysisResult = await this.openai.complete({
      feature: 'ai_sales',
      systemPrompt: analysisPrompt.systemPrompt,
      userPrompt,
      userId: input.userId,
      jsonMode: true,
      adminTest: true,
    });

    let parsedAnalysis: Record<string, unknown> = {};
    try {
      parsedAnalysis = JSON.parse(analysisResult.text);
    } catch {
      parsedAnalysis = { raw: analysisResult.text };
    }

    const outreachPrompt = await this.promptResolver.resolveActive(
      AI_SALES_PROMPT_FEATURES.FIRST_OUTREACH,
      { approvedKnowledge: knowledge.map((k) => k.answer).join('\n'), partnerType: input.partnerType, companyName: input.companyName, city: input.city ?? '', publicInfo: input.publicInfo ?? '' },
    );

    const outreachResult = await this.openai.complete({
      feature: 'ai_sales',
      systemPrompt: outreachPrompt.systemPrompt,
      userPrompt: `Připrav testovací e-mail pro: ${input.companyName}. Analýza: ${analysisResult.text}`,
      userId: input.userId,
      jsonMode: true,
      adminTest: true,
    });

    let parsedOutreach: Record<string, unknown> = {};
    try {
      parsedOutreach = JSON.parse(outreachResult.text);
    } catch {
      parsedOutreach = { body: outreachResult.text };
    }

    return {
      testMode: true,
      sent: false,
      knowledge,
      mainPromptVersion: mainPrompt.version,
      analysis: parsedAnalysis,
      outreach: parsedOutreach,
      usage: {
        analysis: {
          totalTokens: analysisResult.totalTokens,
          estimatedCostCzk: analysisResult.estimatedCostCzk,
          model: analysisResult.model,
        },
        outreach: {
          totalTokens: outreachResult.totalTokens,
          estimatedCostCzk: outreachResult.estimatedCostCzk,
          model: outreachResult.model,
        },
      },
    };
  }
}
