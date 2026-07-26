import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AiPromptStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { normalizePromptFeature } from './ai-chat-default-prompts';
import { AiChatPromptResolverService } from './ai-chat-prompt-resolver.service';
import { validatePromptVariables } from './ai-chat-prompt-variables.util';

@Injectable()
export class AiChatPromptService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: AiChatPromptResolverService,
  ) {}

  async getActivePrompt(feature: string) {
    const resolved = await this.resolver.resolveActive(feature);
    return { id: resolved.id, version: resolved.version, systemPrompt: resolved.systemPrompt };
  }

  async getActiveByType(type: string) {
    return this.getActivePrompt(type);
  }

  async listPrompts(feature?: string) {
    return this.prisma.aiPromptVersion.findMany({
      where: feature ? { feature: normalizePromptFeature(feature) } : undefined,
      orderBy: [{ feature: 'asc' }, { createdAt: 'desc' }],
      take: 200,
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        approvedBy: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async getById(id: string) {
    const row = await this.prisma.aiPromptVersion.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        approvedBy: { select: { id: true, name: true, email: true } },
      },
    });
    if (!row) throw new NotFoundException('Prompt nenalezen.');
    const audit = await this.prisma.aiPromptAuditLog.findMany({
      where: { promptId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return { ...row, audit };
  }

  async createPrompt(input: {
    feature: string;
    name?: string;
    version: string;
    systemPrompt: string;
    changeDescription?: string;
    status?: AiPromptStatus;
    createdById?: string;
  }) {
    const feature = normalizePromptFeature(input.feature);
    const validation = validatePromptVariables(input.systemPrompt);
    if (!validation.valid) {
      throw new BadRequestException(`Neznámé proměnné: ${validation.unknown.join(', ')}`);
    }

    const row = await this.prisma.aiPromptVersion.create({
      data: {
        feature,
        name: input.name ?? feature,
        version: input.version,
        systemPrompt: input.systemPrompt,
        changeDescription: input.changeDescription,
        createdById: input.createdById,
        status: input.status ?? AiPromptStatus.DRAFT,
      },
    });

    await this.logAudit(row.id, 'CREATE', null, row.systemPrompt, input.changeDescription, input.createdById);
    return row;
  }

  async updatePrompt(
    id: string,
    patch: Partial<{
      name: string;
      systemPrompt: string;
      changeDescription: string;
      status: AiPromptStatus;
    }>,
    userId?: string,
  ) {
    const existing = await this.prisma.aiPromptVersion.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Prompt nenalezen.');
    if (existing.status === AiPromptStatus.ACTIVE && patch.systemPrompt) {
      throw new BadRequestException('Aktivní prompt nelze přímo upravit. Vytvořte novou verzi.');
    }
    if (patch.systemPrompt) {
      const validation = validatePromptVariables(patch.systemPrompt);
      if (!validation.valid) {
        throw new BadRequestException(`Neznámé proměnné: ${validation.unknown.join(', ')}`);
      }
    }

    const updated = await this.prisma.aiPromptVersion.update({
      where: { id },
      data: patch,
    });

    if (patch.systemPrompt) {
      await this.logAudit(
        id,
        'UPDATE',
        existing.systemPrompt,
        patch.systemPrompt,
        patch.changeDescription,
        userId,
      );
    }
    return updated;
  }

  async activatePrompt(id: string, approvedById?: string) {
    const row = await this.prisma.aiPromptVersion.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Prompt nenalezen.');
    this.resolver.validateBeforeActivate(row.systemPrompt);

    await this.prisma.aiPromptVersion.updateMany({
      where: { feature: row.feature, status: AiPromptStatus.ACTIVE },
      data: { status: AiPromptStatus.ARCHIVED, archivedAt: new Date() },
    });

    const activated = await this.prisma.aiPromptVersion.update({
      where: { id },
      data: {
        status: AiPromptStatus.ACTIVE,
        approvedById,
        activatedAt: new Date(),
        archivedAt: null,
      },
    });

    await this.logAudit(id, 'ACTIVATE', row.systemPrompt, row.systemPrompt, 'Aktivace verze', approvedById);
    return activated;
  }

  async archivePrompt(id: string, userId?: string) {
    const row = await this.prisma.aiPromptVersion.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Prompt nenalezen.');
    const updated = await this.prisma.aiPromptVersion.update({
      where: { id },
      data: { status: AiPromptStatus.ARCHIVED, archivedAt: new Date() },
    });
    await this.logAudit(id, 'ARCHIVE', row.systemPrompt, row.systemPrompt, 'Archivace', userId);
    return updated;
  }

  async duplicatePrompt(id: string, createdById?: string) {
    const row = await this.prisma.aiPromptVersion.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Prompt nenalezen.');
    const parts = row.version.split('.');
    const nextPatch = parts.length >= 3 ? `${parts[0]}.${parts[1]}.${Number(parts[2] ?? 0) + 1}` : `${row.version}-copy`;

    return this.createPrompt({
      feature: row.feature,
      name: row.name ? `${row.name} (kopie)` : undefined,
      version: nextPatch,
      systemPrompt: row.systemPrompt,
      changeDescription: `Duplikát z ${row.version}`,
      createdById,
    });
  }

  async deletePrompt(id: string, userId?: string) {
    const row = await this.prisma.aiPromptVersion.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Prompt nenalezen.');
    if (row.status === AiPromptStatus.ACTIVE) {
      throw new BadRequestException('Aktivní prompt nelze smazat. Nejprve archivujte.');
    }
    await this.logAudit(id, 'DELETE', row.systemPrompt, null, 'Smazání', userId);
    await this.prisma.aiPromptVersion.delete({ where: { id } });
    return { success: true };
  }

  async restorePreviousVersion(feature: string, userId?: string) {
    const normalized = normalizePromptFeature(feature);
    const previous = await this.prisma.aiPromptVersion.findFirst({
      where: { feature: normalized, status: AiPromptStatus.ARCHIVED },
      orderBy: { activatedAt: 'desc' },
    });
    if (!previous) throw new NotFoundException('Předchozí verze nenalezena.');
    return this.activatePrompt(previous.id, userId);
  }

  private async logAudit(
    promptId: string,
    action: string,
    previousContent: string | null,
    newContent: string | null,
    changeDescription?: string,
    performedById?: string,
  ) {
    try {
      await this.prisma.aiPromptAuditLog.create({
        data: {
          promptId,
          action,
          previousContent,
          newContent,
          changeDescription: changeDescription ?? null,
          performedById: performedById ?? null,
        },
      });
    } catch {
      // audit nesmí blokovat operaci
    }
  }
}
