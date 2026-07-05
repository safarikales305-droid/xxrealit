import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { MetaConnectDiscoveryService } from './meta-connect-discovery.service';
import { MetaConnectOAuthService } from './meta-connect-oauth.service';
import { MetaGraphClientService } from './meta-graph-client.service';

const SETTINGS_ID = 'default';

@Injectable()
export class MetaConnectProvisionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly oauth: MetaConnectOAuthService,
    private readonly graph: MetaGraphClientService,
    private readonly discovery: MetaConnectDiscoveryService,
  ) {}

  private async requireBusinessId(): Promise<string> {
    const row = await this.prisma.metaCenterSetting.findUnique({ where: { id: SETTINGS_ID } });
    const businessId = row?.businessManagerId?.trim();
    if (!businessId) {
      throw new BadRequestException('Chybí Business Manager — nejdříve připojte Meta účet.');
    }
    return businessId;
  }

  async createPixel(name = 'XXREALIT Pixel'): Promise<{ ok: boolean; pixelId?: string; error?: string }> {
    try {
      const token = await this.oauth.resolveAccessToken();
      const businessId = await this.requireBusinessId();
      const res = await this.graph.post<{ id?: string }>(
        `/${businessId}/adspixels`,
        token,
        { name },
      );
      if (!res.ok) {
        return { ok: false, error: res.errorMessage };
      }
      if (!res.data.id) {
        return { ok: false, error: 'Pixel nebyl vytvořen.' };
      }
      await this.discovery.discoverAndPersist(token);
      return { ok: true, pixelId: res.data.id };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Vytvoření Pixelu selhalo.' };
    }
  }

  async createCatalog(name = 'XXREALIT Nemovitosti'): Promise<{ ok: boolean; catalogId?: string; error?: string }> {
    try {
      const token = await this.oauth.resolveAccessToken();
      const businessId = await this.requireBusinessId();
      const res = await this.graph.post<{ id?: string }>(
        `/${businessId}/owned_product_catalogs`,
        token,
        { name, vertical: 'commerce' },
      );
      if (!res.ok) {
        return { ok: false, error: res.errorMessage };
      }
      if (!res.data.id) {
        return { ok: false, error: 'Katalog nebyl vytvořen.' };
      }
      await this.discovery.discoverAndPersist(token);
      return { ok: true, catalogId: res.data.id };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Vytvoření katalogu selhalo.' };
    }
  }

  async createDataset(): Promise<{ ok: boolean; datasetId?: string; error?: string }> {
    const created = await this.createPixel('XXREALIT Dataset Pixel');
    if (!created.ok) return { ok: false, error: created.error };
    return { ok: true, datasetId: created.pixelId };
  }

  async createCommerce(): Promise<{ ok: boolean; error?: string }> {
    return {
      ok: false,
      error:
        'Commerce Manager nelze plně vytvořit automaticky — dokončete průvodce v Meta Business Suite a znovu synchronizujte.',
    };
  }

  async createRemarketingAudience(
    name = 'XXREALIT – Navštívil web',
  ): Promise<{ ok: boolean; audienceId?: string; error?: string }> {
    try {
      const token = await this.oauth.resolveAccessToken();
      const row = await this.prisma.metaCenterSetting.findUnique({ where: { id: SETTINGS_ID } });
      const adAccountId = row?.adAccountId?.trim();
      if (!adAccountId) {
        return { ok: false, error: 'Chybí reklamní účet.' };
      }
      const pixelId = row?.pixelId?.trim();
      if (!pixelId) {
        return { ok: false, error: 'Chybí Pixel ID.' };
      }
      const actId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
      const res = await this.graph.post<{ id?: string }>(`/${actId}/customaudiences`, token, {
        name,
        subtype: 'WEBSITE',
        description: 'Automaticky vytvořené publikum XXREALIT',
        retention_days: '180',
        rule: JSON.stringify({
          inclusions: {
            operator: 'or',
            rules: [{ event_sources: [{ id: pixelId, type: 'pixel' }], retention_seconds: 15552000, filter: { operator: 'and', filters: [] } }],
          },
        }),
      });
      if (!res.ok) {
        return { ok: false, error: res.errorMessage };
      }
      if (!res.data.id) {
        return { ok: false, error: 'Publikum nebylo vytvořeno.' };
      }
      return { ok: true, audienceId: res.data.id };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Vytvoření publika selhalo.' };
    }
  }

  async activateConversionsApi(): Promise<{ ok: boolean; error?: string }> {
    try {
      const token = await this.oauth.resolveAccessToken();
      await this.prisma.metaCenterSetting.update({
        where: { id: SETTINGS_ID },
        data: { conversionsApiToken: token },
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Aktivace CAPI selhala.' };
    }
  }
}
