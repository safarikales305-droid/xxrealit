import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { WhatsAppConfigService } from './whatsapp-config.service';
import { WhatsAppSettingsService } from './whatsapp-settings.service';
import {
  isExcludedCampaignTemplate,
  isJaspersMarketDemo,
  WHATSAPP_WRONG_WABA_WARNING,
  WhatsAppDiagnosticService,
} from './whatsapp-diagnostic.service';
import {
  isUsableTemplateStatus,
  normalizeTemplateStatus,
} from './whatsapp-template-status.util';
import {
  type MetaMessageTemplate,
  type MetaTemplatesPage,
  type WhatsAppTemplateSkipReason,
  type WhatsAppTemplateSyncDebug,
  parseMetaTemplateItem,
} from './whatsapp-template-sync.util';

const GRAPH_BASE = 'https://graph.facebook.com';

export type WhatsAppMetaTemplateRow = {
  id: string;
  wabaId: string;
  metaTemplateId: string;
  templateName: string;
  category: string;
  language: string;
  status: string;
  rawStatus: string;
  normalizedStatus: string;
  isUsable: boolean;
  headerType: string;
  bodyText: string;
  variablesCount: number;
  isStale: boolean;
  lastSyncedAt: string | null;
  rawTemplate?: unknown;
};

export type WhatsAppTemplateSyncSummaryRow = {
  name: string;
  language: string;
  rawStatus: string;
  normalizedStatus: string;
  isUsable: boolean;
  saved?: boolean;
  skipReason?: string;
};

export type WhatsAppTemplatesSyncResult = {
  ok: boolean;
  syncedCount: number;
  approvedCount: number;
  usableCount: number;
  syncedAt: string;
  wabaId?: string;
  wabaName?: string;
  messageTemplateNamespace?: string;
  templateNames?: string[];
  templatesSummary?: WhatsAppTemplateSyncSummaryRow[];
  syncDebug?: WhatsAppTemplateSyncDebug;
  warning?: string;
  error?: string;
};

export type WhatsAppTemplatesListResult = {
  templates: WhatsAppMetaTemplateRow[];
  lastSyncedAt: string | null;
  effectiveWabaId: string;
  totalCount: number;
  usableCount: number;
};

export type WhatsAppTemplatesCleanupResult = {
  ok: boolean;
  deletedCount: number;
  activeWabaId: string;
};

