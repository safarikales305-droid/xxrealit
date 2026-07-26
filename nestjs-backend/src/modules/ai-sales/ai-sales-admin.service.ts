import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { OpenAiConfigService } from '../openai/openai-config.service';
import { OpenAiSettingsService } from '../openai/openai-settings.service';
import { OpenAiService } from '../openai/openai.service';
import {
  AiSalesAdminException,
  buildSalesAdminError,
  mapExceptionToSalesAdminError,
} from './ai-sales-errors.util';
import { AiSalesKnowledgeService } from './ai-sales-knowledge.service';
import { AiSalesPromptResolverService } from './ai-sales-prompt-resolver.service';
import { AiSalesSettingsService } from './ai-sales-settings.service';
import { AI_SALES_PROMPT_FEATURES } from './ai-sales.constants';
import { PartnerSearchService } from './partner-search.service';
import { SearchProvidersEnvService } from './search-providers-env.service';
import { WebSearchProvider } from './providers/web-search.provider';

@Injectable()
export class AiSalesAdminService {
  private readonly log = new Logger(AiSalesAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly openai: OpenAiService,
    private readonly openaiConfig: OpenAiConfigService,
    private readonly openaiSettings: OpenAiSettingsService,
    private readonly salesSettings: AiSalesSettingsService,
    private readonly knowledge: AiSalesKnowledgeService,
    private readonly promptResolver: AiSalesPromptResolverService,
    private readonly search: PartnerSearchService,
    private readonly webSearch: WebSearchProvider,
    private readonly searchEnv: SearchProvidersEnvService,
  ) {}

  async getDiagnostics() {
    const [dbOk, aiDb, salesSettings, usage] = await Promise.all([
      this.checkDatabase(),
      this.openaiSettings.getOrCreate(),
      this.salesSettings.getOrCreate(),
      this.openai.getUsageSummary(),
    ]);

    const apiKeyConfigured = this.openaiConfig.isApiKeyConfigured();
    const globallyEnabled = aiDb.enabled || this.openaiConfig.envEnabled;
    const webProviderConfigured = this.webSearch.isConfigured();
    const activeWebProvider = this.webSearch.getActiveProvider();

    const disabledReasons: string[] = [];
    if (!globallyEnabled) disabledReasons.push('OpenAI je globálně vypnuto.');
    if (!apiKeyConfigured) disabledReasons.push('OPENAI_API_KEY není nastaven.');
    if (!salesSettings.enabled) disabledReasons.push('AI obchodník je vypnutý.');
    if (!salesSettings.internalDatabaseEnabled) disabledReasons.push('Interní databáze je vypnutá.');

    return {
      backend: { available: true },
      deployment: this.searchEnv.getDeploymentDiagnostics(),
      database: { available: dbOk },
      openAi: {
        globallyEnabled,
        chatEnabled: aiDb.chatEnabled,
        apiKeyConfigured,
        model: aiDb.defaultModel || this.openaiConfig.envModel || null,
      },
      aiSales: {
        enabled: salesSettings.enabled,
        testModeEnabled: salesSettings.testModeEnabled,
        requireManualApproval: salesSettings.requireManualApproval,
        internalDatabaseEnabled: salesSettings.internalDatabaseEnabled,
        csvImportEnabled: salesSettings.csvImportEnabled,
        manualContactsEnabled: salesSettings.manualContactsEnabled,
        webProviderConfigured,
        activeWebProvider,
        serpApi: this.searchEnv.getSerpApiDiagnostics(),
        autoAnalyzeOnSave: salesSettings.autoAnalyzeOnSave,
        followUpFirstDays: salesSettings.followUpFirstDays,
        followUpSecondDays: salesSettings.followUpSecondDays,
        lastSearchSuccessAt: salesSettings.lastSearchSuccessAt?.toISOString() ?? null,
        lastErrorCode: salesSettings.lastSearchErrorCode,
        lastError: salesSettings.lastSearchErrorMessage,
      },
      disabledReasons,
      usage: {
        requestsToday: usage.requestsToday,
        dailyLimit: aiDb.dailyRequestLimit || this.openaiConfig.envDailyLimit,
        estimatedCostCzkMonth: usage.estimatedCostCzkMonth,
        monthlyBudgetCzk: aiDb.monthlyBudgetCzk || this.openaiConfig.envMonthlyBudgetCzk,
        dailySearchResultLimit: salesSettings.dailySearchResultLimit,
        dailyAnalysisLimit: salesSettings.dailyAnalysisLimit,
      },
    };
  }

  async testOpenAi(userId?: string) {
    return this.runGuarded('openai_test', async () => {
      const result = await this.openai.complete({
        feature: 'ai_sales',
        systemPrompt: 'Odpověz jedním slovem: OK',
        userPrompt: 'Test připojení AI obchodníka.',
        userId,
        adminTest: true,
        maxOutputTokens: 16,
      });
      return {
        success: true,
        response: result.text.trim(),
        model: result.model,
        durationMs: result.durationMs,
        usage: {
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          totalTokens: result.totalTokens,
        },
      };
    });
  }

