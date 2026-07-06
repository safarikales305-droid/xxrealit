import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { TokenEncryptionService } from '../social/token-encryption.service';
import type { MetaDiscoveredResources, MarketingOAuthTokenPersist } from './meta-connect.constants';
import { MetaGraphClientService } from './meta-graph-client.service';

const SETTINGS_ID = 'default';

type GraphList<T> = { data?: T[] };

@Injectable()
export class MetaConnectDiscoveryService {
  private readonly logger = new Logger(MetaConnectDiscoveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly graph: MetaGraphClientService,
    private readonly crypto: TokenEncryptionService,
  ) {}

  async discoverAndPersist(accessToken: string): Promise<MetaDiscoveredResources> {
    const discovered = await this.discover(accessToken);
    await this.persist(discovered, accessToken);
    return discovered;
  }

  async discoverMarketingAndPersist(
    accessToken: string,
    tokenMeta: MarketingOAuthTokenPersist,
  ): Promise<MetaDiscoveredResources> {
    const discovered = await this.discoverMarketing(accessToken);
    await this.persistMarketing(discovered, accessToken, tokenMeta);
    return discovered;
  }

  async discoverMarketing(accessToken: string): Promise<MetaDiscoveredResources> {
    const warnings: string[] = [];
    const result: MetaDiscoveredResources = {
      user: null,
      business: null,
      adAccount: null,
      page: null,
      instagram: null,
      catalog: null,
      pixel: null,
      dataset: null,
      commerce: null,
      whatsapp: null,
      testEventCode: null,
      warnings,
    };

    const me = await this.graph.get<{ id?: string; name?: string }>(
      '/me',
      accessToken,
      { fields: 'id,name' },
    );
    if (me.ok && me.data.id) {
      result.user = { id: me.data.id, name: me.data.name ?? me.data.id };
    } else {
      warnings.push(me.ok ? 'Nepodařilo se načíst uživatele.' : me.errorMessage);
    }

    const businesses = await this.graph.get<GraphList<{ id?: string; name?: string }>>(
      '/me/businesses',
      accessToken,
      { fields: 'id,name', limit: '25' },
    );
    const business = businesses.ok ? businesses.data.data?.[0] : undefined;
    if (business?.id) {
      result.business = { id: business.id, name: business.name ?? business.id };
    } else {
      warnings.push('Business Manager nenalezen — zkontrolujte oprávnění business_management.');
    }

    if (result.business?.id) {
      const bmId = result.business.id;
      const adAccounts = await this.graph.get<
        GraphList<{ id?: string; name?: string; account_id?: string }>
      >(`/${bmId}/owned_ad_accounts`, accessToken, { fields: 'id,name,account_id', limit: '25' });
      const ad = adAccounts.ok ? adAccounts.data.data?.[0] : undefined;
      if (ad?.id) {
        result.adAccount = {
          id: ad.account_id ?? ad.id.replace(/^act_/, ''),
          name: ad.name ?? ad.id,
        };
      }
    }

    if (!result.adAccount) {
      const directAds = await this.graph.get<
        GraphList<{ id?: string; name?: string; account_id?: string }>
      >('/me/adaccounts', accessToken, { fields: 'id,name,account_id', limit: '25' });
      const ad = directAds.ok ? directAds.data.data?.[0] : undefined;
      if (ad?.id) {
        result.adAccount = {
          id: ad.account_id ?? ad.id.replace(/^act_/, ''),
          name: ad.name ?? ad.id,
        };
      } else {
        warnings.push('Reklamní účet nenalezen.');
      }
    }

    return result;
  }

