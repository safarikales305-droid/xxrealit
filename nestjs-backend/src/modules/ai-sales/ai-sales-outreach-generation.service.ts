import { Injectable, Logger } from '@nestjs/common';
import { AiSalesProspectStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { OpenAiConfigService } from '../openai/openai-config.service';
import { OpenAiService } from '../openai/openai.service';
import {
  AiSalesAdminException,
  buildSalesAdminError,
  mapExceptionToSalesAdminError,
} from './ai-sales-errors.util';
import { AI_SALES_PROMPT_FEATURES } from './ai-sales.constants';
import { AiSalesKnowledgeService } from './ai-sales-knowledge.service';
import { AiSalesMessageTemplateService } from './ai-sales-message-template.service';
import {
  buildPlainTextFromParts,
  OUTREACH_VARIANTS,
  validateOutreachAiOutput,
  type GenerateOutreachOptions,
  type OutreachAiOutput,
} from './ai-sales-outreach.types';
import { AiSalesPromptResolverService } from './ai-sales-prompt-resolver.service';
import { AiSalesProspectService } from './ai-sales-prospect.service';
import { AiSalesMessageService } from './ai-sales-message.service';
import { AiSalesSettingsService } from './ai-sales-settings.service';

@Injectable()
export class AiSalesOutreachGenerationService {
  private readonly log = new Logger(AiSalesOutreachGenerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly prospects: AiSalesProspectService,
    private readonly knowledge: AiSalesKnowledgeService,
    private readonly promptResolver: AiSalesPromptResolverService,
    private readonly openai: OpenAiService,
    private readonly openaiConfig: OpenAiConfigService,
    private readonly settings: AiSalesSettingsService,
    private readonly template: AiSalesMessageTemplateService,
    private readonly messages: AiSalesMessageService,
  ) {}

  async generateVariants(prospectId: string, userId?: string, options?: GenerateOutreachOptions) {
    const settings = await this.settings.getOrCreate();
    if (!settings.enabled) {
      throw new AiSalesAdminException(
        buildSalesAdminError('AI_SALES_DISABLED', 'AI obchodník je vypnutý v nastavení.', 403, 'message_generation'),
      );
    }

    const prospect = await this.prospects.getById(prospectId);
    this.assertCanGenerate(prospect);

    const variantCount = Math.min(3, Math.max(1, options?.variantCount ?? 3));
    const variants = OUTREACH_VARIANTS.slice(0, variantCount);
    const analysisIncomplete = !prospect.analyzedAt && !prospect.analysisJson;

    const results: Array<{
      id: string;
      messageId: string;
      variant: string;
      tone: string;
      subject: string;
      previewUrl: string;
    }> = [];

    for (const variant of variants) {
      const generated = await this.generateSingle(prospectId, userId, {
        ...options,
        tone: options?.tone ?? variant.tone,
        variantLabel: variant.label,
        testMode: false,
      });

      if (!generated?.message) {
        throw new Error('AI nevygenerovala zprávu.');
      }

      const message = generated.message;
      await this.messages.seedRecipientsForMessage(message.id, prospectId);

      results.push({
        id: message.id,
        messageId: message.id,
        variant: variant.label,
        tone: variant.tone,
        subject: message.subject ?? '',
        previewUrl: `/admin/marketing/ai-sales?tab=message&messageId=${message.id}`,
      });
    }

    return {
      success: true,
      partial: analysisIncomplete,
      analysisIncomplete,
      messageId: results[0]?.messageId,
      previewUrl: results[0]?.previewUrl,
      status: 'DRAFT',
      variants: results,
    };
  }

  async generateSingle(prospectId: string, userId?: string, options?: GenerateOutreachOptions) {
    const prospect = await this.prospects.getById(prospectId);
    this.assertCanGenerate(prospect);

    const analysis = (prospect.analysisJson ?? {}) as Record<string, unknown>;
    const companyProfile = (prospect.companyProfileJson ?? {}) as Record<string, unknown>;
    const aiRecommendation = (prospect.aiRecommendationJson ?? {}) as Record<string, unknown>;
    const memories = await this.prisma.aiSalesPartnerMemory.findMany({
      where: { prospectId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    const knowledge = await this.knowledge.retrieveRelevant({
      query: `${prospect.partnerType} ${prospect.companyName} ${prospect.city ?? ''}`,
      limit: 6,
    });

    const prompt = await this.promptResolver.resolveActive(AI_SALES_PROMPT_FEATURES.FIRST_OUTREACH, {
      approvedKnowledge: knowledge.map((k) => `Q: ${k.question}\nA: ${k.answer}`).join('\n\n'),
      partnerType: prospect.partnerType,
      companyName: prospect.companyName,
      city: prospect.city ?? '',
      publicInfo: prospect.publicInfo ?? '',
    });

    const variantStyle =
      OUTREACH_VARIANTS.find((v) => v.label === options?.variantLabel)?.style ??
      (options?.tone === 'FRIENDLY'
        ? 'přátelský, lidský'
        : options?.tone === 'CONCISE'
          ? 'stručný, věcný'
          : 'formální, profesionální');

    const userPrompt = this.buildUserPrompt(prospect, analysis, companyProfile, aiRecommendation, memories, variantStyle);

    let parsed: OutreachAiOutput;
    let model = this.openaiConfig.envModel;
    let usage: { totalTokens?: number; durationMs?: number } = {};

    try {
      if (!this.openaiConfig.isApiKeyConfigured()) {
        throw new AiSalesAdminException(
          buildSalesAdminError(
            'OPENAI_NOT_CONFIGURED',
            'OPENAI_API_KEY není nastaven. Použijte ruční návrh nebo nastavte klíč.',
            400,
            'message_generation',
          ),
        );
      }

      const result = await this.openai.complete({
        feature: 'ai_sales',
        systemPrompt: prompt.systemPrompt,
        userPrompt,
        userId,
        jsonMode: true,
        adminTest: options?.testMode,
      });

      model = result.model;
      usage = { totalTokens: result.totalTokens, durationMs: result.durationMs };
      parsed = validateOutreachAiOutput(JSON.parse(result.text));
      parsed.usedKnowledgeIds = knowledge.map((k) => k.id);
      if (!parsed.personalizationReasons.length && Array.isArray(analysis.reasons)) {
        parsed.personalizationReasons = (analysis.reasons as string[]).slice(0, 4);
      }
    } catch (err) {
      if (options?.testMode) throw err;
      if (err instanceof AiSalesAdminException) throw err;
      const mapped = mapExceptionToSalesAdminError(err, 'message_generation');
      throw new AiSalesAdminException(mapped);
    }

    const plainText = buildPlainTextFromParts(parsed);
    const html = this.template.renderHtml(parsed, { preview: true });
    const analysisIncomplete = !prospect.analyzedAt && !prospect.analysisJson;

    if (options?.testMode) {
      return {
        subject: parsed.subject,
        content: plainText,
        html,
        outreachReason: parsed.outreachReason,
        recommendedOffer: parsed.recommendedOffer,
        knowledge,
        promptVersionId: prompt.id,
        parsed,
      };
    }

    const message = await this.prisma.aiSalesMessage.create({
      data: {
        prospectId,
        campaignId: options?.campaignId,
        messageType: 'FIRST_OUTREACH',
        status: 'DRAFT',
        subject: parsed.subject,
        preheader: parsed.preheader,
        greeting: parsed.greeting,
        intro: parsed.intro,
        benefitsJson: parsed.benefits as unknown as Prisma.InputJsonValue,
        ctaText: parsed.ctaText,
        ctaUrl: parsed.ctaUrl,
        closing: parsed.closing,
        signature: parsed.signature,
        plainText,
        content: plainText,
        htmlContent: html,
        outreachReason: parsed.outreachReason ?? (parsed.personalizationReasons[0] ?? null),
        recommendedOffer:
          parsed.recommendedOffer ?? String(aiRecommendation.recommendedOffer ?? prospect.specialization ?? ''),
        knowledgeUsedJson: knowledge as unknown as Prisma.InputJsonValue,
        personalizationReasonsJson: parsed.personalizationReasons as unknown as Prisma.InputJsonValue,
        usedKnowledgeIdsJson: parsed.usedKnowledgeIds as unknown as Prisma.InputJsonValue,
        promptVersionId: prompt.id,
        promptFeature: AI_SALES_PROMPT_FEATURES.FIRST_OUTREACH,
        model,
        confidence: parsed.confidence,
        variantLabel: options?.variantLabel ?? 'A',
        analysisIncomplete,
        createdById: userId,
      },
    });

    await this.saveVersion(message.id, 1, message, userId, prompt.id, model, 'AI', 'Počáteční generování');
    await this.messages.seedRecipientsForMessage(message.id, prospectId);

    if (
      prospect.status !== AiSalesProspectStatus.READY_FOR_OUTREACH &&
      prospect.status !== AiSalesProspectStatus.CONTACTED
    ) {
      await this.prisma.aiSalesProspect.update({
        where: { id: prospectId },
        data: { status: AiSalesProspectStatus.READY_FOR_OUTREACH },
      });
    }

    return { message, knowledge, usage, parsed, analysisIncomplete };
  }

  async createManualDraft(prospectId: string, userId?: string) {
    const prospect = await this.prospects.getById(prospectId);
    this.assertCanGenerate(prospect);
    const html = this.template.renderManualFallbackHtml(prospect.companyName);
    const plainText = `Dobrý den,\n\npřipravili jsme návrh oslovení pro ${prospect.companyName}. Doplňte prosím text ručně.\n\nTým XXREALIT`;

    const message = await this.prisma.aiSalesMessage.create({
      data: {
        prospectId,
        messageType: 'FIRST_OUTREACH',
        status: 'DRAFT',
        subject: `Možnost spolupráce s XXREALIT — ${prospect.companyName}`,
        greeting: 'Dobrý den,',
        intro: plainText,
        content: plainText,
        plainText,
        htmlContent: html,
        analysisIncomplete: true,
        variantLabel: 'MANUAL',
        createdById: userId,
      },
    });

    await this.saveVersion(message.id, 1, message, userId, null, null, 'HUMAN', 'Ruční návrh bez OpenAI');
    await this.messages.seedRecipientsForMessage(message.id, prospectId);
    return { success: true, message };
  }

  private assertCanGenerate(prospect: {
    doNotContact: boolean;
    status: AiSalesProspectStatus;
    email: string | null;
  }) {
    if (prospect.doNotContact || prospect.status === AiSalesProspectStatus.DO_NOT_CONTACT) {
      throw new AiSalesAdminException(
        buildSalesAdminError('DO_NOT_CONTACT', 'Kontakt je v režimu DO_NOT_CONTACT.', 403, 'message_generation'),
      );
    }

    const blockedStatuses: AiSalesProspectStatus[] = [
      AiSalesProspectStatus.REJECTED,
      AiSalesProspectStatus.INVALID,
      AiSalesProspectStatus.DUPLICATE,
    ];
    if (blockedStatuses.includes(prospect.status)) {
      throw new AiSalesAdminException(
        buildSalesAdminError(
          'PROSPECT_NOT_APPROVED',
          `Partner ve stavu ${prospect.status} nelze oslovit.`,
          403,
          'message_generation',
        ),
      );
    }
  }

  private buildUserPrompt(
    prospect: Awaited<ReturnType<AiSalesProspectService['getById']>>,
    analysis: Record<string, unknown>,
    companyProfile: Record<string, unknown>,
    aiRecommendation: Record<string, unknown>,
    memories: Array<{ memoryType: string; content: string }>,
    variantStyle: string,
  ): string {
    return `Vytvoř originální první obchodní e-mail pro konkrétního partnera.

STYL VARIANTY: ${variantStyle}

PARTNER:
- Firma: ${prospect.companyName}
- Typ: ${prospect.partnerType}
- Kontakt: ${prospect.contactName ?? 'neuvedeno'}
- Město: ${prospect.city ?? 'neuvedeno'}
- Kraj: ${prospect.region ?? 'neuvedeno'}
- Web: ${prospect.website ?? 'neuvedeno'}
- Specializace: ${prospect.specialization ?? 'neuvedeno'}
- Veřejné informace: ${prospect.publicInfo ?? 'neuvedeno'}
- Fit score: ${prospect.fitScore ?? 'neanalyzováno'}
- Zdroj: ${prospect.source}

ANALÝZA (použij pouze pokud je k dispozici):
- Doporučená nabídka: ${String(analysis.recommendedOffer ?? aiRecommendation.recommendedOffer ?? 'neuvedeno')}
- Důvody vhodnosti: ${Array.isArray(analysis.reasons) ? (analysis.reasons as string[]).join('; ') : 'neuvedeno'}
- Přínosy XXREALIT: ${Array.isArray(companyProfile.xxrealitBenefits) ? (companyProfile.xxrealitBenefits as string[]).join('; ') : 'neuvedeno'}
- Služby partnera: ${Array.isArray(companyProfile.services) ? (companyProfile.services as string[]).join('; ') : 'neuvedeno'}

HISTORIE:
${memories.map((m) => `- ${m.memoryType}: ${m.content}`).join('\n') || 'žádná'}

Vrať POUZE validní JSON dle schématu v system promptu.
Každý e-mail musí mít jiný předmět a jiný úvod než jiné varianty.
Nepoužívej informace, které nejsou výše uvedeny.`;
  }

  async saveVersion(
    messageId: string,
    version: number,
    message: Record<string, unknown>,
    userId?: string | null,
    promptVersionId?: string | null,
    model?: string | null,
    changeSource = 'AI',
    changeDescription?: string,
  ) {
    await this.prisma.aiSalesMessageVersion.create({
      data: {
        messageId,
        version,
        contentJson: message as Prisma.InputJsonValue,
        changeSource,
        changeDescription,
        createdById: userId ?? undefined,
        promptVersionId: promptVersionId ?? undefined,
        model: model ?? undefined,
      },
    });
  }
}
