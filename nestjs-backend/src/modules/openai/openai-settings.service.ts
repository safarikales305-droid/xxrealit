import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AiProvider, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { OpenAiConfigService } from './openai-config.service';
import type { UpdateAiChatSettingsDto } from './dto/update-ai-chat-settings.dto';
import type { UpdateAiSettingsDto } from './dto/update-ai-settings.dto';
import { buildDefaultAiSettings, type AiSettingsRecord } from './openai-settings.defaults';

@Injectable()
export class OpenAiSettingsService implements OnModuleInit {
  private readonly log = new Logger(OpenAiSettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: OpenAiConfigService,
  ) {}

  async onModuleInit() {
    await this.getOrCreate();
  }

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

  private buildCreateData(): Prisma.AiSettingsCreateInput {
    const defaults = this.getDefaultSettings();
    return {
      id: 'default',
      provider: AiProvider.OPENAI,
      enabled: defaults.enabled || this.config.envEnabled,
      defaultModel: defaults.defaultModel,
      dailyRequestLimit: defaults.dailyRequestLimit,
      monthlyBudgetCzk: defaults.monthlyBudgetCzk,
      maxOutputTokens: defaults.maxOutputTokens,
      timeoutMs: defaults.timeoutMs,
      maxRetries: defaults.maxRetries,
      seoEnabled: defaults.seoEnabled,
      listingDescriptionEnabled: defaults.listingDescriptionEnabled,
      socialPostEnabled: defaults.socialPostEnabled,
      emailEnabled: defaults.emailEnabled,
      supportEnabled: defaults.supportEnabled,
      chatEnabled: defaults.chatEnabled,
      publicChatEnabled: defaults.publicChatEnabled,
      testModeEnabled: defaults.testModeEnabled,
    };
  }

  async getOrCreate(): Promise<AiSettingsRecord> {
    try {
      return await this.prisma.aiSettings.upsert({
        where: { id: 'default' },
        create: this.buildCreateData(),
        update: {},
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

  async updateChatSettings(patch: UpdateAiChatSettingsDto) {
    await this.getOrCreate();
    const data: Prisma.AiSettingsUpdateInput = {};
    if (patch.chatEnabled !== undefined) data.chatEnabled = patch.chatEnabled;
    if (patch.publicChatEnabled !== undefined) data.publicChatEnabled = patch.publicChatEnabled;
    if (patch.testModeEnabled !== undefined) data.testModeEnabled = patch.testModeEnabled;

    const updated = await this.prisma.aiSettings.update({
      where: { id: 'default' },
      data,
    });

    if (patch.publicChatEnabled !== undefined || patch.testModeEnabled !== undefined) {
      try {
        await this.prisma.aiChatSettings.upsert({
          where: { id: 'default' },
          create: {
            id: 'default',
            globallyEnabled: patch.publicChatEnabled ?? true,
            adminTestEnabled: patch.testModeEnabled ?? true,
          },
          update: {
            ...(patch.publicChatEnabled !== undefined
              ? { globallyEnabled: patch.publicChatEnabled }
              : {}),
            ...(patch.testModeEnabled !== undefined
              ? { adminTestEnabled: patch.testModeEnabled }
              : {}),
          },
        });
      } catch (err) {
        this.log.warn(
          `Sync AiChatSettings selhal: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return {
      chatEnabled: updated.chatEnabled,
      publicChatEnabled: updated.publicChatEnabled,
      testModeEnabled: updated.testModeEnabled,
    };
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
