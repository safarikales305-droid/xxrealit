import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  DEFAULT_AI_PROPERTY_FINDER_SETTINGS,
  type AiPropertyFinderPublicConfig,
} from './ai-property-finder.types';

@Injectable()
export class AiPropertyFinderSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings() {
    const row = await this.prisma.aiPropertyFinderSettings.findUnique({ where: { id: 'default' } });
    if (!row) {
      return { ...DEFAULT_AI_PROPERTY_FINDER_SETTINGS, updatedAt: new Date().toISOString() };
    }
    return {
      enabled: row.enabled,
      popupDelaySec: row.popupDelaySec,
      popupScrollPercent: row.popupScrollPercent,
      popupOnInteraction: row.popupOnInteraction,
      popupAsCtaOnly: row.popupAsCtaOnly,
      externalDiscoveryEnabled: row.externalDiscoveryEnabled,
      cacheTtlMinutes: row.cacheTtlMinutes,
      minMatchScore: row.minMatchScore,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  getPublicConfig(settings: Awaited<ReturnType<AiPropertyFinderSettingsService['getSettings']>>): AiPropertyFinderPublicConfig {
    return {
      enabled: settings.enabled,
      popupDelaySec: settings.popupDelaySec,
      popupScrollPercent: settings.popupScrollPercent,
      popupOnInteraction: settings.popupOnInteraction,
      popupAsCtaOnly: settings.popupAsCtaOnly,
    };
  }

  async updateSettings(patch: Partial<typeof DEFAULT_AI_PROPERTY_FINDER_SETTINGS>) {
    const row = await this.prisma.aiPropertyFinderSettings.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        ...DEFAULT_AI_PROPERTY_FINDER_SETTINGS,
        ...patch,
      },
      update: patch,
    });
    return this.getSettingsFromRow(row);
  }

  private getSettingsFromRow(row: {
    enabled: boolean;
    popupDelaySec: number;
    popupScrollPercent: number;
    popupOnInteraction: boolean;
    popupAsCtaOnly: boolean;
    externalDiscoveryEnabled: boolean;
    cacheTtlMinutes: number;
    minMatchScore: number;
    updatedAt: Date;
  }) {
    return {
      enabled: row.enabled,
      popupDelaySec: row.popupDelaySec,
      popupScrollPercent: row.popupScrollPercent,
      popupOnInteraction: row.popupOnInteraction,
      popupAsCtaOnly: row.popupAsCtaOnly,
      externalDiscoveryEnabled: row.externalDiscoveryEnabled,
      cacheTtlMinutes: row.cacheTtlMinutes,
      minMatchScore: row.minMatchScore,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
