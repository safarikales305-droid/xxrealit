import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

export type ListingWatermarkPosition =
  | 'left-top'
  | 'right-top'
  | 'left-bottom'
  | 'right-bottom';

export type ListingWatermarkSettings = {
  enabled: boolean;
  position: ListingWatermarkPosition;
  logoWidthRatio: number;
  opacity: number;
  marginPx: number;
};

const SETTINGS_KEY = 'listing_watermark';

const DEFAULT_SETTINGS: ListingWatermarkSettings = {
  enabled: true,
  position: 'left-top',
  logoWidthRatio: 0.14,
  opacity: 0.84,
  marginPx: 20,
};

@Injectable()
export class ListingWatermarkSettingsService {
  private readonly log = new Logger(ListingWatermarkSettingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  private clamp(
    n: number,
    min: number,
    max: number,
    fallback: number,
  ): number {
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  private normalize(raw: unknown): ListingWatermarkSettings {
    const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const p = String(o.position ?? DEFAULT_SETTINGS.position);
    const position: ListingWatermarkPosition =
      p === 'right-top' || p === 'left-bottom' || p === 'right-bottom'
        ? p
        : 'left-top';
    return {
      enabled:
        typeof o.enabled === 'boolean' ? o.enabled : DEFAULT_SETTINGS.enabled,
      position,
      logoWidthRatio: this.clamp(
        Number(o.logoWidthRatio),
        0.08,
        0.32,
        DEFAULT_SETTINGS.logoWidthRatio,
      ),
      opacity: this.clamp(Number(o.opacity), 0.2, 1, DEFAULT_SETTINGS.opacity),
      marginPx: Math.trunc(
        this.clamp(Number(o.marginPx), 0, 120, DEFAULT_SETTINGS.marginPx),
      ),
    };
  }

  async getSettings(): Promise<ListingWatermarkSettings> {
    const row = await this.prisma.appSetting.findUnique({
      where: { key: SETTINGS_KEY },
    });
    if (!row) return DEFAULT_SETTINGS;
    return this.normalize(row.valueJson);
  }

  async updateSettings(
    patch: Partial<ListingWatermarkSettings>,
  ): Promise<ListingWatermarkSettings> {
    const current = await this.getSettings();
    const next = this.normalize({ ...current, ...patch });
    await this.prisma.appSetting.upsert({
      where: { key: SETTINGS_KEY },
      create: {
        key: SETTINGS_KEY,
        valueJson: next as unknown as Prisma.InputJsonValue,
      },
      update: {
        valueJson: next as unknown as Prisma.InputJsonValue,
      },
    });
    this.log.log(
      `[listing-watermark] settings updated enabled=${next.enabled} position=${next.position} ratio=${next.logoWidthRatio} opacity=${next.opacity} margin=${next.marginPx}`,
    );
    return next;
  }
}
