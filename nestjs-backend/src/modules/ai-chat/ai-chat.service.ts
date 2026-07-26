import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AiChatFeedbackRating,
  AiChatIntent,
  AiChatLeadStatus,
  AiChatMessageRole,
  AiChatSessionStatus,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { OpenAiConfigService } from '../openai/openai-config.service';
import { OpenAiSettingsService } from '../openai/openai-settings.service';
import { OpenAiService } from '../openai/openai.service';
import {
  AI_CHAT_FALLBACK_MESSAGE,
  AI_CHAT_GREETING,
  AI_CHAT_NO_RESULTS_MESSAGE,
  AI_CHAT_PROMPT_FEATURES,
} from './ai-chat.constants';
import { isVagueAiResponse } from './ai-chat-prompt-variables.util';
import { AiChatPromptResolverService } from './ai-chat-prompt-resolver.service';
import { parseIntentClassification } from './ai-chat-intent.validator';
import { AiChatKnowledgeService } from './ai-chat-knowledge.service';
import { computeLeadScore } from './ai-chat-lead-score.util';
import { AiChatPromptService } from './ai-chat-prompt.service';
import { AiChatRateLimitService } from './ai-chat-rate-limit.service';
import { containsPromptInjection, sanitizeUserInput, stripHtml } from './ai-chat-sanitize.util';
import { AiChatSettingsService } from './ai-chat-settings.service';
import { AiChatToolsService, type AiChatPropertyCard } from './ai-chat-tools.service';

@Injectable()
export class AiChatService {
  private readonly log = new Logger(AiChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly openai: OpenAiService,
    private readonly openaiSettings: OpenAiSettingsService,
    private readonly openaiConfig: OpenAiConfigService,
    private readonly settings: AiChatSettingsService,
    private readonly prompts: AiChatPromptService,
    private readonly promptResolver: AiChatPromptResolverService,
    private readonly knowledge: AiChatKnowledgeService,
    private readonly tools: AiChatToolsService,
    private readonly rateLimit: AiChatRateLimitService,
  ) {}

  async getPublicConfig(ctx: { pageType?: string; path?: string }) {
    const [s, aiDb] = await Promise.all([
      this.settings.getOrCreate(),
      this.openaiSettings.getOrCreate(),
    ]);
    const globallyOn = aiDb.enabled || this.openaiConfig.envEnabled;
    const chatOn = aiDb.chatEnabled && aiDb.publicChatEnabled && s.globallyEnabled;
    return {
      enabled: globallyOn && chatOn && this.settings.shouldShowOnPage(s, ctx),
      greeting: AI_CHAT_GREETING,
      openDelaySeconds: s.openDelaySeconds,
      greetingDelaySeconds: s.greetingDelaySeconds,
      doNotReopenMinutes: s.doNotReopenMinutes,
      maxMessageLength: s.maxMessageLength,
    };
  }

  async createSession(input: {
    userId?: string;
    sourcePageType?: string;
    sourceUrl?: string;
    sourceEntityId?: string;
    sourceContext?: Record<string, unknown>;
    isTestSession?: boolean;
  }) {
    const settings = await this.settings.getOrCreate();
    const aiDb = await this.openaiSettings.getOrCreate();
    if (!settings.globallyEnabled && !input.isTestSession) {
      throw new ForbiddenException('AI chat je vypnutý.');
    }
    if (!aiDb.chatEnabled || !aiDb.publicChatEnabled) {
      throw new ForbiddenException('Veřejný AI chat je vypnutý v nastavení AI centra.');
    }

    const publicSessionId = randomUUID();
    const session = await this.prisma.aiChatSession.create({
      data: {
        publicSessionId,
        userId: input.userId ?? null,
        isTestSession: Boolean(input.isTestSession),
        sourcePageType: input.sourcePageType ?? null,
        sourceUrl: input.sourceUrl ?? null,
        sourceEntityId: input.sourceEntityId ?? null,
        sourceContextJson: input.sourceContext as Prisma.InputJsonValue,
      },
    });

    const greeting = await this.prisma.aiChatMessage.create({
      data: {
        sessionId: session.id,
        role: AiChatMessageRole.ASSISTANT,
        content: AI_CHAT_GREETING,
        safeContent: AI_CHAT_GREETING,
        success: true,
      },
    });

    return {
      publicSessionId: session.publicSessionId,
      sessionId: session.id,
      greeting: this.serializeMessage(greeting),
    };
  }

