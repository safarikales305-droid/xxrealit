import { Injectable, Logger } from '@nestjs/common';
import { AiChatMessageRole } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { OpenAiConfigService } from '../openai/openai-config.service';
import { OpenAiSettingsService } from '../openai/openai-settings.service';
import { OpenAiService } from '../openai/openai.service';
import {
  AiChatAdminException,
  buildAdminError,
  mapExceptionToAdminError,
} from './ai-chat-errors.util';
import { parseIntentClassification } from './ai-chat-intent.validator';
import { AiChatPromptService } from './ai-chat-prompt.service';
import { AiChatSettingsService } from './ai-chat-settings.service';
import { AI_CHAT_PROMPT_FEATURES } from './ai-chat.constants';
import { sanitizeUserInput } from './ai-chat-sanitize.util';

const ADMIN_TEST_SYSTEM_PROMPT =
  'Jsi AI průvodce českého realitního portálu XXREALIT. Odpovídej česky, stručně a přirozeně. Zjisti postupně, zda uživatel hledá koupi, pronájem, prodej, spolupráci jako makléř nebo firmu. Nevymýšlej žádné inzeráty ani údaje.';

@Injectable()
export class AiChatAdminService {
  private readonly log = new Logger(AiChatAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly openai: OpenAiService,
    private readonly openaiConfig: OpenAiConfigService,
    private readonly openaiSettings: OpenAiSettingsService,
    private readonly chatSettings: AiChatSettingsService,
    private readonly prompts: AiChatPromptService,
  ) {}

  async getDiagnostics() {
    const [dbOk, aiDb, chatSettings, usage] = await Promise.all([
      this.checkDatabase(),
      this.openaiSettings.getOrCreate(),
      this.chatSettings.getOrCreate(),
      this.openai.getUsageSummary(),
    ]);

    const apiKeyConfigured = this.openaiConfig.isApiKeyConfigured();
    const openAiEnabledEnv = this.openaiConfig.envEnabled;
    const globallyEnabled = aiDb.enabled || openAiEnabledEnv;
    const model = (aiDb.defaultModel || this.openaiConfig.envModel)?.trim() || null;

    return {
      backend: { available: true },
      database: { available: dbOk },
      openAi: {
        openAiEnabledEnv,
        globallyEnabled,
        chatEnabled: aiDb.supportEnabled,
        adminTestEnabled: chatSettings.adminTestEnabled,
        apiKeyConfigured,
        modelConfigured: Boolean(model),
        model,
      },
      lastSuccessfulTest: chatSettings.lastAdminTestSuccess
        ? chatSettings.lastAdminTestAt?.toISOString() ?? aiDb.lastConnectionTestAt?.toISOString() ?? null
        : aiDb.lastConnectionSuccess
          ? aiDb.lastConnectionTestAt?.toISOString() ?? null
          : null,
      lastError: chatSettings.lastAdminTestError ?? aiDb.lastConnectionError ?? null,
      lastErrorCode: chatSettings.lastAdminTestErrorCode ?? null,
      usage: {
        requestsToday: usage.requestsToday,
        dailyLimit: aiDb.dailyRequestLimit || this.openaiConfig.envDailyLimit,
        estimatedCostCzkMonth: usage.estimatedCostCzkMonth,
        monthlyBudgetCzk: aiDb.monthlyBudgetCzk || this.openaiConfig.envMonthlyBudgetCzk,
      },
    };
  }

  async testConnectionOnly(userId?: string) {
    this.log.log(`POST admin/ai-chat/test-connection adminUserId=${userId ?? 'unknown'}`);
    const precheck = await this.assertOpenAiConnectionAllowed();
    if (precheck) {
      return { success: false, ...precheck };
    }

    const result = await this.openai.testConnection(userId);
    await this.recordAdminTestResult(result.success, result.code ?? 'UNKNOWN_AI_ERROR', result.message);
    return result;
  }

  async runAdminTest(message: string, userId?: string) {
    const started = Date.now();
    const safeMessage = sanitizeUserInput(message, 2000).trim();
    if (!safeMessage) {
      throw new AiChatAdminException(
        buildAdminError('UNKNOWN_AI_ERROR', 'Zpráva je prázdná.', 400, { stage: 'VALIDATION' }),
      );
    }

    const precheck = await this.assertAdminTestAllowed();
    if (precheck) {
      throw new AiChatAdminException(precheck);
    }

    const aiDb = await this.openaiSettings.getOrCreate();
    const model = (aiDb.defaultModel || this.openaiConfig.envModel)?.trim();

    this.log.log(
      `POST admin/ai-chat/test adminUserId=${userId ?? 'unknown'} apiKeyConfigured=${this.openaiConfig.isApiKeyConfigured()} model=${model}`,
    );

    try {
      const chatResult = await this.openai.complete({
        feature: 'ai_chat',
        systemPrompt: ADMIN_TEST_SYSTEM_PROMPT,
        userPrompt: safeMessage,
        userId,
        maxOutputTokens: 500,
      });

      let intent: string | null = null;
      let confidence: number | null = null;
      try {
        const intentPrompt = await this.prompts.getActivePrompt(AI_CHAT_PROMPT_FEATURES.INTENT_CLASSIFICATION);
        const intentResult = await this.openai.complete({
          feature: 'ai_chat_intent',
          systemPrompt: intentPrompt.systemPrompt,
          userPrompt: safeMessage,
          userId,
          maxOutputTokens: 300,
          jsonMode: true,
        });
        const parsed = parseIntentClassification(intentResult.text);
        intent = parsed?.intent ?? null;
        confidence = parsed?.confidence ?? null;
      } catch (intentErr) {
        this.log.warn(
          `Intent klasifikace v admin testu selhala: ${intentErr instanceof Error ? intentErr.message : String(intentErr)}`,
        );
      }

      const response = {
        success: true as const,
        reply: chatResult.text,
        intent,
        confidence,
        model: chatResult.model,
        durationMs: Date.now() - started,
        usage: {
          inputTokens: chatResult.inputTokens,
          outputTokens: chatResult.outputTokens,
          totalTokens: chatResult.totalTokens,
        },
      };

      await this.recordAdminTestResult(true, 'OK', 'Testovací chat úspěšný.');
      await this.logAdminTestMessage(userId, safeMessage, chatResult.text, chatResult.model, true);

      return response;
    } catch (err) {
      const mapped = this.mapRunError(err, model);
      await this.recordAdminTestResult(false, mapped.code, mapped.message);
      this.log.warn(
        `Admin AI test selhal code=${mapped.code} httpStatus=${mapped.httpStatus} model=${model ?? 'unknown'}`,
      );
      throw new AiChatAdminException(mapped);
    }
  }

