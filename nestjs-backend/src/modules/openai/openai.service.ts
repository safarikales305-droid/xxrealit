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
import { OpenAiConfigService } from './openai-config.service';
import { redactSecrets } from './openai-mask.util';
import { OpenAiSettingsService } from './openai-settings.service';

export type AiFeature =
  | 'connection_test'
  | 'seo_improve'
  | 'listing_description'
  | 'social_post'
  | 'email'
  | 'support';

export type OpenAiCompleteInput = {
  feature: AiFeature;
  systemPrompt: string;
  userPrompt: string;
  userId?: string;
  maxOutputTokens?: number;
  jsonMode?: boolean;
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

  async getStatus() {
    const db = await this.settings.getOrCreate();
    const configured = this.config.isApiKeyConfigured();
    const enabled = db.enabled || this.config.envEnabled;
    return {
      enabled,
      configured,
      connected: Boolean(db.lastConnectionSuccess),
      model: db.defaultModel || this.config.envModel,
      apiKeyConfigured: configured,
      apiKeyMasked: this.config.getMaskedApiKey(),
      lastSuccessfulTestAt: db.lastConnectionTestAt?.toISOString() ?? null,
      lastError: db.lastConnectionError ?? null,
      message: configured ? null : 'OpenAI není připojeno.',
      seoEnabled: db.seoEnabled,
      listingDescriptionEnabled: db.listingDescriptionEnabled,
      socialPostEnabled: db.socialPostEnabled,
      emailEnabled: db.emailEnabled,
      supportEnabled: db.supportEnabled,
    };
  }

  async getSettingsView() {
    const db = await this.settings.getOrCreate();
    const usage = await this.getUsageSummary();
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
      status: await this.getStatus(),
    };
  }

  async getUsageSummary() {
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
  }

  async testConnection(userId?: string) {
    const started = Date.now();
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
        message: 'OpenAI je správně připojeno.',
        model: result.model,
        durationMs: Date.now() - started,
        response: result.text.trim(),
      };
    } catch (err) {
      const msg = this.translateError(err);
      await this.settings.recordConnectionTest(false, msg);
      return {
        success: false,
        message: msg,
        model: (await this.settings.getOrCreate()).defaultModel,
        durationMs: Date.now() - started,
      };
    }
  }

  async complete(input: OpenAiCompleteInput): Promise<OpenAiCompleteResult> {
    await this.assertCanRun(input.feature, input.userId);

    const db = await this.settings.getOrCreate();
    const client = this.getClient();
    if (!client) {
      throw new BadRequestException('API klíč není nastavený.');
    }

    const model = db.defaultModel || this.config.envModel;
    const maxOutputTokens = input.maxOutputTokens ?? db.maxOutputTokens;
    const maxRetries = db.maxRetries ?? this.config.envMaxRetries;
    const timeoutMs = db.timeoutMs ?? this.config.envTimeoutMs;

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
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
          continue;
        }
        throw this.toHttpException(err);
      }
    }

    throw this.toHttpException(lastError);
  }

  private async assertCanRun(feature: AiFeature, userId?: string) {
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
      listing_description: db.listingDescriptionEnabled,
      social_post: db.socialPostEnabled,
      email: db.emailEnabled,
      support: db.supportEnabled,
    };
    if (!featureEnabled[feature]) {
      throw new ForbiddenException('Tato AI funkce není povolena.');
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
  }

  private isRetryable(err: unknown): boolean {
    const code = this.errorCode(err);
    return code === 'timeout' || code === 'rate_limit' || code === 'server_error';
  }

  private errorCode(err: unknown): string {
    if (err instanceof Error && err.name === 'TimeoutError') return 'timeout';
    const status = (err as { status?: number })?.status;
    if (status === 429) return 'rate_limit';
    if (status && status >= 500) return 'server_error';
    if (status === 401) return 'invalid_key';
    if (status === 402) return 'billing';
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

  private toHttpException(err: unknown): Error {
    const msg = this.translateError(err);
    const code = this.errorCode(err);
    if (code === 'invalid_key' || code === 'billing') {
      return new BadRequestException(msg);
    }
    if (code === 'rate_limit') {
      return new ForbiddenException(msg);
    }
    return new ServiceUnavailableException(msg);
  }
}
