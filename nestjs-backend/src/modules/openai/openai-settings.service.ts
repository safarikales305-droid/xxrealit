import { Injectable, Logger } from '@nestjs/common';
import { AiProvider, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { OpenAiConfigService } from './openai-config.service';
import type { UpdateAiSettingsDto } from './dto/update-ai-settings.dto';
import { buildDefaultAiSettings, type AiSettingsRecord } from './openai-settings.defaults';

@Injectable()
export class OpenAiSettingsService {
  private readonly log = new Logger(OpenAiSettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: OpenAiConfigService,
  ) {}

  getDefaultSettings(): AiSettingsRecord {
    return buildDefaultAiSettings({
      envEnabled: this.config.envEnabled,
      envModel: this.config.envModel,
      envDailyLimit: this.config.envDailyLimit,
      envMonthlyBudgetCzk: this.config.envMonthlyBudgetCzk,
      envTimeoutMs: this.config.envTimeoutMs,
      envMaxRetries: this.config.envMaxRetries,
    });
  }

  async getOrCreate(): Promise<AiSettingsRecord> {
    try {
      const existing = await this.prisma.aiSettings.findUnique({ where: { id: 'default' } });
      if (existing) return existing;
      return await this.prisma.aiSettings.create({
        data: { id: 'default', provider: AiProvider.OPENAI },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.warn(`AiSettings DB fallback aktivní: ${msg}`);
      return this.getDefaultSettings();
    }
  }

  async update(patch: UpdateAiSettingsDto) {
    try {
      await this.getOrCreate();
      const data: Prisma.AiSettingsUpdateInput = {};
      if (patch.enabled !== undefined) data.enabled = patch.enabled;
      if (patch.defaultModel !== undefined) data.defaultModel = patch.defaultModel;
      if (patch.dailyRequestLimit !== undefined) data.dailyRequestLimit = patch.dailyRequestLimit;
      if (patch.monthlyBudgetCzk !== undefined) data.monthlyBudgetCzk = patch.monthlyBudgetCzk;
      if (patch.maxOutputTokens !== undefined) data.maxOutputTokens = patch.maxOutputTokens;
      if (patch.timeoutMs !== undefined) data.timeoutMs = patch.timeoutMs;
      if (patch.maxRetries !== undefined) data.maxRetries = patch.maxRetries;
      if (patch.seoEnabled !== undefined) data.seoEnabled = patch.seoEnabled;
      if (patch.listingDescriptionEnabled !== undefined) {
        data.listingDescriptionEnabled = patch.listingDescriptionEnabled;
      }
      if (patch.socialPostEnabled !== undefined) data.socialPostEnabled = patch.socialPostEnabled;
      if (patch.emailEnabled !== undefined) data.emailEnabled = patch.emailEnabled;
      if (patch.supportEnabled !== undefined) data.supportEnabled = patch.supportEnabled;
      return await this.prisma.aiSettings.update({ where: { id: 'default' }, data });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.error(`AiSettings update selhal: ${msg}`);
      throw err;
    }
  }

  async recordConnectionTest(success: boolean, error?: string | null) {
    try {
      await this.getOrCreate();
      return await this.prisma.aiSettings.update({
        where: { id: 'default' },
        data: {
          lastConnectionTestAt: new Date(),
          lastConnectionSuccess: success,
          lastConnectionError: success ? null : error ?? 'Neznámá chyba',
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.warn(`Záznam testu připojení selhal (DB): ${msg}`);
      return null;
    }
  }
}
