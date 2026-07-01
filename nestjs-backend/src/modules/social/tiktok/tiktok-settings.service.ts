import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { TIKTOK_SETTINGS_KEY } from './tiktok.constants';

export type TikTokPortalSettings = {
  autoPublish: boolean;
  preferDirectPublish: boolean;
};

const DEFAULT_SETTINGS: TikTokPortalSettings = {
  autoPublish: false,
  preferDirectPublish: true,
};

@Injectable()
export class TikTokSettingsService implements OnModuleInit {
  private readonly logger = new Logger(TikTokSettingsService.name);
  private stored: TikTokPortalSettings = { ...DEFAULT_SETTINGS };

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.reload();
  }

  getSettings(): TikTokPortalSettings {
    return { ...this.stored };
  }

  async reload() {
    const row = await this.prisma.appSetting.findUnique({ where: { key: TIKTOK_SETTINGS_KEY } });
    const raw = row?.valueJson;
    const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    this.stored = {
      autoPublish: o.autoPublish === true,
      preferDirectPublish: o.preferDirectPublish !== false,
    };
  }

  async updateSettings(patch: Partial<TikTokPortalSettings>): Promise<TikTokPortalSettings> {
    const next = { ...this.stored, ...patch };
    await this.prisma.appSetting.upsert({
      where: { key: TIKTOK_SETTINGS_KEY },
      create: { key: TIKTOK_SETTINGS_KEY, valueJson: next as object },
      update: { valueJson: next as object },
    });
    this.stored = next;
    this.logger.log(`TikTok settings updated autoPublish=${next.autoPublish}`);
    return { ...next };
  }
}