  async discover(accessToken: string): Promise<MetaDiscoveredResources> {
    const warnings: string[] = [];
    const result: MetaDiscoveredResources = {
      user: null,
      business: null,
      adAccount: null,
      page: null,
      instagram: null,
      catalog: null,
      pixel: null,
      dataset: null,
      commerce: null,
      whatsapp: null,
      testEventCode: null,
      warnings,
    };

    const me = await this.graph.get<{ id?: string; name?: string }>(
      '/me',
      accessToken,
      { fields: 'id,name' },
    );
    if (me.ok && me.data.id) {
      result.user = { id: me.data.id, name: me.data.name ?? me.data.id };
    } else {
      warnings.push(me.ok ? 'Nepodařilo se načíst uživatele.' : me.errorMessage);
    }

    const businesses = await this.graph.get<GraphList<{ id?: string; name?: string }>>(
      '/me/businesses',
      accessToken,
      { fields: 'id,name', limit: '25' },
    );
    const business = businesses.ok ? businesses.data.data?.[0] : undefined;
    if (business?.id) {
      result.business = { id: business.id, name: business.name ?? business.id };
    } else {
      warnings.push('Business Manager nenalezen — zkontrolujte oprávnění business_management.');
    }

    const pages = await this.graph.get<
      GraphList<{
        id?: string;
        name?: string;
        access_token?: string;
        instagram_business_account?: { id?: string; username?: string };
      }>
    >('/me/accounts', accessToken, {
      fields: 'id,name,access_token,instagram_business_account{id,username}',
      limit: '50',
    });

    const page = pages.ok ? this.pickPreferredPage(pages.data.data ?? []) : undefined;
    if (page?.id) {
      result.page = {
        id: page.id,
        name: page.name ?? page.id,
        pageAccessToken: page.access_token,
      };
      const ig = page.instagram_business_account;
      if (ig?.id) {
        result.instagram = { id: ig.id, username: ig.username ?? ig.id };
      }
    } else {
      warnings.push('Facebook stránka nenalezena.');
    }

    if (result.business?.id) {
      const bmId = result.business.id;

      const adAccounts = await this.graph.get<
        GraphList<{ id?: string; name?: string; account_id?: string }>
      >(`/${bmId}/owned_ad_accounts`, accessToken, { fields: 'id,name,account_id', limit: '25' });
      const ad = adAccounts.ok ? adAccounts.data.data?.[0] : undefined;
      if (ad?.id) {
        result.adAccount = {
          id: ad.account_id ?? ad.id.replace(/^act_/, ''),
          name: ad.name ?? ad.id,
        };
      } else {
        warnings.push('Reklamní účet nenalezen.');
      }

      const catalogs = await this.graph.get<GraphList<{ id?: string; name?: string }>>(
        `/${bmId}/owned_product_catalogs`,
        accessToken,
        { fields: 'id,name', limit: '25' },
      );
      const catalog = catalogs.ok ? catalogs.data.data?.[0] : undefined;
      if (catalog?.id) {
        result.catalog = { id: catalog.id, name: catalog.name ?? catalog.id };
      } else {
        warnings.push('Katalog nenalezen.');
      }

      const pixels = await this.graph.get<GraphList<{ id?: string; name?: string }>>(
        `/${bmId}/adspixels`,
        accessToken,
        { fields: 'id,name', limit: '25' },
      );
      const pixel = pixels.ok ? pixels.data.data?.[0] : undefined;
      if (pixel?.id) {
        result.pixel = { id: pixel.id, name: pixel.name ?? pixel.id };
        result.dataset = { id: pixel.id };
      } else {
        warnings.push('Pixel nenalezen.');
      }

      const commerce = await this.graph.get<GraphList<{ id?: string; name?: string }>>(
        `/${bmId}/commerce_merchant_settings`,
        accessToken,
        { fields: 'id,display_name', limit: '10' },
      );
      const commerceRow = commerce.ok ? commerce.data.data?.[0] : undefined;
      if (commerceRow?.id) {
        result.commerce = {
          id: commerceRow.id,
          name: commerceRow.name ?? 'Commerce Manager',
        };
      } else if (result.page?.id) {
        const pageCommerce = await this.graph.get<{
          commerce_merchant_settings?: { id?: string; display_name?: string };
        }>(`/${result.page.id}`, accessToken, { fields: 'commerce_merchant_settings{id,display_name}' });
        const cms = pageCommerce.ok ? pageCommerce.data.commerce_merchant_settings : undefined;
        if (cms?.id) {
          result.commerce = { id: cms.id, name: cms.display_name ?? 'Commerce' };
        } else {
          warnings.push('Commerce Manager nenalezen.');
        }
      }

      const waba = await this.graph.get<
        GraphList<{
          id?: string;
          name?: string;
          phone_numbers?: { data?: Array<{ id?: string }> };
        }>
      >(`/${bmId}/owned_whatsapp_business_accounts`, accessToken, {
        fields: 'id,name,phone_numbers{id,display_phone_number}',
        limit: '10',
      });
      const wa = waba.ok ? waba.data.data?.[0] : undefined;
      if (wa?.id) {
        result.whatsapp = {
          businessAccountId: wa.id,
          phoneNumberId: wa.phone_numbers?.data?.[0]?.id ?? null,
        };
      } else {
        warnings.push('WhatsApp Business účet nenalezen.');
      }
    }

    if (result.pixel?.id) {
      const testCode = `TEST${result.pixel.id.slice(-8).toUpperCase()}`;
      result.testEventCode = testCode;
    }

    return result;
  }