  async getSession(publicSessionId: string, userId?: string) {
    const session = await this.findSession(publicSessionId);
    if (userId && session.userId && session.userId !== userId) {
      throw new ForbiddenException('Konverzace nepatří tomuto uživateli.');
    }
    const messages = await this.prisma.aiChatMessage.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    return {
      session: this.serializeSession(session),
      messages: messages.map((m) => this.serializeMessage(m)),
    };
  }

  async sendMessage(
    publicSessionId: string,
    input: {
      content: string;
      userId?: string;
      quickActionId?: string;
    },
  ) {
    const settings = await this.settings.getOrCreate();
    const session = await this.findSession(publicSessionId);
    if (session.status !== AiChatSessionStatus.ACTIVE) {
      throw new BadRequestException('Konverzace je uzavřená.');
    }

    const messageCount = await this.prisma.aiChatMessage.count({ where: { sessionId: session.id } });
    if (messageCount >= settings.maxSessionMessages) {
      throw new ForbiddenException('Byl dosažen limit zpráv v této konverzaci.');
    }

    const rate = this.rateLimit.check(publicSessionId, {
      perMinute: settings.maxMessagesPerMinute,
      perHour: settings.maxMessagesPerHour,
    });
    if (!rate.ok) throw new ForbiddenException('Příliš mnoho zpráv. Zkuste to prosím později.');

    const raw = stripHtml(input.content);
    if (!raw.trim() && !input.quickActionId) {
      throw new BadRequestException('Prázdná zpráva.');
    }
    if (raw.length > settings.maxMessageLength) {
      throw new BadRequestException('Zpráva je příliš dlouhá.');
    }
    if (containsPromptInjection(raw)) {
      throw new BadRequestException('Zpráva obsahuje nepovolený obsah.');
    }

    const safeContent = sanitizeUserInput(raw, settings.maxMessageLength);

    await this.prisma.aiChatMessage.create({
      data: {
        sessionId: session.id,
        role: AiChatMessageRole.USER,
        content: raw,
        safeContent,
        success: true,
      },
    });

    let propertyCards: AiChatPropertyCard[] = [];
    let searchMeta: Record<string, unknown> | null = null;
    let promptVersionId: string | null = null;
    let assistantText = AI_CHAT_FALLBACK_MESSAGE;
    let model: string | null = null;
    let promptVersion = 'builtin-v1';
    let inputTokens = 0;
    let outputTokens = 0;
    let latencyMs = 0;
    let success = false;

    try {
      const history = await this.prisma.aiChatMessage.findMany({
        where: { sessionId: session.id },
        orderBy: { createdAt: 'asc' },
        take: 30,
      });

      const transcript = history
        .filter((m) => m.role === AiChatMessageRole.USER || m.role === AiChatMessageRole.ASSISTANT)
        .map((m) => `${m.role === AiChatMessageRole.USER ? 'Uživatel' : 'AI'}: ${m.safeContent ?? m.content}`)
        .join('\n');

      const intentResult = await this.classifyIntent(transcript, input.userId);
      if (intentResult) {
        await this.updateSessionIntent(session.id, intentResult);
      }

      const profile = await this.extractProfile(session.id, transcript, input.userId);
      const knowledge = await this.knowledge.retrieveRelevant({
        query: safeContent || raw,
        intent: intentResult?.intent ?? session.detectedIntent,
        limit: 4,
      });

      const searchIntents: AiChatIntent[] = [AiChatIntent.BUY_PROPERTY, AiChatIntent.RENT_PROPERTY];
      const guessedLocation = profile?.location ?? this.guessLocation(safeContent);
      const shouldSearch =
        (intentResult && searchIntents.includes(intentResult.intent)) ||
        Boolean(guessedLocation && /byt|dům|nemovitost|pronájem|prodej|hledám/i.test(safeContent));

      if (shouldSearch) {
        if (!guessedLocation) {
          searchMeta = { status: 'SKIPPED', reason: 'MISSING_REQUIRED_FIELDS', field: 'location' };
        } else {
          try {
            propertyCards = await this.tools.searchProperties(input.userId, {
              location: guessedLocation,
              propertyType: profile?.propertyType ?? undefined,
              offerType:
                profile?.offerType ??
                (intentResult?.intent === AiChatIntent.RENT_PROPERTY ? 'pronajem' : 'prodej'),
              priceMax: profile?.budgetMax ?? undefined,
              priceMin: profile?.budgetMin ?? undefined,
              limit: Math.min(6, settings.maxPropertyRecommendations),
            });
            searchMeta = {
              status: propertyCards.length ? 'OK' : 'NO_RESULTS',
              reason: propertyCards.length ? null : 'NO_RESULTS',
              count: propertyCards.length,
              location: guessedLocation,
            };
          } catch (searchErr) {
            searchMeta = {
              status: 'ERROR',
              reason: 'DATABASE_ERROR',
              message: searchErr instanceof Error ? searchErr.message : String(searchErr),
            };
          }
        }
      } else {
        searchMeta = { status: 'SKIPPED', reason: 'MISSING_REQUIRED_FIELDS' };
      }

      const listingsBlock =
        propertyCards.length > 0
          ? propertyCards
              .map((p) => `- ${p.title} | ${p.city} | ${p.priceHidden ? 'cena po přihlášení' : p.priceLabel ?? '—'} | ${p.path}`)
              .join('\n')
          : 'žádné výsledky zatím nenačteny';

      const knowledgeBlock = knowledge.map((k) => `Q: ${k.question}\nA: ${k.answer}`).join('\n\n');

      const mainPrompt = await this.promptResolver.resolveActive(AI_CHAT_PROMPT_FEATURES.MAIN_CHAT, {
        portalName: 'XXREALIT',
        currentUrl: session.sourceUrl ?? '',
        pageType: session.sourcePageType ?? 'PORTAL',
        detectedIntent: intentResult?.intent ?? session.detectedIntent ?? '',
        searchProfile: JSON.stringify(profile ?? {}),
        approvedKnowledge: knowledgeBlock,
        availableListings: listingsBlock,
        conversationHistory: transcript.slice(-3000),
      });
      promptVersion = mainPrompt.version;
      promptVersionId = mainPrompt.id;

      const contextBlock = this.buildContextBlock(session, profile, propertyCards, knowledge);
      const userPrompt = `${contextBlock}\n\nKonverzace:\n${transcript}\n\nOdpověz jako AI průvodce XXREALIT.`;

      const result = await this.openai.complete({
        feature: 'ai_chat',
        systemPrompt: mainPrompt.systemPrompt,
        userPrompt,
        userId: input.userId,
        maxOutputTokens: settings.maxOutputTokens,
      });

      assistantText = result.text || AI_CHAT_FALLBACK_MESSAGE;

      if (isVagueAiResponse(assistantText)) {
        if (propertyCards.length > 0) {
          assistantText = `Našel jsem ${propertyCards.length} nabídek odpovídajících vašemu hledání. Podívejte se na doporučené inzeráty níže. Chcete upřesnit rozpočet nebo dispozici?`;
        } else if (searchMeta?.reason === 'NO_RESULTS' && guessedLocation) {
          assistantText = AI_CHAT_NO_RESULTS_MESSAGE;
        } else if (!guessedLocation && shouldSearch) {
          assistantText = 'Rád vám pomohu. V jaké lokalitě hledáte a jde o koupi, nebo pronájem?';
        }
      }

      if (propertyCards.length === 0 && searchMeta?.reason === 'NO_RESULTS' && !isVagueAiResponse(assistantText)) {
        assistantText = `${assistantText}\n\n${AI_CHAT_NO_RESULTS_MESSAGE}`.trim();
      }
      model = result.model;
      inputTokens = result.inputTokens;
      outputTokens = result.outputTokens;
      latencyMs = result.durationMs;
      success = true;
    } catch (err) {
      this.log.warn(
        `AI chat sendMessage selhal (session=${publicSessionId}): ${err instanceof Error ? err.message : String(err)}`,
      );
      assistantText = AI_CHAT_FALLBACK_MESSAGE;
    }

    const assistantMsg = await this.prisma.aiChatMessage.create({
      data: {
        sessionId: session.id,
        role: AiChatMessageRole.ASSISTANT,
        content: assistantText,
        safeContent: assistantText,
        model,
        promptVersion,
        inputTokens,
        outputTokens,
        latencyMs,
        structuredPayload: {
          ...(propertyCards.length ? { type: 'properties', items: propertyCards } : {}),
          ...(searchMeta ? { search: searchMeta } : {}),
          ...(promptVersionId ? { promptVersionId } : {}),
        } as Prisma.InputJsonValue,
        success,
      },
    });

    await this.prisma.aiChatSession.update({
      where: { id: session.id },
      data: { lastMessageAt: new Date() },
    });

    return {
      message: this.serializeMessage(assistantMsg),
      properties: propertyCards,
      session: await this.getSession(publicSessionId, input.userId),
    };
  }

