import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  DEFAULT_AI_VISUALIZATION_SETTINGS,
  type AiVisualizationPublicConfig,
  PROPERTY_TYPE_OPTIONS,
  RENOVATION_LEVEL_OPTIONS,
  STYLE_OPTIONS,
} from './ai-visualization.types';

@Injectable()
export class AiVisualizationSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings() {
    const row = await this.prisma.aiVisualizationSettings.findUnique({ where: { id: 'default' } });
    if (!row) {
      return { ...DEFAULT_AI_VISUALIZATION_SETTINGS, updatedAt: new Date().toISOString() };
    }
    return {
      enabled: row.enabled,
      anonymousEnabled: row.anonymousEnabled,
      anonymousFreeGenerations: row.anonymousFreeGenerations,
      loggedInFreeGenerations: row.loggedInFreeGenerations,
      maxUploadBytes: row.maxUploadBytes,
      provider: row.provider,
      model: row.model,
      outputQuality: row.outputQuality,
      originalRetentionDays: row.originalRetentionDays,
      resultRetentionDays: row.resultRetentionDays,
      watermarkEnabled: row.watermarkEnabled,
      watermarkPosition: row.watermarkPosition,
      watermarkOnDownload: row.watermarkOnDownload,
      estimatedCostCzkPerGeneration: row.estimatedCostCzkPerGeneration,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  getPublicConfig(settings: Awaited<ReturnType<AiVisualizationSettingsService['getSettings']>>): AiVisualizationPublicConfig {
    return {
      enabled: settings.enabled,
      anonymousEnabled: settings.anonymousEnabled,
      maxUploadBytes: settings.maxUploadBytes,
      propertyTypes: [...PROPERTY_TYPE_OPTIONS],
      styles: [...STYLE_OPTIONS],
      renovationLevels: [...RENOVATION_LEVEL_OPTIONS],
    };
  }

  async updateSettings(patch: Partial<typeof DEFAULT_AI_VISUALIZATION_SETTINGS>) {
    await this.prisma.aiVisualizationSettings.upsert({
      where: { id: 'default' },
      create: { id: 'default', ...DEFAULT_AI_VISUALIZATION_SETTINGS, ...patch },
      update: patch,
    });
    return this.getSettings();
  }
}
