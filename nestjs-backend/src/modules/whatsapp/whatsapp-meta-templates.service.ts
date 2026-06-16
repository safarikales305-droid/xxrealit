import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { WhatsAppConfigService } from './whatsapp-config.service';
import { WhatsAppSettingsService } from './whatsapp-settings.service';
import {
  isJaspersMarketDemo,
  WHATSAPP_WRONG_WABA_WARNING,
  WhatsAppDiagnosticService,
} from './whatsapp-diagnostic.service';

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
  isStale: boolean;
  syncedAt: string;
};

export type WhatsAppTemplatesSyncResult = {
  ok: boolean;
  syncedCount: number;
  approvedCount: number;
  syncedAt: string;
  wabaId?: string;
  wabaName?: string;
  messageTemplateNamespace?: string;
  templateNames?: string[];
  warning?: string;
  error?: string;
};

export type WhatsAppTemplatesListResult = {
  templates: WhatsAppMetaTemplateRow[];
  lastSyncedAt: string | null;
  effectiveWabaId: string;
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
    private readonly diagnostic: WhatsAppDiagnosticService,
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
    isStale: boolean;
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
      isStale: row.isStale,
      syncedAt: row.syncedAt.toISOString(),
    };
  }

  async listTemplates(approvedOnly = false): Promise<WhatsAppTemplatesListResult> {
    await this.settings.reload();

    const where = approvedOnly
      ? { status: 'APPROVED', isStale: false }
      : undefined;

    const templates = await this.prisma.whatsAppMetaTemplate.findMany({
      where,
      orderBy: [{ isStale: 'asc' }, { templateName: 'asc' }, { language: 'asc' }],
    });

    const last = await this.prisma.whatsAppMetaTemplate.aggregate({
      _max: { syncedAt: true },
    });

    return {
      templates: templates.map((t) => this.rowToDto(t)),
      lastSyncedAt: last._max.syncedAt?.toISOString() ?? null,
      effectiveWabaId: this.config.getBusinessAccountId() ?? '',
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
    if (row.isStale) {
      throw new BadRequestException(
        `Šablona „${row.templateName}“ je zastaralá — synchronizujte šablony z Meta.`,
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
        'Pro synchronizaci šablon nastavte WhatsApp Business Account ID (WABA ID) a access token.',
      );
    }

    this.diagnostic.assertWabaNotConfusedWithOtherIds(wabaId);
    await this.diagnostic.assertPhoneBelongsToConfiguredWaba();

    const wabaInfo = await this.diagnostic.fetchWabaAccountInfo(wabaId);
    const wabaName = wabaInfo?.name ?? '—';
    const messageTemplateNamespace = wabaInfo?.message_template_namespace ?? '';

    this.logger.log(
      `[WhatsApp Templates] sync start wabaId=${wabaId} wabaName=${wabaName} namespace=${messageTemplateNamespace || '—'}`,
    );

    const apiVersion = this.config.getApiVersion();
    const syncedAt = new Date();
    const fetchedMetaIds: string[] = [];
    const templateNames: string[] = [];
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
          this.logger.warn(`[WhatsApp Templates] sync failed wabaId=${wabaId}: ${msg}`);
          return {
            ok: false,
            syncedCount: 0,
            approvedCount: 0,
            syncedAt: syncedAt.toISOString(),
            wabaId,
            wabaName,
            messageTemplateNamespace,
            templateNames: [],
            error: msg,
          };
        }

        for (const item of body.data ?? []) {
          const metaTemplateId = item.id?.trim();
          const templateName = item.name?.trim();
          const language = item.language?.trim();
          if (!metaTemplateId || !templateName || !language) continue;

          fetchedMetaIds.push(metaTemplateId);
          templateNames.push(templateName);
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
              isStale: false,
              syncedAt,
            },
            update: {
              templateName,
              category: item.category?.trim() || 'UNKNOWN',
              language,
              status: item.status?.trim() || 'UNKNOWN',
              bodyText,
              variablesCount,
              isStale: false,
              syncedAt,
            },
          });
        }

        after = body.paging?.cursors?.after;
        if (!body.paging?.next) break;
      } while (after);

      this.logger.log(
        `[WhatsApp Templates] wabaId=${wabaId} wabaName=${wabaName} count=${fetchedMetaIds.length} names=[${templateNames.join(', ')}]`,
      );

      if (fetchedMetaIds.length === 0) {
        this.logger.warn(
          `[WhatsApp Templates] sync returned 0 templates for wabaId=${wabaId} — existing templates kept (not marked stale)`,
        );
      } else {
        const staleResult = await this.prisma.whatsAppMetaTemplate.updateMany({
          where: { metaTemplateId: { notIn: fetchedMetaIds } },
          data: { isStale: true },
        });
        if (staleResult.count > 0) {
          this.logger.log(
            `[WhatsApp Templates] marked ${staleResult.count} template(s) as stale`,
          );
        }
      }

      const approvedCount = await this.prisma.whatsAppMetaTemplate.count({
        where: { status: 'APPROVED', isStale: false },
      });

      const warning = isJaspersMarketDemo(templateNames, messageTemplateNamespace)
        ? WHATSAPP_WRONG_WABA_WARNING
        : undefined;

      if (warning) {
        this.logger.warn(`[WhatsApp Templates] ${warning} wabaId=${wabaId} wabaName=${wabaName}`);
      }

      return {
        ok: true,
        syncedCount: fetchedMetaIds.length,
        approvedCount,
        syncedAt: syncedAt.toISOString(),
        wabaId,
        wabaName,
        messageTemplateNamespace,
        templateNames,
        warning,
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Synchronizace šablon selhala.';
      this.logger.error(`[WhatsApp Templates] sync error wabaId=${wabaId}: ${msg}`);
      return {
        ok: false,
        syncedCount: 0,
        approvedCount: 0,
        syncedAt: syncedAt.toISOString(),
        wabaId,
        wabaName,
        messageTemplateNamespace,
        templateNames,
        error: msg,
      };
    }
  }
}
