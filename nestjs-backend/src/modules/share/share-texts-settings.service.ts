import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

export type ShareTextsSettings = {
  shareClassicTitle: string;
  shareClassicDescription: string;
  shareShortsTitle: string;
  shareShortsDescription: string;
  shareTipTitle: string;
  shareTipDescription: string;
  shareTiparPromoText: string;
};

export type ShareContentType = 'classic' | 'shorts' | 'tip' | 'tip-shorts';

const SETTINGS_KEY = 'share_texts';

export const DEFAULT_SHARE_TEXTS: ShareTextsSettings = {
  shareClassicTitle: 'Nový inzerát na portálu XXrealit',
  shareClassicDescription: 'Podívejte se na zajímavou nemovitost na XXrealit.',
  shareShortsTitle: 'Shorts video inzerát na XXrealit',
  shareShortsDescription: 'Prohlédněte si nemovitost ve video formátu.',
  shareTipTitle: 'Tip na zajímavou nemovitost',
  shareTipDescription: 'Vydělávejte – dávejte tipy investorům do nemovitostí.',
  shareTiparPromoText: 'Tip na zajímavou nemovitost – XXrealit',
};

@Injectable()
export class ShareTextsSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  private str(v: unknown, fallback: string): string {
    return typeof v === 'string' && v.trim() ? v.trim() : fallback;
  }

  normalize(raw: unknown): ShareTextsSettings {
    const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const d = DEFAULT_SHARE_TEXTS;
    return {
      shareClassicTitle: this.str(o.shareClassicTitle, d.shareClassicTitle),
      shareClassicDescription: this.str(o.shareClassicDescription, d.shareClassicDescription),
      shareShortsTitle: this.str(o.shareShortsTitle, d.shareShortsTitle),
      shareShortsDescription: this.str(o.shareShortsDescription, d.shareShortsDescription),
      shareTipTitle: this.str(o.shareTipTitle, d.shareTipTitle),
      shareTipDescription: this.str(o.shareTipDescription, d.shareTipDescription),
      shareTiparPromoText: this.str(o.shareTiparPromoText, d.shareTiparPromoText),
    };
  }

  async getSettings(): Promise<ShareTextsSettings> {
    const row = await this.prisma.appSetting.findUnique({ where: { key: SETTINGS_KEY } });
    if (!row) return DEFAULT_SHARE_TEXTS;
    return this.normalize(row.valueJson);
  }

  async updateSettings(patch: Partial<ShareTextsSettings>): Promise<ShareTextsSettings> {
    const current = await this.getSettings();
    const next = this.normalize({ ...current, ...patch });
    await this.prisma.appSetting.upsert({
      where: { key: SETTINGS_KEY },
      create: { key: SETTINGS_KEY, valueJson: next as unknown as Prisma.InputJsonValue },
      update: { valueJson: next as unknown as Prisma.InputJsonValue },
    });
    return next;
  }

  textsForType(
    type: ShareContentType,
    settings: ShareTextsSettings = DEFAULT_SHARE_TEXTS,
  ): { title: string; description: string; adminTextSource: string } {
    switch (type) {
      case 'shorts':
        return {
          title: settings.shareShortsTitle,
          description: settings.shareShortsDescription,
          adminTextSource: 'shareShortsTitle',
        };
      case 'tip':
        return {
          title: settings.shareTipTitle,
          description: settings.shareTipDescription,
          adminTextSource: 'shareTipTitle',
        };
      case 'tip-shorts':
        return {
          title: settings.shareTiparPromoText,
          description: settings.shareTipDescription,
          adminTextSource: 'shareTiparPromoText',
        };
      default:
        return {
          title: settings.shareClassicTitle,
          description: settings.shareClassicDescription,
          adminTextSource: 'shareClassicTitle',
        };
    }
  }
}