@Injectable()
export class WhatsAppMetaTemplatesService {
  private readonly logger = new Logger(WhatsAppMetaTemplatesService.name);
  private lastSyncRawResponse: unknown = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: WhatsAppConfigService,
    private readonly settings: WhatsAppSettingsService,
    private readonly diagnostic: WhatsAppDiagnosticService,
  ) {}

  private effectiveWabaId(): string {
    return this.config.getBusinessAccountId()?.trim() ?? '';
  }

  private rowToDto(row: {
    id: string;
    wabaId: string | null;
    metaTemplateId: string;
    templateName: string;
    category: string;
    language: string;
    status: string;
    rawStatus: string | null;
    normalizedStatus: string | null;
    rawTemplate: Prisma.JsonValue | null;
    usable: boolean;
    headerType: string;
    bodyText: string;
    variablesCount: number;
    isStale: boolean;
    lastSyncedAt: Date | null;
  }): WhatsAppMetaTemplateRow {
    const normalizedStatus =
      row.normalizedStatus?.trim() || normalizeTemplateStatus(row.rawStatus || row.status);
    return {
      id: row.id,
      wabaId: row.wabaId ?? '',
      metaTemplateId: row.metaTemplateId,
      templateName: row.templateName,
      category: row.category,
      language: row.language,
      status: row.status,
      rawStatus: row.rawStatus || row.status,
      normalizedStatus,
      isUsable: row.usable || isUsableTemplateStatus(normalizedStatus),
      headerType: row.headerType || 'NONE',
      bodyText: row.bodyText,
      variablesCount: row.variablesCount,
      isStale: row.isStale,
      lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
      rawTemplate: row.rawTemplate ?? undefined,
    };
  }

  private activeWabaWhere(): Prisma.WhatsAppMetaTemplateWhereInput {
    const wabaId = this.effectiveWabaId();
    return wabaId ? { wabaId } : {};
  }

  private demoExcludeWhere(): Prisma.WhatsAppMetaTemplateWhereInput {
    return {
      NOT: {
        OR: [
          { templateName: { startsWith: 'jaspers_market', mode: 'insensitive' } },
          { templateName: { equals: 'hello_world', mode: 'insensitive' } },
        ],
      },
    };
  }

  private campaignListWhere(usableOnly: boolean): Prisma.WhatsAppMetaTemplateWhereInput {
    const base: Prisma.WhatsAppMetaTemplateWhereInput = {
      ...this.activeWabaWhere(),
      ...this.demoExcludeWhere(),
    };

    if (!usableOnly) return base;

    return {
      ...base,
      isStale: false,
      usable: true,
    };
  }

  private assertTemplateBelongsToConfiguredWaba(row: {
    wabaId: string | null;
    templateName: string;
  }) {
    const configuredWabaId = this.effectiveWabaId();
    if (!configuredWabaId) return;

    if (row.wabaId !== configuredWabaId) {
      throw new BadRequestException(
        `Šablona „${row.templateName}“ patří jinému WABA (${row.wabaId || 'neznámé'}). Aktuální WABA: ${configuredWabaId}. Synchronizujte šablony nebo vyčistěte staré záznamy.`,
      );
    }
  }

  private formatPrismaError(error: unknown): string {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return `DB ${error.code}: ${error.message}`;
    }
    if (error instanceof Error) return error.message;
    return String(error);
  }

  private async saveSyncedTemplate(
    wabaId: string,
    item: MetaMessageTemplate,
    lastSyncedAt: Date,
  ): Promise<void> {
    const parsed = parseMetaTemplateItem(item);
    if (!parsed) {
      throw new Error('Chybí id, name nebo language v Meta šabloně.');
    }

    const normalizedStatus = normalizeTemplateStatus(parsed.rawStatus);
    const usable = isUsableTemplateStatus(normalizedStatus);
    const data = {
      wabaId,
      metaTemplateId: parsed.metaTemplateId,
      templateName: parsed.templateName,
      category: parsed.category,
      language: parsed.language,
      status: normalizedStatus,
      rawStatus: parsed.rawStatus,
      normalizedStatus,
      rawTemplate: item as Prisma.InputJsonValue,
      usable,
      headerType: parsed.headerType,
      bodyText: parsed.bodyText,
      variablesCount: parsed.variablesCount,
      isStale: false,
      lastSyncedAt,
    };

    const byMetaId = await this.prisma.whatsAppMetaTemplate.findUnique({
      where: { metaTemplateId: parsed.metaTemplateId },
    });

    if (byMetaId) {
      await this.prisma.whatsAppMetaTemplate.update({
        where: { metaTemplateId: parsed.metaTemplateId },
        data,
      });
      return;
    }

    const byComposite = await this.prisma.whatsAppMetaTemplate.findUnique({
      where: {
        wabaId_templateName_language: {
          wabaId,
          templateName: parsed.templateName,
          language: parsed.language,
        },
      },
    });

    if (byComposite) {
      if (byComposite.metaTemplateId !== parsed.metaTemplateId) {
        await this.prisma.whatsAppMetaTemplate.delete({ where: { id: byComposite.id } });
        await this.prisma.whatsAppMetaTemplate.create({ data });
      } else {
        await this.prisma.whatsAppMetaTemplate.update({
          where: { id: byComposite.id },
          data,
        });
      }
      return;
    }

    await this.prisma.whatsAppMetaTemplate.create({ data });
  }

  getLastSyncRawResponse(): unknown {
    return this.lastSyncRawResponse;
  }

  async listTemplates(usableOnly = false): Promise<WhatsAppTemplatesListResult> {
    await this.settings.reload();

    const where = this.campaignListWhere(usableOnly);
    const templates = await this.prisma.whatsAppMetaTemplate.findMany({
      where,
      orderBy: [{ isStale: 'asc' }, { templateName: 'asc' }, { language: 'asc' }],
    });

    const wabaId = this.effectiveWabaId();
    const scope = this.activeWabaWhere();
    const last = await this.prisma.whatsAppMetaTemplate.aggregate({
      where: Object.keys(scope).length ? scope : undefined,
      _max: { lastSyncedAt: true },
    });

    const allForWaba = templates.map((t) => this.rowToDto(t));
    const usableCount = allForWaba.filter((t) => t.isUsable && !t.isStale).length;

    return {
      templates: allForWaba,
      lastSyncedAt: last._max.lastSyncedAt?.toISOString() ?? null,
      effectiveWabaId: wabaId,
      totalCount: allForWaba.length,
      usableCount,
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

    const dto = this.rowToDto(row);

    if (row.isStale) {
      throw new BadRequestException(
        `Šablona „${row.templateName}“ je zastaralá — synchronizujte šablony z Meta.`,
      );
    }
    if (!dto.isUsable) {
      throw new BadRequestException(
        `Šablona „${row.templateName}“ (${row.language}) není použitelná — raw: ${dto.rawStatus}, normalized: ${dto.normalizedStatus}.`,
      );
    }
    this.assertTemplateBelongsToConfiguredWaba(row);
    if (isExcludedCampaignTemplate(row.templateName)) {
      throw new BadRequestException(
        `Demo šablona „${row.templateName}“ nelze použít v kampani.`,
      );
    }
    return dto;
  }

  async cleanupOldTemplates(): Promise<WhatsAppTemplatesCleanupResult> {
    await this.settings.reload();
    const activeWabaId = this.effectiveWabaId();
    if (!activeWabaId) {
      throw new BadRequestException('Není nastaveno WABA ID — nelze vyčistit šablony.');
    }

    const result = await this.prisma.whatsAppMetaTemplate.deleteMany({
      where: {
        OR: [
          { wabaId: { not: activeWabaId } },
          { wabaId: null },
          { wabaId: '' },
          { isStale: true },
          { templateName: { startsWith: 'jaspers_market', mode: 'insensitive' } },
          { templateName: { equals: 'hello_world', mode: 'insensitive' } },
        ],
      },
    });

    this.logger.log(
      `[WhatsApp Templates] cleanup activeWabaId=${activeWabaId} deleted=${result.count}`,
    );

    return { ok: true, deletedCount: result.count, activeWabaId };
  }

  async syncTemplates(): Promise<WhatsAppTemplatesSyncResult> {
    await this.settings.reload();

    const wabaId = this.effectiveWabaId();
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
    const lastSyncedAt = new Date();
    const fetchedMetaIds: string[] = [];
    const templateNames: string[] = [];
    const templatesSummary: WhatsAppTemplateSyncSummaryRow[] = [];
    const reasonSkipped: WhatsAppTemplateSkipReason[] = [];
    const rawPages: MetaTemplatesPage[] = [];
    let rawCount = 0;
    let normalizedCount = 0;
    let savedCount = 0;
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
        rawPages.push(body);
        this.logger.log(`[WhatsApp Templates] raw page: ${JSON.stringify(body)}`);

        if (!res.ok) {
          const err = body.error;
          const msg = err?.message?.trim() || `Meta API vrátilo HTTP ${res.status}`;
          this.logger.warn(`[WhatsApp Templates] sync failed wabaId=${wabaId}: ${msg}`);
          this.lastSyncRawResponse = { pages: rawPages, error: msg };
          return {
            ok: false,
            syncedCount: 0,
            approvedCount: 0,
            usableCount: 0,
            syncedAt: lastSyncedAt.toISOString(),
            wabaId,
            wabaName,
            messageTemplateNamespace,
            templateNames: [],
            templatesSummary: [],
            syncDebug: {
              rawCount,
              normalizedCount,
              savedCount,
              visibleCount: 0,
              reasonSkipped,
            },
            error: msg,
          };
        }

        for (const item of body.data ?? []) {
          rawCount += 1;

          const parsed = parseMetaTemplateItem(item);
          if (!parsed) {
            const reason = 'Chybí id, name nebo language v Meta odpovědi.';
            reasonSkipped.push({
              name: item.name?.trim() || '?',
              language: item.language?.trim(),
              metaTemplateId: item.id?.trim(),
              reason,
            });
            templatesSummary.push({
              name: item.name?.trim() || '?',
              language: item.language?.trim() || '?',
              rawStatus: item.status?.trim() || 'UNKNOWN',
              normalizedStatus: 'UNKNOWN',
              isUsable: false,
              saved: false,
              skipReason: reason,
            });
            continue;
          }

          const normalizedStatus = normalizeTemplateStatus(parsed.rawStatus);
          const isUsable = isUsableTemplateStatus(normalizedStatus);
          if (isUsable) normalizedCount += 1;

          this.logger.log(
            `[WhatsApp Templates] template name=${parsed.templateName} lang=${parsed.language} ` +
              `rawStatus=${parsed.rawStatus} normalized=${normalizedStatus} usable=${isUsable} ` +
              `headerType=${parsed.headerType} variablesCount=${parsed.variablesCount} ` +
              `parameterFormat=${parsed.parameterFormat}`,
          );

          fetchedMetaIds.push(parsed.metaTemplateId);
          templateNames.push(parsed.templateName);

          try {
            await this.saveSyncedTemplate(wabaId, item, lastSyncedAt);
            savedCount += 1;
            templatesSummary.push({
              name: parsed.templateName,
              language: parsed.language,
              rawStatus: parsed.rawStatus,
              normalizedStatus,
              isUsable,
              saved: true,
            });
          } catch (saveError: unknown) {
            const reason = this.formatPrismaError(saveError);
            reasonSkipped.push({
              name: parsed.templateName,
              language: parsed.language,
              metaTemplateId: parsed.metaTemplateId,
              reason,
            });
            templatesSummary.push({
              name: parsed.templateName,
              language: parsed.language,
              rawStatus: parsed.rawStatus,
              normalizedStatus,
              isUsable,
              saved: false,
              skipReason: reason,
            });
            this.logger.error(
              `[WhatsApp Templates] save failed name=${parsed.templateName} lang=${parsed.language}: ${reason}`,
            );
          }
        }

        after = body.paging?.cursors?.after;
        if (!body.paging?.next) break;
      } while (after);

      if (fetchedMetaIds.length > 0) {
        const staleResult = await this.prisma.whatsAppMetaTemplate.updateMany({
          where: {
            wabaId,
            metaTemplateId: { notIn: fetchedMetaIds },
          },
          data: { isStale: true },
        });
        if (staleResult.count > 0) {
          this.logger.log(
            `[WhatsApp Templates] marked ${staleResult.count} template(s) as stale for wabaId=${wabaId}`,
          );
        }
      } else {
        this.logger.warn(
          `[WhatsApp Templates] sync returned 0 templates for wabaId=${wabaId} — existing templates kept (not marked stale)`,
        );
      }

      const visibleCount = await this.prisma.whatsAppMetaTemplate.count({
        where: this.campaignListWhere(true),
      });

      const syncDebug: WhatsAppTemplateSyncDebug = {
        rawCount,
        normalizedCount,
        savedCount,
        visibleCount,
        reasonSkipped,
      };

      this.lastSyncRawResponse = {
        wabaId,
        syncedAt: lastSyncedAt.toISOString(),
        pages: rawPages,
        templatesSummary,
        syncDebug,
      };

      this.logger.log(
        `[WhatsApp Templates] wabaId=${wabaId} syncDebug=${JSON.stringify(syncDebug)}`,
      );

      const usableCount = templatesSummary.filter((t) => t.isUsable && t.saved).length;
      const approvedCount = visibleCount;

      const warning = isJaspersMarketDemo(templateNames, messageTemplateNamespace)
        ? WHATSAPP_WRONG_WABA_WARNING
        : undefined;

      if (warning) {
        this.logger.warn(`[WhatsApp Templates] ${warning} wabaId=${wabaId} wabaName=${wabaName}`);
      }

      return {
        ok: true,
        syncedCount: savedCount,
        approvedCount,
        usableCount,
        syncedAt: lastSyncedAt.toISOString(),
        wabaId,
        wabaName,
        messageTemplateNamespace,
        templateNames,
        templatesSummary,
        syncDebug,
        warning,
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Synchronizace šablon selhala.';
      this.logger.error(`[WhatsApp Templates] sync error wabaId=${wabaId}: ${msg}`);
      this.lastSyncRawResponse = { pages: rawPages, error: msg, syncDebug: { rawCount, normalizedCount, savedCount, visibleCount: 0, reasonSkipped } };
      return {
        ok: false,
        syncedCount: savedCount,
        approvedCount: 0,
        usableCount: 0,
        syncedAt: lastSyncedAt.toISOString(),
        wabaId,
        wabaName,
        messageTemplateNamespace,
        templateNames,
        templatesSummary,
        syncDebug: {
          rawCount,
          normalizedCount,
          savedCount,
          visibleCount: 0,
          reasonSkipped: [...reasonSkipped, { name: '—', reason: msg }],
        },
        error: msg,
      };
    }
  }
}
