import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AiProvider } from '@prisma/client';
import OpenAI from 'openai';
import { PrismaService } from '../../database/prisma.service';
import { estimateCostCzk } from './openai-cost.util';
import { EMPTY_AI_USAGE } from './openai-settings.defaults';
import { OpenAiConfigService } from './openai-config.service';
import { redactSecrets } from './openai-mask.util';
import { OpenAiSettingsService } from './openai-settings.service';
import { OpenAiRequestException, type OpenAiErrorCode } from './openai-request.exception';

export type AiFeature =
  | 'connection_test'
  | 'seo_improve'
  | 'seo_ai_generate'
  | 'listing_description'
  | 'social_post'
  | 'email'
  | 'support'
  | 'ai_chat'
  | 'ai_chat_intent'
  | 'ai_chat_eval'
  | 'ai_sales'
  | 'editorial_news'
  | 'editorial_reel_hook'
  | 'ai_influencer_score'
  | 'ai_influencer_script';

export type OpenAiCompleteInput = {
  feature: AiFeature;
  systemPrompt: string;
  userPrompt: string;
  userId?: string;
  maxOutputTokens?: number;
  jsonMode?: boolean;
  /** Admin test — neblokuje chatEnabled / publicChatEnabled */
  adminTest?: boolean;
  /** Přepíše timeout z nastavení (ms) */
  timeoutMs?: number;
  /** AI obchodník — povolí volání pokud je OpenAI globálně zapnuto */
  salesOperation?: boolean;
};

export type OpenAiCompleteResult = {
  text: string;
  model: string;
  requestId: string | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostCzk: number;
  durationMs: number;
};

@Injectable()
export class OpenAiService {
  private readonly log = new Logger(OpenAiService.name);
  private client: OpenAI | null = null;

  constructor(
    private readonly config: OpenAiConfigService,
    private readonly settings: OpenAiSettingsService,
    private readonly prisma: PrismaService,
  ) {}

  private getClient(): OpenAI | null {
    const apiKey = this.config.apiKey;
    if (!apiKey) return null;
    if (!this.client) {
      this.client = new OpenAI({ apiKey, timeout: this.config.envTimeoutMs });
    }
    return this.client;
  }

  async getEngineDiagnostics() {
    const db = await this.settings.getOrCreate();
    const apiKey = this.config.apiKey;
    return {
      openAiEnabled: db.enabled || this.config.envEnabled,
      apiKeyConfigured: this.config.isApiKeyConfigured(),
      apiKeyLength: apiKey?.length ?? 0,
      model: db.defaultModel || this.config.envModel,
      timeoutMs: db.timeoutMs ?? this.config.envTimeoutMs,
      maxRetries: db.maxRetries ?? this.config.envMaxRetries,
    };
  }

  async getStatus() {
    const db = await this.settings.getOrCreate();
    const configured = this.config.isApiKeyConfigured();
    const enabled = db.enabled || this.config.envEnabled;
    const tested = db.lastConnectionTestAt != null;
    return {
      enabled,
      configured,
      connected: tested ? Boolean(db.lastConnectionSuccess) : null,
      model: db.defaultModel || this.config.envModel,
      apiKeyConfigured: configured,
      apiKeyMasked: this.config.getMaskedApiKey(),
      lastSuccessfulTestAt: db.lastConnectionTestAt?.toISOString() ?? null,
      lastError: db.lastConnectionError ?? null,
      message: configured
        ? tested
          ? db.lastConnectionSuccess
            ? 'OpenAI je připojeno.'
            : 'Poslední test připojení selhal.'
          : 'OpenAI je nakonfigurováno. Spusťte test připojení.'
        : 'OpenAI není připojeno.',
      seoEnabled: db.seoEnabled,
      listingDescriptionEnabled: db.listingDescriptionEnabled,
      socialPostEnabled: db.socialPostEnabled,
      emailEnabled: db.emailEnabled,
      supportEnabled: db.supportEnabled,
      chatEnabled: db.chatEnabled,
      publicChatEnabled: db.publicChatEnabled,
      testModeEnabled: db.testModeEnabled,
    };
  }

