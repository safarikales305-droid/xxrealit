import { Injectable, Logger } from '@nestjs/common';
import type { MetaCenterSetting } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { MetaGraphClientService } from './meta-graph-client.service';

const SETTINGS_ID = 'default';

export type MetaInstagramIdentityResolution = {
  instagramBusinessId: string | null;
  instagramUsername: string | null;
  linkedPageId: string | null;
  linkedAdAccountId: string | null;
  usableForAds: boolean;
  connected: boolean;
  source: 'settings' | 'page_api' | 'none';
  message: string | null;
};

@Injectable()
export class MetaInstagramIdentityService {
  private readonly logger = new Logger(MetaInstagramIdentityService.name);

  constructor(
    private readonly graph: MetaGraphClientService,
    private readonly prisma: PrismaService,
  ) {}

  async resolveInstagramBusinessId(
    pageId: string | null | undefined,
    accessToken: string,
  ): Promise<{ id: string | null; username: string | null }> {
    const trimmedPageId = pageId?.trim();
    if (!trimmedPageId) {
      return { id: null, username: null };
    }
    const res = await this.graph.get<{
      instagram_business_account?: { id?: string; username?: string };
    }>(`/${trimmedPageId}`, accessToken, {
      fields: 'instagram_business_account{id,username}',
    });
    if (!res.ok) {
      this.logger.warn(
        `resolveInstagramBusinessId failed for page=${trimmedPageId}: ${res.errorMessage}`,
      );
      return { id: null, username: null };
    }
    const ig = res.data.instagram_business_account;
    return {
      id: ig?.id?.trim() ?? null,
      username: ig?.username?.trim() ?? ig?.id?.trim() ?? null,
    };
  }

  async resolveForLaunch(input: {
    pageId: string | null;
    adAccountId: string | null;
    accessToken: string;
    settingsRow: MetaCenterSetting | null;
    persist?: boolean;
  }): Promise<MetaInstagramIdentityResolution> {
    const pageId = input.pageId?.trim() ?? input.settingsRow?.pageId?.trim() ?? null;
    const adAccountId =
      input.adAccountId?.trim() ?? input.settingsRow?.adAccountId?.trim() ?? null;
    const settingsIg = input.settingsRow?.instagramBusinessId?.trim() ?? null;
    const settingsPage = input.settingsRow?.pageId?.trim() ?? null;

    if (settingsIg && settingsPage && pageId && settingsPage === pageId) {
      return {
        instagramBusinessId: settingsIg,
        instagramUsername: input.settingsRow?.instagramUsername?.trim() ?? settingsIg,
        linkedPageId: pageId,
        linkedAdAccountId: adAccountId,
        usableForAds: true,
        connected: true,
        source: 'settings',
        message: null,
      };
    }

    const fromPage = await this.resolveInstagramBusinessId(pageId, input.accessToken);
    if (fromPage.id) {
      if (input.persist !== false) {
        try {
          await this.prisma.metaCenterSetting.update({
            where: { id: SETTINGS_ID },
            data: {
              instagramBusinessId: fromPage.id,
              instagramUsername: fromPage.username,
              ...(pageId ? { pageId } : {}),
            },
          });
        } catch (err) {
          this.logger.warn(
            `Failed to persist instagramBusinessId: ${err instanceof Error ? err.message : err}`,
          );
        }
      }
      return {
        instagramBusinessId: fromPage.id,
        instagramUsername: fromPage.username,
        linkedPageId: pageId,
        linkedAdAccountId: adAccountId,
        usableForAds: true,
        connected: true,
        source: 'page_api',
        message: null,
      };
    }

    return {
      instagramBusinessId: null,
      instagramUsername: null,
      linkedPageId: pageId,
      linkedAdAccountId: adAccountId,
      usableForAds: false,
      connected: false,
      source: 'none',
      message:
        'Instagram Business účet není propojen s Facebook stránkou. Reklamy poběží pouze na Facebooku.',
    };
  }

  async getInstagramStatus(input: {
    pageId: string | null;
    adAccountId: string | null;
    accessToken: string;
    settingsRow: MetaCenterSetting | null;
  }): Promise<MetaInstagramIdentityResolution> {
    return this.resolveForLaunch({ ...input, persist: true });
  }
}
