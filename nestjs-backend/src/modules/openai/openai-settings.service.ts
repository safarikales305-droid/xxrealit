import { Injectable } from '@nestjs/common';
import { AiProvider, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { UpdateAiSettingsDto } from './dto/update-ai-settings.dto';

@Injectable()
export class OpenAiSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreate() {
    const existing = await this.prisma.aiSettings.findUnique({ where: { id: 'default' } });
    if (existing) return existing;
    return this.prisma.aiSettings.create({
      data: { id: 'default', provider: AiProvider.OPENAI },
    });
  }

  async update(patch: UpdateAiSettingsDto) {
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
    if (patch.listingDescriptionEnabled !== undefined) data.listingDescriptionEnabled = patch.listingDescriptionEnabled;
    if (patch.socialPostEnabled !== undefined) data.socialPostEnabled = patch.socialPostEnabled;
    if (patch.emailEnabled !== undefined) data.emailEnabled = patch.emailEnabled;
    if (patch.supportEnabled !== undefined) data.supportEnabled = patch.supportEnabled;
    return this.prisma.aiSettings.update({ where: { id: 'default' }, data });
  }

  async recordConnectionTest(success: boolean, error?: string | null) {
    await this.getOrCreate();
    return this.prisma.aiSettings.update({
      where: { id: 'default' },
      data: {
        lastConnectionTestAt: new Date(),
        lastConnectionSuccess: success,
        lastConnectionError: success ? null : error ?? 'Neznámá chyba',
      },
    });
  }
}