  async getSettingsView() {
    const db = await this.settings.getOrCreate();
    const usage = await this.getUsageSummary();
    const status = await this.getStatus();
    return {
      settings: {
        enabled: db.enabled,
        defaultModel: db.defaultModel,
        dailyRequestLimit: db.dailyRequestLimit,
        monthlyBudgetCzk: db.monthlyBudgetCzk,
        maxOutputTokens: db.maxOutputTokens,
        timeoutMs: db.timeoutMs,
        maxRetries: db.maxRetries,
        seoEnabled: db.seoEnabled,
        listingDescriptionEnabled: db.listingDescriptionEnabled,
        socialPostEnabled: db.socialPostEnabled,
        emailEnabled: db.emailEnabled,
        supportEnabled: db.supportEnabled,
        chatEnabled: db.chatEnabled,
        publicChatEnabled: db.publicChatEnabled,
        testModeEnabled: db.testModeEnabled,
        lastConnectionTestAt: db.lastConnectionTestAt?.toISOString() ?? null,
        lastConnectionSuccess: db.lastConnectionSuccess,
        lastConnectionError: db.lastConnectionError,
      },
      env: {
        apiKeyConfigured: this.config.isApiKeyConfigured(),
        apiKeyMasked: this.config.getMaskedApiKey(),
        apiKeySource: 'Railway proměnná OPENAI_API_KEY',
        apiKeyHelp:
          'API klíč je bezpečně uložen v proměnných backendu (Railway). Do administrace se neukládá.',
      },
      usage,
      status,
    };
  }

  async getUsageSummary() {
    try {
      const now = new Date();
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const [today, month, successToday, failedToday] = await Promise.all([
        this.prisma.aiUsageLog.findMany({ where: { createdAt: { gte: dayStart } } }),
        this.prisma.aiUsageLog.findMany({ where: { createdAt: { gte: monthStart } } }),
        this.prisma.aiUsageLog.count({ where: { createdAt: { gte: dayStart }, success: true } }),
        this.prisma.aiUsageLog.count({ where: { createdAt: { gte: dayStart }, success: false } }),
      ]);

      const sum = (rows: typeof today) =>
        rows.reduce(
          (acc, r) => ({
            requests: acc.requests + 1,
            inputTokens: acc.inputTokens + r.inputTokens,
            outputTokens: acc.outputTokens + r.outputTokens,
            costCzk: acc.costCzk + (r.estimatedCostCzk ?? 0),
            durationMs: acc.durationMs + (r.durationMs ?? 0),
          }),
          { requests: 0, inputTokens: 0, outputTokens: 0, costCzk: 0, durationMs: 0 },
        );

      const t = sum(today);
      const m = sum(month);

      return {
        requestsToday: t.requests,
        requestsThisMonth: m.requests,
        successfulToday: successToday,
        failedToday: failedToday,
        inputTokensToday: t.inputTokens,
        outputTokensToday: t.outputTokens,
        inputTokensMonth: m.inputTokens,
        outputTokensMonth: m.outputTokens,
        estimatedCostCzkToday: Math.round(t.costCzk * 100) / 100,
        estimatedCostCzkMonth: Math.round(m.costCzk * 100) / 100,
        avgDurationMsToday: t.requests ? Math.round(t.durationMs / t.requests) : 0,
      };
    } catch (err) {
      this.log.warn(`AiUsageLog nedostupný: ${err instanceof Error ? err.message : String(err)}`);
      return { ...EMPTY_AI_USAGE };
    }
  }

  async testConnection(userId?: string) {
    const started = Date.now();
    const model = (await this.settings.getOrCreate()).defaultModel || this.config.envModel;

    if (!this.config.isApiKeyConfigured()) {
      return {
        success: false,
        code: 'OPENAI_NOT_CONFIGURED',
        message: 'OPENAI_API_KEY není nastaven.',
        model,
        durationMs: Date.now() - started,
      };
    }

    if (!(await this.settings.getOrCreate()).enabled && !this.config.envEnabled) {
      return {
        success: false,
        code: 'OPENAI_DISABLED',
        message: 'OpenAI je vypnuto v nastavení.',
        model,
        durationMs: Date.now() - started,
      };
    }

    try {
      const result = await this.complete({
        feature: 'connection_test',
        systemPrompt: 'Odpovídej stručně a přesně.',
        userPrompt: 'Odpověz pouze slovem OK.',
        userId,
        maxOutputTokens: 16,
      });
      await this.settings.recordConnectionTest(true);
      return {
        success: true,
        code: 'OK',
        message: 'OpenAI je správně připojeno.',
        model: result.model,
        durationMs: Date.now() - started,
        response: result.text.trim(),
      };
    } catch (err) {
      const code = this.testErrorCode(err);
      const msg = this.testErrorMessage(code, err);
      await this.settings.recordConnectionTest(false, msg);
      return {
        success: false,
        code,
        message: msg,
        model,
        durationMs: Date.now() - started,
      };
    }
  }