  async submitFeedback(
    publicSessionId: string,
    input: {
      messageId?: string;
      rating: 'UP' | 'DOWN';
      category?: string;
      comment?: string;
      userId?: string;
    },
  ) {
    const session = await this.findSession(publicSessionId);
    return this.prisma.aiChatFeedback.create({
      data: {
        sessionId: session.id,
        messageId: input.messageId ?? null,
        rating: input.rating === 'UP' ? AiChatFeedbackRating.UP : AiChatFeedbackRating.DOWN,
        category: input.category ?? null,
        comment: input.comment ? sanitizeUserInput(input.comment, 1000) : null,
        submittedByUserId: input.userId ?? null,
      },
    });
  }

  async requestContact(
    publicSessionId: string,
    input: {
      name?: string;
      email?: string;
      phone?: string;
      consentStorage: boolean;
      consentTransfer: boolean;
      consentContact: boolean;
      userId?: string;
    },
  ) {
    if (!input.consentStorage || !input.consentContact) {
      throw new BadRequestException('Bez souhlasu nelze uložit kontakt.');
    }
    const session = await this.findSession(publicSessionId);
    const { score, breakdown } = computeLeadScore({
      intent: session.detectedIntent,
      hasContactConsent: true,
      requestedHuman: true,
    });

    const lead = await this.prisma.aiChatLead.create({
      data: {
        sessionId: session.id,
        status: AiChatLeadStatus.CONTACT_REQUESTED,
        intent: session.detectedIntent,
        summary: 'Žádost o kontakt z AI chatu',
        leadScore: score,
        contactName: input.name ? sanitizeUserInput(input.name, 120) : null,
        contactEmail: input.email ? sanitizeUserInput(input.email, 200) : null,
        contactPhone: input.phone ? sanitizeUserInput(input.phone, 40) : null,
        consentStorage: input.consentStorage,
        consentTransfer: input.consentTransfer,
        consentContact: input.consentContact,
        sourceUrl: session.sourceUrl,
        structuredParams: breakdown as Prisma.InputJsonValue,
      },
    });

    await this.prisma.aiChatSession.update({
      where: { id: session.id },
      data: { leadScore: score, leadScoreBreakdown: breakdown as Prisma.InputJsonValue },
    });

    return { success: true, leadId: lead.id };
  }

