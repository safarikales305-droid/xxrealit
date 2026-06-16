import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { WhatsAppConfigService } from './whatsapp-config.service';
import { WhatsAppSettingsService } from './whatsapp-settings.service';

const GRAPH_BASE = 'https://graph.facebook.com';

type MetaTemplateComponent = {
  type?: string;
  text?: string;
};

type MetaMessageTemplate = {
  id?: string;
  name?: string;
  language?: string;
  status?: string;
  category?: string;
  components?: MetaTemplateComponent[];
};

type MetaTemplatesPage = {
  data?: MetaMessageTemplate[];
  paging?: { cursors?: { after?: string }; next?: string };
  error?: { message?: string; code?: number; type?: string };
};

export type WhatsAppMetaTemplateRow = {
  id: string;
  metaTemplateId: string;
  templateName: string;
  category: string;
  language: string;
  status: string;
  bodyText: string;
  variablesCount: number;
  syncedAt: string;
};

export type WhatsAppTemplatesSyncResult = {
  ok: boolean;
  syncedCount: number;
  approvedCount: number;
  syncedAt: string;
  error?: string;
};

export type WhatsAppTemplatesListResult = {
  templates: WhatsAppMetaTemplateRow[];
  lastSyncedAt: string | null;
};

export function extractTemplateBodyText(components?: MetaTemplateComponent[]): string {
  if (!components?.length) return '';
  const body = components.find((c) => c.type?.toUpperCase() === 'BODY');
  return body?.text?.trim() ?? '';
}

export function countTemplateBodyVariables(bodyText: string): number {
  if (!bodyText) return 0;
  const matches = bodyText.match(/\{\{[^}]+\}\}/g);
  return matches?.length ?? 0;
}

@Injectable()
export class WhatsAppMetaTemplatesService {
  private readonly logger = new Logger(WhatsAppMetaTemplatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: WhatsAppConfigService,
    private readonly settings: WhatsAppSettingsService,
  ) {}

  private rowToDto(row: {
    id: string;
    metaTemplateId: string;
    templateName: string;
    category: string;
    language: string;
    status: string;
    bodyText: string;
    variablesCount: number;
    syncedAt: Date;
  }): WhatsAppMetaTemplateRow {
    return {
      id: row.id,
      metaTemplateId: row.metaTemplateId,
      templateName: row.templateName,
      category: row.category,
      language: row.language,
      status: row.status,
      bodyText: row.bodyText,
      variablesCount: row.variablesCount,
      syncedAt: row.syncedAt.toISOString(),
    };
  }

  async listTemplates(approvedOnly = false): Promise<WhatsAppTemplatesListResult> {
    const templates = await this.prisma.whatsAppMetaTemplate.findMany({
      where: approvedOnly ? { status: 'APPROVED' } : undefined,
      orderBy: [{ templateName: 'asc' }, { language: 'asc' }],
    });

    const last = await this.prisma.whatsAppMetaTemplate.aggregate({
      _max: { syncedAt: true },
    });

    return {
      templates: templates.map((t) => this.rowToDto(t)),
      lastSyncedAt: last._max.syncedAt?.toISOString() ?? null,
    };
  }

  async getById(id: string) {
    const row = await this.prisma.whatsAppMetaTemplate.findUnique({ where: { id } });
    return row ? this.rowToDto(row) : null;
  }

  async requireApprovedTemplate(id: string): Promise<WhatsAppMetaTemplateRow> {
    const row = await this.prisma.whatsAppMetaTemplate.findUnique({ where: { id } });
    if (!row) {
      throw new BadRequestException(
        'Vybraná šablona není v databázi — synchronizujte šablony z Meta.',
      );
    }
    if (row.status !== 'APPROVED') {
      throw new BadRequestException(
        `Šablona „${row.templateName}“ (${row.language}) není schválena — stav: ${row.status}.`,
      );
    }
    return this.rowToDto(row);
  }

  async syncTemplates(): Promise<WhatsAppTemplatesSyncResult> {
    await this.settings.reload();

    const wabaId = this.config.getBusinessAccountId();
    const token = this.config.getAccessToken();
    if (!wabaId || !token) {
      throw new ServiceUnavailableException(
        'Pro synchronizaci šablon nastavte WhatsApp Business Account ID a access token.',
      );
    }

    const apiVersion = this.config.getApiVersion();
    const syncedAt = new Date();
    const fetchedMetaIds: string[] = [];
    let after: string | undefined;

    try {
      do {
        const url = new URL(`${GRAPH_BASE}/${apiVersion}/${wabaId}/message_templates`);
        url.searchParams.set('limit', '100');
        if (after) url.searchParams.set('after', after);

        this.logger.log(`[WhatsApp Templates] GET ${url.toString()}`);

        const res = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${token}` },
        });

        const body = (await res.json().catch(() => ({}))) as MetaTemplatesPage;

        if (!res.ok) {
          const err = body.error;
          const msg = err?.message?.trim() || `Meta API vrátilo HTTP ${res.status}`;
          this.logger.warn(`[WhatsApp Templates] sync failed: ${msg}`);
          return {
            ok: false,
            syncedCount: 0,
            approvedCount: 0,
            syncedAt: syncedAt.toISOString(),
            error: msg,
          };
        }

        for (const item of body.data ?? []) {
          const metaTemplateId = item.id?.trim();
          const templateName = item.name?.trim();
          const language = item.language?.trim();
          if (!metaTemplateId || !templateName || !language) continue;

          fetchedMetaIds.push(metaTemplateId);
          const bodyText = extractTemplateBodyText(item.components);
          const variablesCount = countTemplateBodyVariables(bodyText);

          await this.prisma.whatsAppMetaTemplate.upsert({
            where: { metaTemplateId },
            create: {
              metaTemplateId,
              templateName,
              category: item.category?.trim() || 'UNKNOWN',
              language,
              status: item.status?.trim() || 'UNKNOWN',
              bodyText,
              variablesCount,
              syncedAt,
            },
            update: {
              templateName,
              category: item.category?.trim() || 'UNKNOWN',
              language,
              status: item.status?.trim() || 'UNKNOWN',
              bodyText,
              variablesCount,
              syncedAt,
            },
          });
        }

        after = body.paging?.cursors?.after;
        if (!body.paging?.next) break;
      } while (after);

      if (fetchedMetaIds.length > 0) {
        await this.prisma.whatsAppMetaTemplate.deleteMany({
          where: { metaTemplateId: { notIn: fetchedMetaIds } },
        });
      }

      const approvedCount = await this.prisma.whatsAppMetaTemplate.count({
        where: { status: 'APPROVED' },
      });

      this.logger.log(
        `[WhatsApp Templates] sync ok count=${fetchedMetaIds.length} approved=${approvedCount}`,
      );

      return {
        ok: true,
        syncedCount: fetchedMetaIds.length,
        approvedCount,
        syncedAt: syncedAt.toISOString(),
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Synchronizace šablon selhala.';
      this.logger.error(`[WhatsApp Templates] sync error: ${msg}`);
      return {
        ok: false,
        syncedCount: 0,
        approvedCount: 0,
        syncedAt: syncedAt.toISOString(),
        error: msg,
      };
    }
  }
}