  async testAnalysis(input: {
    companyName: string;
    partnerType: string;
    city?: string;
    website?: string;
    publicInformation?: string;
    publicInfo?: string;
    userId?: string;
  }) {
    return this.runGuarded('analysis_test', async () => {
      const publicInfo = input.publicInformation ?? input.publicInfo ?? '';
      const knowledge = await this.knowledge.retrieveRelevant({
        query: `${input.partnerType} ${input.companyName}`,
        limit: 4,
      });

      const analysisPrompt = await this.promptResolver.resolveActive(
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

      const analysisResult = await this.openai.complete({
        feature: 'ai_sales',
        systemPrompt: analysisPrompt.systemPrompt,
        userPrompt,
        userId: input.userId,
        jsonMode: true,
        adminTest: true,
      });

      let analysis: Record<string, unknown> = {};
      try {
        analysis = JSON.parse(analysisResult.text);
      } catch {
        analysis = { summary: analysisResult.text };
      }

      const outreachPrompt = await this.promptResolver.resolveActive(
        AI_SALES_PROMPT_FEATURES.FIRST_OUTREACH,
        {
          approvedKnowledge: knowledge.map((k) => k.answer).join('\n'),
          partnerType: input.partnerType,
          companyName: input.companyName,
          city: input.city ?? '',
          publicInfo,
        },
      );

      const outreachResult = await this.openai.complete({
        feature: 'ai_sales',
        systemPrompt: outreachPrompt.systemPrompt,
        userPrompt: `Připrav testovací e-mail. Analýza: ${analysisResult.text}`,
        userId: input.userId,
        jsonMode: true,
        adminTest: true,
      });

      let draftMessage: Record<string, unknown> = {};
      try {
        draftMessage = JSON.parse(outreachResult.text);
      } catch {
        draftMessage = { body: outreachResult.text };
      }

      return {
        success: true,
        analysis: {
          partnerType: analysis.partnerType ?? input.partnerType,
          fitScore: analysis.fitScore ?? null,
          priority: analysis.priority ?? null,
          recommendedOffer: analysis.recommendedOffer ?? null,
          reasons: analysis.reasons ?? [],
          risks: analysis.risks ?? [],
          recommendedNextStep: analysis.recommendedNextStep ?? 'Připravit nabídku ke schválení',
          missingInformation: analysis.missingInformation ?? [],
        },
        draftMessage,
        knowledge,
        model: analysisResult.model,
        durationMs: analysisResult.durationMs + outreachResult.durationMs,
        usage: {
          inputTokens: analysisResult.inputTokens + outreachResult.inputTokens,
          outputTokens: analysisResult.outputTokens + outreachResult.outputTokens,
          totalTokens: analysisResult.totalTokens + outreachResult.totalTokens,
        },
        sent: false,
        testMode: true,
      };
    });
  }

  /** @deprecated use testAnalysis */
  async runTest(input: Parameters<AiSalesAdminService['testAnalysis']>[0]) {
    return this.testAnalysis(input);
  }

  async testSearchProvider(input: { providerKey?: string; partnerType?: string; city?: string; limit?: number }) {
    const key = input.providerKey ?? 'INTERNAL_DATABASE';
    return this.search.testProvider(key);
  }

  private async runGuarded<T>(phase: string, fn: () => Promise<T>): Promise<T> {
    const settings = await this.salesSettings.getOrCreate();
    if (!settings.enabled) {
      throw new AiSalesAdminException(
        buildSalesAdminError('AI_SALES_DISABLED', 'AI obchodník je vypnutý v nastavení.', 403, phase),
      );
    }

    if (!this.openaiConfig.isApiKeyConfigured()) {
      throw new AiSalesAdminException(
        buildSalesAdminError('OPENAI_NOT_CONFIGURED', 'OPENAI_API_KEY není nastaven.', 400, phase),
      );
    }

    try {
      return await fn();
    } catch (err) {
      if (err instanceof AiSalesAdminException) throw err;
      const aiDb = await this.openaiSettings.getOrCreate();
      if (!aiDb.enabled && !this.openaiConfig.envEnabled) {
        throw new AiSalesAdminException(
          buildSalesAdminError('OPENAI_DISABLED', 'OpenAI je vypnuto v nastavení AI centra.', 403, phase),
        );
      }
      const code = this.openai.resolveAdminErrorCode(err);
      const message = this.openai.resolveAdminErrorMessage(code, err);
      throw new AiSalesAdminException(buildSalesAdminError(code as never, message, this.httpForCode(code), phase));
    }
  }

  private httpForCode(code: string): number {
    if (code === 'OPENAI_NOT_CONFIGURED' || code === 'OPENAI_INVALID_KEY') return 400;
    if (code.includes('LIMIT') || code === 'OPENAI_DISABLED' || code === 'AI_SALES_DISABLED') return 403;
    if (code === 'OPENAI_TIMEOUT' || code.includes('CONNECTION')) return 503;
    return 500;
  }

  private async checkDatabase() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