  async complete(input: OpenAiCompleteInput): Promise<OpenAiCompleteResult> {
    await this.assertCanRun(input.feature, input.userId, {
      adminTest: input.adminTest,
      salesOperation: input.salesOperation,
    });

    const db = await this.settings.getOrCreate();
    const client = this.getClient();
    if (!client) {
      throw new BadRequestException('API klíč není nastavený.');
    }

    const model = db.defaultModel || this.config.envModel;
    const maxOutputTokens = input.maxOutputTokens ?? db.maxOutputTokens;
    const maxRetries = db.maxRetries ?? this.config.envMaxRetries;
    const timeoutMs = input.timeoutMs ?? db.timeoutMs ?? this.config.envTimeoutMs;

    const userContent = input.userPrompt.slice(0, 12_000);
    const systemContent = input.systemPrompt.slice(0, 8_000);

    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const started = Date.now();
      try {
        const response = await client.responses.create(
          {
            model,
            instructions: systemContent,
            input: userContent,
            max_output_tokens: maxOutputTokens,
            ...(input.jsonMode
              ? { text: { format: { type: 'json_object' as const } } }
              : {}),
          },
          { signal: AbortSignal.timeout(timeoutMs) },
        );

        const text = (response.output_text ?? '').trim();
        const usage = response.usage;
        const inputTokens = usage?.input_tokens ?? 0;
        const outputTokens = usage?.output_tokens ?? 0;
        const totalTokens = usage?.total_tokens ?? inputTokens + outputTokens;
        const durationMs = Date.now() - started;
        const estimatedCostCzk = estimateCostCzk(inputTokens, outputTokens, model);

        await this.logUsage({
          feature: input.feature,
          model,
          userId: input.userId,
          requestId: response.id ?? null,
          inputTokens,
          outputTokens,
          totalTokens,
          estimatedCostCzk,
          durationMs,
          success: true,
        });

        return {
          text,
          model,
          requestId: response.id ?? null,
          inputTokens,
          outputTokens,
          totalTokens,
          estimatedCostCzk,
          durationMs,
        };
      } catch (err) {
        lastError = err;
        const durationMs = Date.now() - started;
        const safeMsg = this.translateError(err);
        await this.logUsage({
          feature: input.feature,
          model,
          userId: input.userId,
          requestId: null,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          estimatedCostCzk: 0,
          durationMs,
          success: false,
          errorCode: this.errorCode(err),
          safeErrorMessage: safeMsg,
        });
        if (attempt < maxRetries && this.isRetryable(err)) {
          const delay = 500 * Math.pow(2, attempt);
          this.log.warn(
            `OpenAI retry ${attempt + 1}/${maxRetries} feature=${input.feature} code=${this.errorCode(err)} delay=${delay}ms`,
          );
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw this.toOpenAiException(err);
      }
    }

    throw this.toOpenAiException(lastError);
  }

