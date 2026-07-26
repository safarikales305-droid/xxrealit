import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class AiChatSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreate() {
    const existing = await this.prisma.aiChatSettings.findUnique({ where: { id: 'default' } });
    if (existing) return existing;
    return this.prisma.aiChatSettings.create({ data: { id: 'default' } });
  }

  async update(patch: Partial<{
    globallyEnabled: boolean;
    visibilityMode: string;
    enabledPageTypes: string[];
    disabledUrlPatterns: string[];
    allowedUrlPatterns: string[];
    openDelaySeconds: number;
    greetingDelaySeconds: number;
    doNotReopenMinutes: number;
    retentionDays: number;
    maxMessagesPerMinute: number;
    maxMessagesPerHour: number;
    maxMessageLength: number;
    maxSessionMessages: number;
    dailyChatRequestLimit: number;
    dailyChatBudgetCzk: number;
    monthlyChatBudgetCzk: number;
    maxOutputTokens: number;
    classificationModel: string;
    chatModel: string;
    maxPropertyRecommendations: number;
    adminTestEnabled: boolean;
  }>) {
    await this.getOrCreate();
    return this.prisma.aiChatSettings.update({ where: { id: 'default' }, data: patch });
  }

  shouldShowOnPage(settings: Awaited<ReturnType<AiChatSettingsService['getOrCreate']>>, ctx: {
    pageType?: string;
    path?: string;
  }): boolean {
    if (!settings.globallyEnabled) return false;
    const path = ctx.path ?? '/';
    if (settings.disabledUrlPatterns.some((p) => path.includes(p))) return false;
    if (settings.allowedUrlPatterns.length > 0) {
      return settings.allowedUrlPatterns.some((p) => path.includes(p));
    }
    if (settings.visibilityMode === 'SELECTED' && settings.enabledPageTypes.length > 0) {
      return settings.enabledPageTypes.includes(ctx.pageType ?? 'PORTAL');
    }
    return true;
  }
}