  async closeSession(publicSessionId: string) {
    const session = await this.findSession(publicSessionId);
    await this.prisma.aiChatSession.update({
      where: { id: session.id },
      data: { status: AiChatSessionStatus.CLOSED, closedAt: new Date() },
    });
    return { success: true };
  }

  // --- Admin helpers ---

  async getDashboard() {
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(dayStart);
    weekStart.setDate(weekStart.getDate() - 7);

    const [today, week, active, leads, up, down, usage] = await Promise.all([
      this.prisma.aiChatSession.count({ where: { createdAt: { gte: dayStart }, isTestSession: false } }),
      this.prisma.aiChatSession.count({ where: { createdAt: { gte: weekStart }, isTestSession: false } }),
      this.prisma.aiChatSession.count({ where: { status: AiChatSessionStatus.ACTIVE, isTestSession: false } }),
      this.prisma.aiChatLead.count({ where: { createdAt: { gte: weekStart } } }),
      this.prisma.aiChatFeedback.count({ where: { rating: AiChatFeedbackRating.UP, createdAt: { gte: weekStart } } }),
      this.prisma.aiChatFeedback.count({ where: { rating: AiChatFeedbackRating.DOWN, createdAt: { gte: weekStart } } }),
      this.prisma.aiUsageLog.findMany({
        where: { feature: { in: ['ai_chat', 'ai_chat_intent', 'ai_chat_eval'] }, createdAt: { gte: weekStart } },
      }),
    ]);

    const chatCost = usage.reduce((s, r) => s + (r.estimatedCostCzk ?? 0), 0);
    const msgCount = await this.prisma.aiChatMessage.count({
      where: { createdAt: { gte: weekStart }, role: AiChatMessageRole.ASSISTANT },
    });

    return {
      chatsToday: today,
      chatsThisWeek: week,
      activeChats: active,
      leadsThisWeek: leads,
      positiveFeedback: up,
      negativeFeedback: down,
      estimatedCostCzkWeek: Math.round(chatCost * 100) / 100,
      avgMessagesPerChat: week ? Math.round((msgCount / week) * 10) / 10 : 0,
    };
  }

