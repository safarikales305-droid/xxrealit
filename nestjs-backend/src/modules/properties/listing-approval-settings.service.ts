import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  DEFAULT_LISTING_APPROVAL_SETTINGS,
  type ListingApprovalSettings,
} from './listing-approval-settings.types';

const SETTINGS_KEY = 'listing_approval_settings';

@Injectable()
export class ListingApprovalSettingsService {
  private readonly log = new Logger(ListingApprovalSettingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  private normalize(raw: unknown): ListingApprovalSettings {
    const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const d = DEFAULT_LISTING_APPROVAL_SETTINGS;
    return {
      requireNewListingApproval:
        typeof o.requireNewListingApproval === 'boolean'
          ? o.requireNewListingApproval
          : d.requireNewListingApproval,
      requireEditApproval:
        typeof o.requireEditApproval === 'boolean' ? o.requireEditApproval : d.requireEditApproval,
      autoPublishOnCreate:
        typeof o.autoPublishOnCreate === 'boolean' ? o.autoPublishOnCreate : d.autoPublishOnCreate,
      autoPublishVerifiedUsersOnly:
        typeof o.autoPublishVerifiedUsersOnly === 'boolean'
          ? o.autoPublishVerifiedUsersOnly
          : d.autoPublishVerifiedUsersOnly,
      autoPublishProfessionalsOnly:
        typeof o.autoPublishProfessionalsOnly === 'boolean'
          ? o.autoPublishProfessionalsOnly
          : d.autoPublishProfessionalsOnly,
      privateListingsAlwaysPending:
        typeof o.privateListingsAlwaysPending === 'boolean'
          ? o.privateListingsAlwaysPending
          : d.privateListingsAlwaysPending,
    };
  }

  async getSettings(): Promise<ListingApprovalSettings> {
    const row = await this.prisma.appSetting.findUnique({ where: { key: SETTINGS_KEY } });
    if (!row) return { ...DEFAULT_LISTING_APPROVAL_SETTINGS };
    return this.normalize(row.valueJson);
  }

  async updateSettings(patch: Partial<ListingApprovalSettings>): Promise<ListingApprovalSettings> {
    const current = await this.getSettings();
    const next = this.normalize({ ...current, ...patch });
    await this.prisma.appSetting.upsert({
      where: { key: SETTINGS_KEY },
      create: { key: SETTINGS_KEY, valueJson: next as unknown as Prisma.InputJsonValue },
      update: { valueJson: next as unknown as Prisma.InputJsonValue },
    });
    this.log.log(`[listing-approval] updated ${JSON.stringify(next)}`);
    return next;
  }
}