  private async assertCanRun(
    feature: AiFeature,
    userId?: string,
    options?: { adminTest?: boolean; salesOperation?: boolean },
  ) {
    const db = await this.settings.getOrCreate();
    if (!db.enabled && !this.config.envEnabled) {
      throw new ForbiddenException('OpenAI je vypnuto v nastavení.');
    }
    if (!this.config.isApiKeyConfigured()) {
      throw new BadRequestException('API klíč není nastavený.');
    }

    const featureEnabled: Record<AiFeature, boolean> = {
      connection_test: true,
      seo_improve: db.seoEnabled,
      seo_ai_generate: db.seoEnabled,
      listing_description: db.listingDescriptionEnabled,
      social_post: db.socialPostEnabled,
      email: db.emailEnabled,
      support: db.supportEnabled,
      ai_chat: db.chatEnabled,
      ai_chat_intent: db.chatEnabled,
      ai_chat_eval: db.chatEnabled,
      ai_sales: db.chatEnabled,
      editorial_news: db.seoEnabled,
      editorial_reel_hook: db.seoEnabled,
      ai_influencer_score: db.seoEnabled,
      ai_influencer_script: db.seoEnabled,
    };
    if (!options?.adminTest && !featureEnabled[feature]) {
      if (
        options?.salesOperation &&
        feature === 'ai_sales' &&
        (db.enabled || this.config.envEnabled)
      ) {
        // AI obchodník — stejná OpenAI služba, vlastní gate přes AiSalesSettings
      } else {
      const label =
        feature === 'ai_chat' || feature === 'ai_chat_intent' || feature === 'ai_chat_eval'
          ? 'AI chat je vypnutý v nastavení AI centra.'
          : feature === 'ai_sales'
            ? 'AI obchodník není povolen v nastavení AI centra (chat).'
            : 'Tato AI funkce není povolena.';
      throw new ForbiddenException(label);
      }
    }

    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const monthStart = new Date(dayStart.getFullYear(), dayStart.getMonth(), 1);

    const dailyLimit = db.dailyRequestLimit || this.config.envDailyLimit;
    const monthlyBudget = db.monthlyBudgetCzk || this.config.envMonthlyBudgetCzk;

    const [todayCount, monthLogs] = await Promise.all([
      this.prisma.aiUsageLog.count({
        where: { createdAt: { gte: dayStart }, success: true },
      }),
      this.prisma.aiUsageLog.findMany({
        where: { createdAt: { gte: monthStart }, success: true },
        select: { estimatedCostCzk: true },
      }),
    ]);

    if (todayCount >= dailyLimit) {
      throw new ForbiddenException('AI limit byl dosažen. Požadavek nebyl odeslán.');
    }

    const monthCost = monthLogs.reduce((s, r) => s + (r.estimatedCostCzk ?? 0), 0);
    if (monthCost >= monthlyBudget) {
      throw new ForbiddenException('AI limit byl dosažen. Požadavek nebyl odeslán.');
    }

    void userId;
  }