  async listSessionsAdmin(opts: { limit?: number; q?: string }) {
    const take = Math.min(100, opts.limit ?? 50);
    return this.prisma.aiChatSession.findMany({
      where: {
        isTestSession: false,
        ...(opts.q?.trim()
          ? {
              OR: [
                { publicSessionId: { contains: opts.q.trim() } },
                { sourceUrl: { contains: opts.q.trim(), mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { lastMessageAt: 'desc' },
      take,
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        _count: { select: { messages: true, leads: true, feedback: true } },
      },
    });
  }

  async getSessionAdmin(id: string) {
    const session = await this.prisma.aiChatSession.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        messages: { orderBy: { createdAt: 'asc' } },
        profile: true,
        leads: true,
        feedback: true,
        evaluations: true,
      },
    });
    if (!session) throw new NotFoundException('Konverzace nenalezena.');
    return session;
  }

  private async findSession(publicSessionId: string) {
    const session = await this.prisma.aiChatSession.findUnique({ where: { publicSessionId } });
    if (!session) throw new NotFoundException('Konverzace nenalezena.');
    return session;
  }

  private serializeSession(session: {
    publicSessionId: string;
    status: AiChatSessionStatus;
    detectedIntent: AiChatIntent | null;
    intentConfidence: number | null;
    leadScore: number;
    conversationStage: string;
    sourceUrl: string | null;
    sourcePageType: string | null;
  }) {
    return {
      publicSessionId: session.publicSessionId,
      status: session.status,
      detectedIntent: session.detectedIntent,
      intentConfidence: session.intentConfidence,
      leadScore: session.leadScore,
      conversationStage: session.conversationStage,
      sourceUrl: session.sourceUrl,
      sourcePageType: session.sourcePageType,
    };
  }

  private serializeMessage(message: {
    id: string;
    role: AiChatMessageRole;
    content: string;
    createdAt: Date;
    structuredPayload?: unknown;
    success: boolean;
  }) {
    return {
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
      structuredPayload: message.structuredPayload ?? null,
      success: message.success,
    };
  }

  private async classifyIntent(transcript: string, userId?: string) {
    try {
      const prompt = await this.prompts.getActivePrompt(AI_CHAT_PROMPT_FEATURES.INTENT_CLASSIFICATION);
      const result = await this.openai.complete({
        feature: 'ai_chat_intent',
        systemPrompt: prompt.systemPrompt,
        userPrompt: transcript.slice(-4000),
        userId,
        maxOutputTokens: 300,
        jsonMode: true,
      });
      return parseIntentClassification(result.text);
    } catch {
      return null;
    }
  }

  private async updateSessionIntent(
    sessionId: string,
    intent: NonNullable<Awaited<ReturnType<AiChatService['classifyIntent']>>>,
  ) {
    const { score, breakdown } = computeLeadScore({ intent: intent.intent });
    await this.prisma.aiChatSession.update({
      where: { id: sessionId },
      data: {
        detectedIntent: intent.intent,
        intentConfidence: intent.confidence,
        leadScore: Math.max(score, intent.leadScore),
        leadScoreBreakdown: breakdown as Prisma.InputJsonValue,
        conversationStage: intent.stage as never,
      },
    });
  }

  private async extractProfile(sessionId: string, transcript: string, userId?: string) {
    try {
      const prompt = await this.prompts.getActivePrompt(AI_CHAT_PROMPT_FEATURES.PROFILE_EXTRACTION);
      const result = await this.openai.complete({
        feature: 'ai_chat_intent',
        systemPrompt: prompt.systemPrompt,
        userPrompt: transcript.slice(-4000),
        userId,
        maxOutputTokens: 400,
        jsonMode: true,
      });
      const parsed = JSON.parse(result.text) as Record<string, unknown>;
      const data = {
        offerType: parsed.offerType ? String(parsed.offerType) : null,
        propertyType: parsed.propertyType ? String(parsed.propertyType) : null,
        location: parsed.location ? String(parsed.location) : null,
        radiusKm: parsed.radiusKm != null ? Number(parsed.radiusKm) : null,
        budgetMin: parsed.budgetMin != null ? Number(parsed.budgetMin) : null,
        budgetMax: parsed.budgetMax != null ? Number(parsed.budgetMax) : null,
        minArea: parsed.minArea != null ? Number(parsed.minArea) : null,
        layoutsJson: (parsed.layouts ?? parsed.layout ?? undefined) as Prisma.InputJsonValue | undefined,
        featuresJson: (parsed.features ?? undefined) as Prisma.InputJsonValue | undefined,
        structuredDataJson: parsed as Prisma.InputJsonValue,
      };
      await this.prisma.aiChatProfile.upsert({
        where: { sessionId },
        create: { sessionId, ...data },
        update: data,
      });
      return data;
    } catch {
      return this.prisma.aiChatProfile.findUnique({ where: { sessionId } });
    }
  }

  private guessLocation(text: string): string | undefined {
    const m = text.match(/\b(v|ve|do|pro)\s+([A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][a-záčďéěíňóřšťúůýž]+(?:\s+[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][a-záčďéěíňóřšťúůýž]+)?)/);
    return m?.[2];
  }

  private buildContextBlock(
    session: { sourceUrl: string | null; sourcePageType: string | null; sourceEntityId: string | null },
    profile: { location?: string | null; propertyType?: string | null; offerType?: string | null } | null,
    properties: AiChatPropertyCard[],
    knowledge: Array<{ title: string; question: string; answer: string }>,
  ): string {
    const lines = [
      'Kontext návštěvníka:',
      session.sourcePageType ? `- Typ stránky: ${session.sourcePageType}` : '',
      session.sourceUrl ? `- URL: ${session.sourceUrl}` : '',
      session.sourceEntityId ? `- ID entity: ${session.sourceEntityId}` : '',
      profile?.location ? `- Hledaná lokalita: ${profile.location}` : '',
      profile?.propertyType ? `- Typ nemovitosti: ${profile.propertyType}` : '',
      profile?.offerType ? `- Typ nabídky: ${profile.offerType}` : '',
    ].filter(Boolean);

    if (knowledge.length) {
      lines.push('', 'Schválené znalosti (použij jako zdroj pravdy):');
      for (const k of knowledge) {
        lines.push(`Q: ${k.question}\nA: ${k.answer}`);
      }
    }

    if (properties.length) {
      lines.push('', 'Skutečné inzeráty z databáze (doporuč pouze tyto):');
      for (const p of properties) {
        lines.push(
          `- ${p.title} | ${p.city} | ${p.priceHidden ? 'cena po přihlášení' : p.priceLabel ?? 'cena neuvedena'} | ${p.path}`,
        );
      }
    }

    return lines.join('\n');
  }
}