  private pickPreferredPage(
    pages: Array<{
      id?: string;
      name?: string;
      access_token?: string;
      instagram_business_account?: { id?: string; username?: string };
    }>,
  ) {
    const hints = ['xxrealit.cz', 'xxrealit', 'xx realit'];
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');
    for (const hint of hints) {
      const match = pages.find((p) => norm(p.name ?? '').includes(norm(hint)));
      if (match) return match;
    }
    return pages[0];
  }

  private async persist(discovered: MetaDiscoveredResources, accessToken: string) {
    const pageToken = discovered.page?.pageAccessToken;
    const data: Prisma.MetaCenterSettingUpdateInput = {
      businessManagerId: discovered.business?.id ?? null,
      commerceManagerId: discovered.commerce?.id ?? null,
      commerceAccountId: discovered.commerce?.id ?? null,
      catalogId: discovered.catalog?.id ?? null,
      catalogName: discovered.catalog?.name ?? null,
      datasetId: discovered.dataset?.id ?? discovered.pixel?.id ?? null,
      pixelId: discovered.pixel?.id ?? null,
      pixelName: discovered.pixel?.name ?? null,
      adAccountId: discovered.adAccount?.id ?? null,
      adAccountName: discovered.adAccount?.name ?? null,
      pageId: discovered.page?.id ?? null,
      pageName: discovered.page?.name ?? null,
      instagramBusinessId: discovered.instagram?.id ?? null,
      instagramUsername: discovered.instagram?.username ?? null,
      whatsappBusinessAccountId: discovered.whatsapp?.businessAccountId ?? null,
      whatsappPhoneNumberId: discovered.whatsapp?.phoneNumberId ?? null,
      testEventCode: discovered.testEventCode,
      metaConnectedUserId: discovered.user?.id ?? null,
      metaConnectedUserName: discovered.user?.name ?? null,
      connectionSnapshot: this.toJson(discovered),
      conversionsApiToken: accessToken,
      lastAutoSyncAt: new Date(),
    };

    if (pageToken) {
      data.pageAccessTokenEncrypted = this.crypto.encrypt(pageToken);
    }

    await this.prisma.metaCenterSetting.update({
      where: { id: SETTINGS_ID },
      data,
    });

    this.logger.log(
      `[meta-discovery] saved pixel=${discovered.pixel?.id ?? '—'} catalog=${discovered.catalog?.id ?? '—'}`,
    );
  }

  private async persistMarketing(
    discovered: MetaDiscoveredResources,
    accessToken: string,
    tokenMeta: MarketingOAuthTokenPersist,
  ) {
    const adAccountId = discovered.adAccount?.id
      ? discovered.adAccount.id.startsWith('act_')
        ? discovered.adAccount.id
        : `act_${discovered.adAccount.id}`
      : null;

    const data: Prisma.MetaCenterSettingUpdateInput = {
      facebookMarketingAppId: tokenMeta.marketingAppId,
      businessManagerId: discovered.business?.id ?? null,
      adAccountId,
      adAccountName: discovered.adAccount?.name ?? null,
      metaConnectedUserId: discovered.user?.id ?? null,
      metaConnectedUserName: discovered.user?.name ?? null,
      marketingAccessTokenEncrypted: this.crypto.encrypt(accessToken),
      marketingTokenExpiresAt: tokenMeta.tokenExpiresAt ?? null,
      marketingTokenExpiresIn: tokenMeta.expiresIn ?? null,
      marketingTokenType: tokenMeta.tokenType ?? 'bearer',
      marketingGrantedScopes: tokenMeta.grantedScopes,
      marketingRefreshTokenEncrypted: tokenMeta.refreshToken?.trim()
        ? this.crypto.encrypt(tokenMeta.refreshToken.trim())
        : null,
      lastAutoSyncAt: new Date(),
    };

    await this.prisma.metaCenterSetting.update({
      where: { id: SETTINGS_ID },
      data,
    });

    this.logger.log(
      `[meta-marketing-oauth] Marketing App ID=${tokenMeta.marketingAppId} ` +
        `Token Source=${tokenMeta.tokenSource} ` +
        `Granted Scopes=${tokenMeta.grantedScopes.join(',')} ` +
        `Business ID=${discovered.business?.id ?? '—'} ` +
        `Ad Account ID=${adAccountId ?? '—'}`,
    );
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