  private async logUsage(row: {
    feature: AiFeature;
    model: string;
    userId?: string;
    requestId: string | null;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCostCzk: number;
    durationMs: number;
    success: boolean;
    errorCode?: string;
    safeErrorMessage?: string;
  }) {
    try {
      await this.prisma.aiUsageLog.create({
        data: {
          provider: AiProvider.OPENAI,
          feature: row.feature,
          model: row.model,
          userId: row.userId ?? null,
          requestId: row.requestId,
          inputTokens: row.inputTokens,
          outputTokens: row.outputTokens,
          totalTokens: row.totalTokens,
          estimatedCostCzk: row.estimatedCostCzk,
          durationMs: row.durationMs,
          success: row.success,
          errorCode: row.errorCode ?? null,
          safeErrorMessage: row.safeErrorMessage ? redactSecrets(row.safeErrorMessage) : null,
        },
      });
    } catch (err) {
      this.log.warn(
        `AiUsageLog zápis selhal (feature=${row.feature}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private isRetryable(err: unknown): boolean {
    const code = this.errorCode(err);
    if (code === 'timeout' || code === 'rate_limit' || code === 'server_error') return true;
    const msg = err instanceof Error ? err.message : String(err);
    return /ECONNRESET|ETIMEDOUT|ECONNREFUSED|fetch failed|network/i.test(msg);
  }

  private errorCode(err: unknown): string {
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      return 'timeout';
    }
    const status = (err as { status?: number })?.status;
    if (status === 429) return 'rate_limit';
    if (status === 503 || status === 502 || status === 504 || (status && status >= 500)) return 'server_error';
    if (status === 401) return 'invalid_key';
    if (status === 403) return 'permission_denied';
    if (status === 400) return 'invalid_request';
    if (status === 402) return 'billing';
    const msg = err instanceof Error ? err.message : String(err);
    if (/model/i.test(msg) && /not found|does not exist|unavailable/i.test(msg)) return 'model_unavailable';
    if (/timeout|timed out/i.test(msg)) return 'timeout';
    if (/ECONNRESET|ETIMEDOUT|ECONNREFUSED|fetch failed|network/i.test(msg)) return 'connection';
    return 'unknown';
  }

  translateError(err: unknown): string {
    const code = this.errorCode(err);
    switch (code) {
      case 'invalid_key':
        return 'API klíč není platný.';
      case 'billing':
        return 'Není nastavená fakturace.';
      case 'rate_limit':
        return 'Byl překročen limit.';
      case 'timeout':
        return 'Služba dočasně neodpovídá (timeout).';
      case 'server_error':
        return 'Služba dočasně neodpovídá.';
      default: {
        const msg = err instanceof Error ? err.message : String(err);
        if (/model/i.test(msg) && /not found|does not exist|unavailable/i.test(msg)) {
          return 'Vybraný model není dostupný.';
        }
        return 'Služba dočasně neodpovídá.';
      }
    }
  }

  resolveAdminErrorCode(err: unknown): OpenAiErrorCode {
    if (err instanceof OpenAiRequestException) return err.openAiCode;
    if (!this.config.isApiKeyConfigured()) return 'OPENAI_NOT_CONFIGURED';
    const code = this.errorCode(err);
    if (code === 'invalid_key') return 'OPENAI_INVALID_KEY';
    if (code === 'permission_denied') return 'OPENAI_PERMISSION_DENIED';
    if (code === 'billing') return 'OPENAI_QUOTA_EXCEEDED';
    if (code === 'rate_limit') return 'OPENAI_RATE_LIMITED';
    if (code === 'timeout') return 'OPENAI_TIMEOUT';
    if (code === 'model_unavailable') return 'OPENAI_MODEL_NOT_AVAILABLE';
    if (code === 'invalid_request') return 'OPENAI_INVALID_REQUEST';
    if (code === 'connection') return 'OPENAI_CONNECTION_ERROR';
    if (code === 'server_error') return 'OPENAI_CONNECTION_ERROR';
    return 'OPENAI_UNKNOWN_ERROR';
  }

  resolveAdminErrorMessage(code: OpenAiErrorCode | string, err: unknown): string {
    switch (code) {
      case 'OPENAI_NOT_CONFIGURED':
        return 'OPENAI_API_KEY není nastaven.';
      case 'OPENAI_INVALID_KEY':
        return 'OpenAI API klíč není platný.';
      case 'OPENAI_PERMISSION_DENIED':
        return 'OpenAI odmítlo požadavek (nedostatečná oprávnění).';
      case 'OPENAI_DISABLED':
        return 'OpenAI je vypnuto v nastavení.';
      case 'OPENAI_QUOTA_EXCEEDED':
        return 'OpenAI účet nemá dostupný kredit nebo byl překročen limit.';
      case 'OPENAI_MODEL_NOT_AVAILABLE':
        return 'Nastavený model není pro projekt dostupný.';
      case 'OPENAI_RATE_LIMITED':
        return 'Příliš mnoho požadavků na OpenAI API.';
      case 'OPENAI_INVALID_REQUEST':
        return 'Neplatný požadavek na OpenAI API.';
      case 'OPENAI_TIMEOUT':
        return 'OpenAI neodpovědělo včas.';
      case 'OPENAI_CONNECTION_ERROR':
        return 'Síťová chyba při komunikaci s OpenAI.';
      case 'OPENAI_INVALID_RESPONSE':
        return 'OpenAI vrátilo neplatnou odpověď.';
      case 'OPENAI_UNKNOWN_ERROR':
        return this.translateError(err);
      default:
        return this.translateError(err);
    }
  }

  private toOpenAiException(err: unknown): OpenAiRequestException {
    const upstreamStatus = (err as { status?: number })?.status;
    const code = this.resolveAdminErrorCode(err);
    const message = this.resolveAdminErrorMessage(code, err);
    const httpStatus = this.httpStatusForCode(code);
    const retryable = code === 'OPENAI_RATE_LIMITED' || code === 'OPENAI_CONNECTION_ERROR' || code === 'OPENAI_TIMEOUT';
    return new OpenAiRequestException(code, message, httpStatus, { upstreamStatus, retryable });
  }

  httpStatusForCode(code: OpenAiErrorCode | string): number {
    switch (code) {
      case 'OPENAI_NOT_CONFIGURED':
      case 'OPENAI_INVALID_KEY':
      case 'OPENAI_INVALID_REQUEST':
        return 400;
      case 'OPENAI_DISABLED':
      case 'OPENAI_PERMISSION_DENIED':
      case 'OPENAI_QUOTA_EXCEEDED':
        return 403;
      case 'OPENAI_RATE_LIMITED':
        return 429;
      case 'OPENAI_MODEL_NOT_AVAILABLE':
      case 'OPENAI_INVALID_RESPONSE':
        return 422;
      case 'OPENAI_TIMEOUT':
        return 504;
      case 'OPENAI_CONNECTION_ERROR':
        return 503;
      default:
        return 500;
    }
  }

  private toHttpException(err: unknown): Error {
    if (err instanceof OpenAiRequestException) return err;
    return this.toOpenAiException(err);
  }

  private testErrorCode(err: unknown): string {
    return this.resolveAdminErrorCode(err);
  }

  private testErrorMessage(code: string, err: unknown): string {
    return this.resolveAdminErrorMessage(code, err);
  }
}