  private async assertOpenAiConnectionAllowed() {
    const aiDb = await this.openaiSettings.getOrCreate();
    const chatSettings = await this.chatSettings.getOrCreate();
    const globallyEnabled = aiDb.enabled || this.openaiConfig.envEnabled;
    const model = (aiDb.defaultModel || this.openaiConfig.envModel)?.trim();

    if (!globallyEnabled) {
      return buildAdminError('OPENAI_DISABLED', 'OpenAI je vypnuto v nastavení.', 400, {
        stage: 'CONFIG',
        model: model ?? null,
      });
    }
    if (!this.openaiConfig.isApiKeyConfigured()) {
      return buildAdminError('OPENAI_NOT_CONFIGURED', 'OPENAI_API_KEY není nastaven.', 400, {
        stage: 'CONFIG',
        model: model ?? null,
      });
    }
    if (!chatSettings.adminTestEnabled) {
      return buildAdminError('AI_TEST_MODE_DISABLED', 'Testovací režim AI chatu je vypnutý.', 403, {
        stage: 'CONFIG',
        model: model ?? null,
      });
    }
    return null;
  }

  private async assertAdminTestAllowed() {
    const connectionBlock = await this.assertOpenAiConnectionAllowed();
    if (connectionBlock) return connectionBlock;

    const aiDb = await this.openaiSettings.getOrCreate();
    const model = (aiDb.defaultModel || this.openaiConfig.envModel)?.trim();

    if (!aiDb.supportEnabled) {
      return buildAdminError(
        'AI_CHAT_DISABLED',
        'AI chat je vypnutý v nastavení AI centra.',
        403,
        { stage: 'CONFIG', model: model ?? null },
      );
    }

    if (!model) {
      return buildAdminError('OPENAI_NOT_CONFIGURED', 'Model OpenAI není nastaven.', 400, {
        stage: 'CONFIG',
        model: null,
      });
    }

    return null;
  }

  private mapRunError(err: unknown, model?: string) {
    const prebuilt = mapExceptionToAdminError(err, { stage: 'OPENAI_REQUEST', model: model ?? null });
    if (prebuilt.code !== 'UNKNOWN_AI_ERROR') return prebuilt;

    const code = this.openai.resolveAdminErrorCode(err);
    const message = this.openai.resolveAdminErrorMessage(code, err);
    const httpStatus =
      code === 'OPENAI_RATE_LIMIT'
        ? 429
        : code === 'OPENAI_TIMEOUT'
          ? 504
          : code === 'OPENAI_QUOTA_EXCEEDED'
            ? 402
            : code === 'OPENAI_CONNECTION_ERROR'
              ? 503
              : code === 'OPENAI_INVALID_KEY' || code === 'OPENAI_MODEL_NOT_AVAILABLE'
                ? 400
                : 500;

    return buildAdminError(code as never, message, httpStatus, {
      stage: 'OPENAI_REQUEST',
      model: model ?? null,
    });
  }

  private async checkDatabase(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  private async recordAdminTestResult(success: boolean, code: string, message: string) {
    try {
      await this.chatSettings.getOrCreate();
      await this.prisma.aiChatSettings.update({
        where: { id: 'default' },
        data: {
          lastAdminTestAt: new Date(),
          lastAdminTestSuccess: success,
          lastAdminTestErrorCode: success ? null : code,
          lastAdminTestError: success ? null : message,
        },
      });
    } catch (err) {
      this.log.warn(
        `Zápis admin test výsledku selhal: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async logAdminTestMessage(
    userId: string | undefined,
    userMessage: string,
    reply: string,
    model: string,
    success: boolean,
  ) {
    try {
      const session = await this.prisma.aiChatSession.create({
        data: {
          publicSessionId: randomUUID(),
          userId: userId ?? null,
          isTestSession: true,
          sourcePageType: 'ADMIN_TEST',
          sourceUrl: '/admin/marketing/ai-chat',
        },
      });

      await this.prisma.aiChatMessage.createMany({
        data: [
          {
            sessionId: session.id,
            role: AiChatMessageRole.USER,
            content: userMessage,
            safeContent: userMessage,
            success: true,
          },
          {
            sessionId: session.id,
            role: AiChatMessageRole.ASSISTANT,
            content: reply,
            safeContent: reply,
            model,
            success,
          },
        ],
      });
    } catch (err) {
      this.log.warn(
        `Zápis testovací konverzace selhal: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
