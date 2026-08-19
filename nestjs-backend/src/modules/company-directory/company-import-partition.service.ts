import { Injectable } from '@nestjs/common';
import { CompanyImportPartitionStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { AresSearchFilter } from './ares.types';
import { buildPartitionKeyWithoutPage } from './ares-import-split.util';
import type { AresPartitionContext } from './ares-import-split.util';

export type PartitionSpec = {
  filter: AresSearchFilter;
  label: string;
  depth: number;
  partitionKey?: string;
};

@Injectable()
export class CompanyImportPartitionService {
  constructor(private readonly prisma: PrismaService) {}

  async createInitialPartitions(
    jobId: string,
    specs: PartitionSpec[],
    ctx: AresPartitionContext = {},
  ) {
    if (!specs.length) return [];
    const existingKeys = new Set(
      (
        await this.prisma.companyImportPartition.findMany({
          where: { jobId },
          select: { partitionKey: true },
        })
      )
        .map((row) => row.partitionKey)
        .filter((key): key is string => Boolean(key)),
    );

    const data = specs
      .map((spec, index) => ({
        jobId,
        sortOrder: index,
        depth: spec.depth,
        label: spec.label,
        partitionKey:
          spec.partitionKey ?? buildPartitionKeyWithoutPage(spec.filter, ctx),
        filtersJson: spec.filter as Prisma.InputJsonValue,
        status: CompanyImportPartitionStatus.PENDING,
      }))
      .filter((row) => {
        if (!row.partitionKey || existingKeys.has(row.partitionKey)) return false;
        existingKeys.add(row.partitionKey);
        return true;
      });

    if (!data.length) return [];

    await this.prisma.companyImportPartition.createMany({ data });
    return this.prisma.companyImportPartition.findMany({
      where: { jobId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async getPartitionBySortOrder(jobId: string, sortOrder: number) {
    return this.prisma.companyImportPartition.findFirst({
      where: { jobId, sortOrder },
    });
  }

  async getNextWorkPartition(jobId: string) {
    const running = await this.prisma.companyImportPartition.findFirst({
      where: { jobId, status: CompanyImportPartitionStatus.RUNNING },
      orderBy: { sortOrder: 'asc' },
    });
    if (running) return running;

    return this.prisma.companyImportPartition.findFirst({
      where: { jobId, status: CompanyImportPartitionStatus.PENDING },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async claimNextPartition(jobId: string, workerId: string) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = await this.prisma.companyImportPartition.findFirst({
        where: {
          jobId,
          status: CompanyImportPartitionStatus.PENDING,
        },
        orderBy: { sortOrder: 'asc' },
      });
      if (!candidate) return null;

      const claimed = await this.prisma.companyImportPartition.updateMany({
        where: {
          id: candidate.id,
          status: CompanyImportPartitionStatus.PENDING,
        },
        data: {
          status: CompanyImportPartitionStatus.RUNNING,
          lockedBy: workerId,
          lockedAt: new Date(),
          startedAt: candidate.startedAt ?? new Date(),
        },
      });
      if (claimed.count === 1) {
        return this.prisma.companyImportPartition.findUnique({ where: { id: candidate.id } });
      }
    }
    return null;
  }

  async releasePartition(partitionId: string, status: CompanyImportPartitionStatus) {
    await this.prisma.companyImportPartition.update({
      where: { id: partitionId },
      data: {
        status,
        lockedBy: null,
        lockedAt: null,
      },
    });
  }

  async getProgressStats(jobId: string) {
    const rows = await this.prisma.companyImportPartition.groupBy({
      by: ['status'],
      where: { jobId },
      _count: { _all: true },
    });
    const counts: Record<string, number> = {};
    let total = 0;
    for (const row of rows) {
      counts[row.status] = row._count._all;
      total += row._count._all;
    }
    const completed = (counts.COMPLETED ?? 0) + (counts.SPLIT ?? 0);
    const pending = counts.PENDING ?? 0;
    const running = counts.RUNNING ?? 0;
    const failed = counts.FAILED ?? 0;
    const overallPercent =
      total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
    return { total, completed, pending, running, failed, overallPercent, counts };
  }

  async splitPartition(
    partitionId: string,
    children: PartitionSpec[],
    ctx: AresPartitionContext = {},
  ): Promise<void> {
    const parent = await this.prisma.companyImportPartition.findUnique({
      where: { id: partitionId },
    });
    if (!parent) return;

    await this.prisma.companyImportPartition.update({
      where: { id: partitionId },
      data: {
        status: CompanyImportPartitionStatus.SPLIT,
        completedAt: new Date(),
      },
    });

    const siblingsAfter = await this.prisma.companyImportPartition.count({
      where: {
        jobId: parent.jobId,
        sortOrder: { gt: parent.sortOrder },
        status: { not: CompanyImportPartitionStatus.SPLIT },
      },
    });

    if (siblingsAfter > 0) {
      await this.prisma.companyImportPartition.updateMany({
        where: {
          jobId: parent.jobId,
          sortOrder: { gt: parent.sortOrder },
        },
        data: { sortOrder: { increment: children.length } },
      });
    }

    await this.prisma.companyImportPartition.createMany({
      data: children.map((child, index) => ({
        jobId: parent.jobId,
        parentId: partitionId,
        sortOrder: parent.sortOrder + index + 1,
        depth: child.depth,
        label: child.label,
        partitionKey:
          child.partitionKey ?? buildPartitionKeyWithoutPage(child.filter, ctx),
        filtersJson: child.filter as Prisma.InputJsonValue,
        status: CompanyImportPartitionStatus.PENDING,
      })),
      skipDuplicates: true,
    });
  }

  async cancelPendingPartitions(jobId: string) {
    await this.prisma.companyImportPartition.updateMany({
      where: {
        jobId,
        status: { in: [CompanyImportPartitionStatus.PENDING, CompanyImportPartitionStatus.RUNNING] },
      },
      data: { status: CompanyImportPartitionStatus.CANCELLED, completedAt: new Date() },
    });
  }

  async syncFromCheckpoint(
    jobId: string,
    specs: PartitionSpec[],
    completedBeforeIndex: number,
    ctx: AresPartitionContext = {},
  ) {
    const existing = await this.prisma.companyImportPartition.count({ where: { jobId } });
    if (existing > 0) return;

    await this.createInitialPartitions(jobId, specs, ctx);
    if (completedBeforeIndex > 0) {
      const rows = await this.prisma.companyImportPartition.findMany({
        where: { jobId },
        orderBy: { sortOrder: 'asc' },
      });
      const toComplete = rows.slice(0, completedBeforeIndex);
      for (const row of toComplete) {
        await this.prisma.companyImportPartition.update({
          where: { id: row.id },
          data: {
            status: CompanyImportPartitionStatus.COMPLETED,
            completedAt: new Date(),
          },
        });
      }
    }
  }

  async markPartitionRunning(partitionId: string) {
    await this.prisma.companyImportPartition.update({
      where: { id: partitionId },
      data: { status: CompanyImportPartitionStatus.RUNNING, startedAt: new Date() },
    });
  }

  async completePartition(
    partitionId: string,
    stats?: { cursor?: number; processedCount?: number },
  ) {
    await this.prisma.companyImportPartition.update({
      where: { id: partitionId },
      data: {
        status: CompanyImportPartitionStatus.COMPLETED,
        completedAt: new Date(),
        ...(stats?.cursor != null ? { cursor: stats.cursor } : {}),
        ...(stats?.processedCount != null ? { processedCount: stats.processedCount } : {}),
      },
    });
  }

  async completeRunningPartitions(jobId: string) {
    await this.prisma.companyImportPartition.updateMany({
      where: { jobId, status: CompanyImportPartitionStatus.RUNNING },
      data: {
        status: CompanyImportPartitionStatus.COMPLETED,
        completedAt: new Date(),
      },
    });
  }

  async repairFailedJob(jobId: string) {
    const failed = await this.prisma.companyImportPartition.findMany({
      where: { jobId, status: CompanyImportPartitionStatus.FAILED },
      orderBy: { sortOrder: 'asc' },
    });
    for (const row of failed) {
      await this.prisma.companyImportPartition.update({
        where: { id: row.id },
        data: {
          status: CompanyImportPartitionStatus.PENDING,
          error: null,
          cursor: 0,
        },
      });
    }
    const splitParents = await this.prisma.companyImportPartition.findMany({
      where: { jobId, status: CompanyImportPartitionStatus.SPLIT },
      include: { children: true },
    });
    for (const parent of splitParents) {
      if (parent.children.length === 0) {
        await this.prisma.companyImportPartition.update({
          where: { id: parent.id },
          data: {
            status: CompanyImportPartitionStatus.PENDING,
            cursor: 0,
            error: null,
          },
        });
      }
    }
  }
}
